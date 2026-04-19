"""Real-world incident replay demo for authenticity-memory.

Flow:
1) baseline onboarding challenge is accepted
2) clone attack triggers escalation
3) repeated urgency attack moves user into review/deny path
4) support-assisted callback recovers trust after human review
5) branch replay runs a drift update and writes an audit artifact
"""

import os
import sys
import json
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.aml.db import MemoryStore, StoreConfig
from src.aml.service import AMLService
from src.aml.vector import json_dump_vector

DB_PATH = os.environ.get("AML_SQLITE_PATH", "./data/aml_memory.sqlite")
TENANT_ID = "t-geo"


def banner(label: str):
    print("\n" + "=" * 90)
    print(label)
    print("=" * 90)


def _print_json(payload):
    print(json.dumps(payload, indent=2, default=str))


def _clamp_score(value: float) -> float:
    if value is None:
        return 0.0
    return max(0.0, min(1.0, float(value)))


def reset_for_demo(store: MemoryStore):
    # Full reset keeps the demo deterministic and short.
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
        (TENANT_ID, "Dating Platform (Demo)", "Aubric Hackathon Demo", "US"),
    )

    users = [
        ("c-8821", "verified"),
        ("c-3312", "new-user"),
        ("c-9007", "trusted"),
    ]
    for customer_id, tier in users:
        store.execute(
            "INSERT INTO customers (customer_id, tenant_id, risk_tier, customer_type) VALUES (?, ?, ?, 'consumer')",
            (customer_id, TENANT_ID, tier),
        )

    for risk_tier, auth_thr, attack_thr in [
        ("verified", 0.23, 0.20),
        ("new-user", 0.26, 0.24),
        ("trusted", 0.20, 0.18),
    ]:
        store.execute(
            """
            INSERT INTO procedural_policies
            (tenant_id, risk_tier, policy_version, threshold_auth, threshold_attack, escalation_rule, is_active, created_by)
            VALUES (?, ?, 'p-v001', ?, ?, '{"review_if_auth_gap": 0.22, "deny_if_attack_match": 0.20}', 1, 'seed-script')
            """,
            (TENANT_ID, risk_tier, auth_thr, attack_thr),
        )


def seed_embeddings(store: MemoryStore):
    # Keep all vectors short for quick math and deterministic outputs.
    base_voice = [0.6, 0.2, 0.15, 0.04, 0.9, 0.12, 0.43, 0.78, 0.52, 0.09, 0.31, 0.11, 0.66, 0.27, 0.8, 0.51]
    cloned_attack = [0.2, 0.11, 0.93, 0.45, 0.12, 0.77, 0.61, 0.12, 0.39, 0.95, 0.74, 0.22, 0.31, 0.68, 0.08, 0.27]

    store.execute(
        "INSERT INTO authentic_fingerprints (tenant_id, customer_id, modality, modality_version, embedding, source_event_id, is_current, quality_score) VALUES (?, ?, 'voice', 'v1', ?, 'seed-auth', 1, 0.99)",
        (TENANT_ID, "c-8821", json_dump_vector(base_voice)),
    )
    for attack_family, vector in [
        ("clone-v1", cloned_attack),
        ("lipsync-v2", [min(1.0, x + 0.02) for x in cloned_attack]),
    ]:
        store.execute(
            """
            INSERT INTO attack_fingerprints
            (tenant_scope, modality, generator_family, attack_family, embedding, source_url, severity_band)
            VALUES ('global', 'voice', 'DeepFakeLab', ?, ?, 'https://example.com/public-model', 'high')
            """,
            (attack_family, json_dump_vector(vector)),
        )

    return base_voice, cloned_attack


def create_open_challenge(
    store: MemoryStore,
    challenge_id: str,
    customer_id: str,
    risk_tier: str,
    embedding,
    asset_id: str,
    raw_features: dict,
):
    raw_json = json.dumps(raw_features) if isinstance(raw_features, dict) else str(raw_features or {})
    store.execute(
        """
        INSERT INTO active_challenges
        (challenge_id, tenant_id, customer_id, modality, asset_id, status, current_embedding, raw_features, risk_tier)
        VALUES (?, ?, ?, 'voice', ?, 'open', ?, ?, ?)
        """,
        (
            challenge_id,
            TENANT_ID,
            customer_id,
            asset_id,
            json_dump_vector(embedding),
            raw_json,
            risk_tier,
        ),
    )


def run_world_step(svc: AMLService, row: dict):
    out = svc.decide(tenant_id=TENANT_ID, challenge_id=row["challenge_id"], channel=row["channel"])
    event_payload = {
        "tenant_id": TENANT_ID,
        "customer_id": row["customer_id"],
        "challenge_id": row["challenge_id"],
        "modality": "voice",
        "asset_hash": f"sha256:{row['challenge_id']}",
        "verdict": out["decision"],
        "confidence": _clamp_score(1.0 - float(out["scores"]["auth_distance"])),
        "authenticity_score": _clamp_score(1.0 - float(out["scores"]["attack_distance"])),
        "explainability_json": {
            "decision": out["decision"],
            "reason": out["reason"],
            "query_ms": out["query_ms"],
            "scenario": row["label"],
            "incident_phase": row["phase"],
            "notes": row["notes"],
            "policy_version": out["applied_policy"],
        },
        "human_outcome": "auto_approved" if out["decision"] == "allow" else "review_required",
        "ground_truth": row["ground_truth"],
        "ts": row["ts"],
        "branch_run_id": None,
        "auth_distance": out["scores"]["auth_distance"],
        "attack_distance": out["scores"]["attack_distance"],
    }

    logged = svc.log_episode(event_payload)
    return out, logged["event_id"]


def run_world_demo():
    Path("./data").mkdir(parents=True, exist_ok=True)
    store = MemoryStore(StoreConfig(backend="sqlite", db_path=DB_PATH))
    svc = AMLService(store)

    banner("Aubric AML — Real-world Dating Platform Incident Scenario")
    reset_for_demo(store)
    base_voice, clone_vec = seed_embeddings(store)

    # End-to-end scenario: one account under progressive attack.
    now = datetime.utcnow()
    scenario_rows = [
        {
            "challenge_id": "ch-001",
            "label": "Profile setup: KYC onboarding call",
            "phase": "onboarding",
            "customer_id": "c-8821",
            "embedding": base_voice,
            "asset_id": "asset-selfie-001",
            "ground_truth": "confirmed_authentic",
            "channel": "kyc_voice",
            "notes": "new user signs up with selfie+voice + live code",
            "ts": (now - timedelta(minutes=20)).isoformat() + "Z",
            "raw_features": {
                "incident_id": "INC-4431",
                "source": "identity-onboarding",
                "risk_context": "first_verification",
            },
        },
        {
            "challenge_id": "ch-002",
            "label": "Profile takeover attempt #1",
            "phase": "attack",
            "customer_id": "c-8821",
            "embedding": [0.57, 0.18, 0.34, 0.2, 0.31, 0.22, 0.51, 0.75, 0.64, 0.11, 0.39, 0.32, 0.56, 0.29, 0.82, 0.49],
            "asset_id": "asset-call-002",
            "ground_truth": "confirmed_fraud",
            "channel": "chat_voice",
            "notes": "deepfake clone appears with urgent account recovery intent",
            "ts": (now - timedelta(minutes=12)).isoformat() + "Z",
            "raw_features": {
                "incident_id": "INC-4431",
                "source": "chat-fraud-attempt",
                "source_ip": "185.42.11.7",
                "risk_context": "account-takeover",
            },
        },
        {
            "challenge_id": "ch-003",
            "label": "Financial escalation after auth challenge",
            "phase": "attack",
            "customer_id": "c-8821",
            "embedding": [x + 0.05 for x in clone_vec],
            "asset_id": "asset-call-003",
            "ground_truth": "confirmed_fraud",
            "channel": "chat_voice",
            "notes": "attacker requests wire-transfer within 10 minutes, same clone family",
            "ts": (now - timedelta(minutes=4)).isoformat() + "Z",
            "raw_features": {
                "incident_id": "INC-4431",
                "source": "payment-scam-scenario",
                "risk_context": "financial-urgency",
            },
        },
        {
            "challenge_id": "ch-004",
            "label": "Support-mediated recovery call",
            "phase": "recovery",
            "customer_id": "c-8821",
            "embedding": base_voice,
            "asset_id": "asset-call-004",
            "ground_truth": "confirmed_authentic",
            "channel": "live_call",
            "notes": "real user re-verifies after support intervention with fresh biometric proof",
            "ts": now.isoformat() + "Z",
            "raw_features": {
                "incident_id": "INC-4431",
                "source": "human-support",
                "risk_context": "recovery",
            },
        },
    ]

    for row in scenario_rows:
        create_open_challenge(
            store=store,
            challenge_id=row["challenge_id"],
            customer_id=row["customer_id"],
            risk_tier="verified",
            embedding=row["embedding"],
            asset_id=row["asset_id"],
            raw_features=row["raw_features"],
        )

    print("SIMULATION: from first signup to live attack to recovery, in one challenge chain")
    banner("WORLD SCENE: Incident Timeline")
    for idx, row in enumerate(scenario_rows, start=1):
        print(f"\nSTEP {idx}: {row['phase'].upper()} - {row['label']}")
        print(f"Notes: {row['notes']}")

        out, event_id = run_world_step(svc, row)
        _print_json(
            {
                "challenge_id": row["challenge_id"],
                "decision": out["decision"],
                "reason": out["reason"],
                "scores": out["scores"],
                "applied_policy": out["applied_policy"],
                "query_ms": out["query_ms"],
                "episodic_event_id": event_id,
            }
        )

    banner("COMPLIANCE-STYLE DRIFT SIGNAL + MEMORY UPDATE LOOP")
    print("Signal: clone attacks are trending in the verified tier and were previously false-negative in 2nd wave.")
    cycle = svc.run_update_cycle(
        tenant_id=TENANT_ID,
        window_days=90,
        drift_signal="verified_voice_clone_false_negatives_up_2x",
        run_on_exa_intel=True,
    )
    _print_json(cycle)

    banner("AUDIT ARTIFACT EXPORT")
    audit = svc.audit_bundle(
        tenant_id=TENANT_ID,
        branch_run_id=cycle["branch_run_id"],
        fmt="json",
    )
    print(f"Memory update cycle: {cycle['recommendation']} ({cycle['branch_name']})")
    print(f"Audit packet: {audit['path']}")
    print(f"Replay decisions evaluated: {cycle['replay_size']}")

    banner("KILLER QUERY (judge-facing evidence)")
    from src.aml.service import KILLER_QUERY_TEMPLATE

    print(KILLER_QUERY_TEMPLATE)

    banner("END")
    store.close()


if __name__ == "__main__":
    run_world_demo()
