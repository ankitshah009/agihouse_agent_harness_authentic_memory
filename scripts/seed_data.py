import argparse
import json
from datetime import datetime, timedelta

from src.aml.db import MemoryStore, StoreConfig
from src.aml.vector import cosine_distance, json_dump_vector


def synth_vector(base, shift=0.0):
    return [round(x + shift, 6) for x in base]


def run_seed(db_path: str):
    cfg = StoreConfig(backend="sqlite", db_path=db_path)
    store = MemoryStore(cfg)

    # Reset demo state
    for table in [
        "audit_events",
        "branch_trial_results",
        "branch_runs",
        "episodic_events",
        "procedural_policies",
        "attack_fingerprints",
        "authentic_fingerprints",
        "active_challenges",
        "customers",
        "tenants",
    ]:
        store.execute(f"DELETE FROM {table}")
    try:
        store.execute("DELETE FROM sqlite_sequence")
    except Exception:
        pass

    store.execute(
        "INSERT INTO tenants (tenant_id, tenant_name, legal_entity, compliance_region) VALUES (?, ?, ?, ?)",
        ("t-geo", "Dating Platform Beta", "Demo Cohort", "US"),
    )

    customers = [
        ("c-8821", "tier-verified"),
        ("c-3312", "new-user"),
        ("c-9007", "trusted"),
    ]
    for cid, tier in customers:
        store.execute(
            "INSERT INTO customers (customer_id, tenant_id, risk_tier, customer_type) VALUES (?, 't-geo', ?, 'consumer')",
            (cid, tier),
        )

    policies = [
        ("tier-verified", 0.24, 0.22, {"review_if_auth_gap": 0.24, "deny_if_attack_match": 0.20}),
        ("new-user", 0.26, 0.24, {"review_if_auth_gap": 0.26, "deny_if_attack_match": 0.22}),
        ("trusted", 0.22, 0.20, {"review_if_auth_gap": 0.22, "deny_if_attack_match": 0.18}),
    ]
    for risk_tier, auth_thr, attack_thr, rule in policies:
        store.execute(
            """
            INSERT INTO procedural_policies
            (tenant_id, risk_tier, policy_version, threshold_auth, threshold_attack, escalation_rule, is_active, created_by)
            VALUES (?, ?, 'p-v001', ?, ?, ?, 1, 'seed-script')
            """,
            ("t-geo", risk_tier, auth_thr, attack_thr, json.dumps(rule)),
        )

    base_voice = [0.6, 0.2, 0.15, 0.04, 0.9, 0.12, 0.43, 0.78, 0.52, 0.09, 0.31, 0.11, 0.66, 0.27, 0.8, 0.51]
    attack_voice = [0.2, 0.11, 0.93, 0.45, 0.12, 0.77, 0.61, 0.12, 0.39, 0.95, 0.74, 0.22, 0.31, 0.68, 0.08, 0.27]

    store.execute(
        "INSERT INTO authentic_fingerprints (tenant_id, customer_id, modality, modality_version, embedding, source_event_id, is_current, quality_score) VALUES (?, ?, 'voice', 'v1', ?, 'seed-auth', 1, 0.96)",
        ("t-geo", "c-8821", json_dump_vector(base_voice)),
    )

    for attack in [
        ("voice", "DeepFakeLab", "clone-v1", attack_voice),
        ("voice", "OpenGenerator", "lipsync-v2", synth_vector(attack_voice, 0.01)),
    ]:
        store.execute(
            """
            INSERT INTO attack_fingerprints
            (tenant_scope, modality, generator_family, attack_family, embedding, source_url, severity_band)
            VALUES ('global', ?, ?, ?, ?, 'https://example.com/public-model', 'high')
            """,
            (attack[0], attack[1], attack[2], json_dump_vector(attack[3])),
        )

    now = datetime.utcnow()
    scenarios = [
        {
            "challenge_id": "ch-001",
            "customer_id": "c-8821",
            "asset_id": "asset-vid-001",
            "risk_tier": "tier-verified",
            "embedding": synth_vector(base_voice, 0.00),
            "truth": "confirmed_authentic",
            "asset_hash": "sha256:baseline",
            "verdict": "allow",
        },
        {
            "challenge_id": "ch-002",
            "customer_id": "c-8821",
            "asset_id": "asset-vid-002",
            "risk_tier": "tier-verified",
            "embedding": synth_vector(base_voice, 0.045),
            "truth": "confirmed_fraud",
            "asset_hash": "sha256:clone-hit",
            "verdict": "review",
        },
        {
            "challenge_id": "ch-003",
            "customer_id": "c-9007",
            "asset_id": "asset-vid-003",
            "risk_tier": "trusted",
            "embedding": synth_vector(base_voice, 0.24),
            "truth": "confirmed_fraud",
            "asset_hash": "sha256:generator-hit",
            "verdict": "deny",
        },
    ]

    for i, row in enumerate(scenarios, start=1):
        raw_features = json.dumps({"source": "seed", "scenario": row["challenge_id"]})
        store.execute(
            """
            INSERT INTO active_challenges
            (challenge_id, tenant_id, customer_id, modality, asset_id, status, current_embedding, raw_features, risk_tier)
            VALUES (?, 't-geo', ?, 'voice', ?, 'open', ?, ?, ?)
            """,
            (
                row["challenge_id"],
                row["customer_id"],
                row["asset_id"],
                json_dump_vector(row["embedding"]),
                raw_features,
                row["risk_tier"],
            ),
        )

        auth_d = cosine_distance(row["embedding"], base_voice)
        atk_d = min(
            cosine_distance(row["embedding"], attack_voice),
            cosine_distance(row["embedding"], synth_vector(attack_voice, 0.01)),
        )

        ts = (now - timedelta(days=5 * i)).isoformat() + "Z"
        store.execute(
            """
            INSERT INTO episodic_events
            (event_id, tenant_id, customer_id, challenge_id, modality, asset_hash, verdict, confidence,
             authenticity_score, explainability_json, ground_truth, auth_distance, attack_distance, ts, branch_run_id)
            VALUES (?, 't-geo', ?, ?, 'voice', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"evt-{i:03}",
                row["customer_id"],
                row["challenge_id"],
                row["asset_hash"],
                row["verdict"],
                0.93,
                0.95 if row["verdict"] != "deny" else 0.97,
                json.dumps({"seed": True, "scenario": row["challenge_id"]}),
                row["truth"],
                auth_d,
                atk_d,
                ts,
                None,
            ),
        )

    store.conn.commit()
    store.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default="./data/aml_memory.sqlite")
    args = parser.parse_args()
    run_seed(args.db)
    print(f"Seeded sqlite DB at {args.db}")


if __name__ == "__main__":
    main()
