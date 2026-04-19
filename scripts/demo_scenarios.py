"""Scenario fixtures and reusable demo orchestration for Aubric AML.

This module provides deterministic, end-to-end incident data for both:
- the CLI demo runner (`scripts/run_demo.py`)
- the HTTP demo server used by the frontend
"""

from datetime import datetime, timedelta
import json
from typing import Dict, List, Optional, Tuple

from src.aml.db import MemoryStore, StoreConfig
from src.aml.service import AMLService
from src.aml.vector import json_dump_vector, safe_float, to_float_list

TENANT_ID = "t-geo"
TENANT_NAME = "Dating Platform (Demo)"
LEGIT_CUSTOMERS = ["c-8821", "c-3312", "c-9007"]


def _shift(vec: List[float], delta: float) -> List[float]:
    return [round(x + delta, 6) for x in vec]


def _scenario_phases() -> List[Dict]:
    """Return deterministic real-world incident phases."""
    base_voice = [
        0.6,
        0.2,
        0.15,
        0.04,
        0.9,
        0.12,
        0.43,
        0.78,
        0.52,
        0.09,
        0.31,
        0.11,
        0.66,
        0.27,
        0.8,
        0.51,
    ]
    clone_seed = [
        0.2,
        0.11,
        0.93,
        0.45,
        0.12,
        0.77,
        0.61,
        0.12,
        0.39,
        0.95,
        0.74,
        0.22,
        0.31,
        0.68,
        0.08,
        0.27,
    ]

    return [
        {
            "challenge_id": "ch-001",
            "label": "Profile setup: KYC onboarding call",
            "phase": "onboarding",
            "scenario_id": "dating_takeover",
            "incident_id": "INC-4431",
            "customer_id": "c-8821",
            "risk_tier": "verified",
            "channel": "kyc_voice",
            "modality": "voice",
            "asset_id": "asset-selfie-001",
            "amount_usd": None,
            "ground_truth": "confirmed_authentic",
            "notes": "new user signs up with selfie + voice challenge",
            "raw_features": {
                "source": "identity-onboarding",
                "risk_context": "first_verification",
                "ticket": "TKT-9912",
                "device": "ios/16.5|iPhone15,3",
                "geo": "US / AS123",
            },
            "embedding": base_voice,
        },
        {
            "challenge_id": "ch-002",
            "label": "Profile takeover attempt #1",
            "phase": "attack",
            "scenario_id": "dating_takeover",
            "incident_id": "INC-4431",
            "customer_id": "c-8821",
            "risk_tier": "verified",
            "channel": "chat_voice",
            "modality": "voice",
            "asset_id": "asset-call-002",
            "amount_usd": None,
            "ground_truth": "confirmed_fraud",
            "notes": "deepfake clone appears with urgency and account-recovery phrasing",
            "raw_features": {
                "source": "chat-fraud-attempt",
                "source_ip": "185.42.11.7",
                "risk_context": "account-takeover",
                "ticket": "TKT-9912",
                "device": "android/13|Pixel 7",
                "geo": "RU / AS9009",
            },
            "embedding": _shift(base_voice, 0.045),
        },
        {
            "challenge_id": "ch-003",
            "label": "Financial escalation after auth challenge",
            "phase": "attack",
            "scenario_id": "dating_takeover",
            "incident_id": "INC-4431",
            "customer_id": "c-8821",
            "risk_tier": "verified",
            "channel": "chat_voice",
            "modality": "voice",
            "asset_id": "asset-call-003",
            "amount_usd": 250_000,
            "ground_truth": "confirmed_fraud",
            "notes": "attacker requests wire transfer inside 10 minutes on same clone family",
            "raw_features": {
                "source": "payment-scam-scenario",
                "risk_context": "financial-urgency",
                "ticket": "TKT-9912",
                "device": "android/13|Pixel 7",
                "geo": "RU / AS9009",
            },
            "embedding": _shift(clone_seed, 0.05),
        },
        {
            "challenge_id": "ch-004",
            "label": "Support-mediated recovery call",
            "phase": "recovery",
            "scenario_id": "dating_takeover",
            "incident_id": "INC-4431",
            "customer_id": "c-8821",
            "risk_tier": "verified",
            "channel": "live_call",
            "modality": "voice",
            "asset_id": "asset-call-004",
            "amount_usd": None,
            "ground_truth": "confirmed_authentic",
            "notes": "real user re-verifies after support callback with fresh voice proof",
            "raw_features": {
                "source": "human-support",
                "risk_context": "recovery",
                "ticket": "TKT-9912",
                "device": "ios/16.5|iPhone15,3",
                "geo": "US / AS123",
            },
            "embedding": base_voice,
        },
    ]


def _attack_fingerprints():
    return [
        {
            "tenant_scope": "global",
            "modality": "voice",
            "generator_family": "DeepFakeLab",
            "attack_family": "clone-v1",
            "embedding": [
                0.2,
                0.11,
                0.93,
                0.45,
                0.12,
                0.77,
                0.61,
                0.12,
                0.39,
                0.95,
                0.74,
                0.22,
                0.31,
                0.68,
                0.08,
                0.27,
            ],
            "source_url": "https://example.com/public-model",
            "severity_band": "high",
            "exa_observation_id": "exa://demo/clone-v1",
        },
        {
            "tenant_scope": "global",
            "modality": "voice",
            "generator_family": "DeepFakeLab",
            "attack_family": "lipsync-v2",
            "embedding": _shift(
                [
                    0.2,
                    0.11,
                    0.93,
                    0.45,
                    0.12,
                    0.77,
                    0.61,
                    0.12,
                    0.39,
                    0.95,
                    0.74,
                    0.22,
                    0.31,
                    0.68,
                    0.08,
                    0.27,
                ],
                0.02,
            ),
            "source_url": "https://example.com/public-model",
            "severity_band": "high",
            "exa_observation_id": "exa://demo/lipsync-v2",
        },
    ]


def scenario_catalog() -> Dict[str, Dict]:
    return {
        "dating_takeover": {
            "id": "dating_takeover",
            "name": "Dating platform takeover attempt",
            "description": "Identity onboarding, synthetic voice takeover, wire-transfer escalation, and support recovery.",
            "phases": _scenario_phases(),
        },
    }


def _build_store(backend: str = "sqlite", db_path: Optional[str] = None, database_url: Optional[str] = None):
    if backend == "tidb":
        return MemoryStore(StoreConfig(backend="tidb", url=database_url))
    return MemoryStore(StoreConfig(backend="sqlite", db_path=db_path or "./data/aml_memory.sqlite"))


def reset_for_demo(store: MemoryStore, tenant_id: str = TENANT_ID):
    # Full deterministic reset to keep each demo run comparable.
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
        (tenant_id, TENANT_NAME, "Aubric Hackathon Demo", "US"),
    )

    customers = [
        ("c-8821", "verified"),
        ("c-3312", "new-user"),
        ("c-9007", "trusted"),
    ]
    for customer_id, risk_tier in customers:
        store.execute(
            "INSERT INTO customers (customer_id, tenant_id, risk_tier, customer_type) VALUES (?, ?, ?, 'consumer')",
            (customer_id, tenant_id, risk_tier),
        )

    policy_rows = [
        ("verified", 0.23, 0.20),
        ("new-user", 0.26, 0.24),
        ("trusted", 0.20, 0.18),
    ]
    for risk_tier, auth_thr, attack_thr in policy_rows:
        store.execute(
            """
            INSERT INTO procedural_policies
            (tenant_id, risk_tier, policy_version, threshold_auth, threshold_attack, escalation_rule, is_active, created_by)
            VALUES (?, ?, 'p-v001', ?, ?, '{\"review_if_auth_gap\": 0.22, \"deny_if_attack_match\": 0.20}', 1, 'seed-script')
            """,
            (tenant_id, risk_tier, auth_thr, attack_thr),
        )

    # Baseline authentic fingerprint.
    base_voice = _scenario_phases()[0]["embedding"]
    store.execute(
        "INSERT INTO authentic_fingerprints (tenant_id, customer_id, modality, modality_version, embedding, source_event_id, is_current, quality_score) VALUES (?, ?, 'voice', 'v1', ?, 'seed-auth', 1, 0.99)",
        (tenant_id, "c-8821", json_dump_vector(base_voice)),
    )

    for fp in _attack_fingerprints():
        store.execute(
            """
            INSERT INTO attack_fingerprints
            (tenant_scope, modality, generator_family, attack_family, embedding, source_url, exa_observation_id, severity_band)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fp["tenant_scope"],
                fp["modality"],
                fp["generator_family"],
                fp["attack_family"],
                json_dump_vector(fp["embedding"]),
                fp["source_url"],
                fp["exa_observation_id"],
                fp["severity_band"],
            ),
        )


def create_open_challenge(store: MemoryStore, tenant_id: str, phase: Dict, now: Optional[datetime] = None):
    now = now or datetime.utcnow()
    raw_features = dict(phase.get("raw_features") or {})
    for key in [
        "phase",
        "label",
        "incident_id",
        "ground_truth",
        "notes",
        "source",
        "source_ip",
        "risk_context",
        "device",
        "geo",
        "ticket",
        "amount_usd",
    ]:
        if key in phase:
            raw_features[key] = phase[key]
    raw_features.setdefault("phase", phase.get("phase"))
    raw_features.setdefault("scenario_id", phase.get("scenario_id"))
    raw_features["asset_hash"] = f"sha256:{phase['challenge_id']}"
    raw_features["ts"] = (now.isoformat() + "Z")

    store.execute(
        """
        INSERT INTO active_challenges
        (challenge_id, tenant_id, customer_id, modality, asset_id, status, current_embedding, raw_features, risk_tier)
        VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)
        """,
        (
            phase["challenge_id"],
            tenant_id,
            phase["customer_id"],
            phase["modality"],
            phase["asset_id"],
            json_dump_vector(phase["embedding"]),
            json.dumps(raw_features),
            phase["risk_tier"],
        ),
    )

    return phase["challenge_id"]


def seed_demo_scenario(
    store: MemoryStore,
    scenario_id: str = "dating_takeover",
    tenant_id: str = TENANT_ID,
    now: Optional[datetime] = None,
) -> List[Dict]:
    reset_for_demo(store, tenant_id=tenant_id)

    scenario = scenario_catalog().get(scenario_id)
    if not scenario:
        raise ValueError(f"Unknown scenario: {scenario_id}")

    start = now or datetime.utcnow()
    phases = []
    for idx, phase in enumerate(scenario["phases"], start=1):
        phase = dict(phase)
        phase["tenant_id"] = tenant_id
        phase["ts"] = (start - timedelta(minutes=(len(scenario["phases"]) - idx) * 10)).isoformat() + "Z"
        create_open_challenge(store, tenant_id=tenant_id, phase=phase, now=start)
        phases.append(phase)
    store.conn.commit()
    return phases


def list_scenarios(store: MemoryStore) -> List[Dict]:
    return [
        {
            "id": scenario["id"],
            "name": scenario["name"],
            "description": scenario["description"],
            "phases": [
                {
                    "index": i + 1,
                    "challenge_id": p["challenge_id"],
                    "label": p["label"],
                    "phase": p["phase"],
                    "notes": p["notes"],
                }
                for i, p in enumerate(scenario["phases"])
            ],
        }
        for scenario in scenario_catalog().values()
    ]


def run_phase(
    store: MemoryStore,
    svc: AMLService,
    tenant_id: str,
    challenge_id: str,
    channel: Optional[str] = None,
) -> Dict:
    challenge = store.get_challenge(challenge_id=challenge_id, tenant_id=tenant_id)
    if not challenge:
        raise ValueError("challenge not found")

    out = svc.decide(tenant_id=tenant_id, challenge_id=challenge_id, channel=channel)
    row_raw = _coerce_raw_features(challenge.get("raw_features"))

    confidence = safe_float(1.0 - float(out["scores"]["auth_distance"]))
    auth_score = safe_float(1.0 - float(out["scores"]["attack_distance"]))

    event_payload = {
        "tenant_id": tenant_id,
        "customer_id": challenge["customer_id"],
        "challenge_id": challenge["challenge_id"],
        "modality": challenge["modality"],
        "asset_hash": row_raw.get("asset_hash", f"sha256:{challenge['challenge_id']}"),
        "verdict": out["decision"],
        "confidence": confidence,
        "authenticity_score": auth_score,
        "explainability_json": {
            "decision": out["decision"],
            "reason": out["reason"],
            "query_ms": out["query_ms"],
            "scenario": row_raw.get("phase", "unknown"),
            "incident_id": row_raw.get("incident_id", challenge["challenge_id"]),
            "tenant_id": tenant_id,
            "phase": row_raw.get("risk_context", "unknown"),
        },
        "human_outcome": "auto_approved" if out["decision"] == "allow" else "review_required",
        "ground_truth": row_raw.get("ground_truth", "unknown"),
        "ts": row_raw.get("ts"),
        "branch_run_id": None,
        "auth_distance": out["scores"].get("auth_distance"),
        "attack_distance": out["scores"].get("attack_distance"),
    }
    logged = svc.log_episode(event_payload)
    event_id = logged.get("event_id") if isinstance(logged, dict) else None

    decision = out.get("decision")
    phase_label = row_raw.get("phase")
    consolidated = False
    if decision == "allow" and phase_label == "recovery":
        try:
            current_embedding = to_float_list(challenge.get("current_embedding"))
        except Exception:
            current_embedding = []
        if current_embedding:
            svc.upsert_authentic_fingerprint(
                tenant_id=tenant_id,
                customer_id=challenge["customer_id"],
                modality=challenge["modality"],
                embedding=current_embedding,
                source_event_id=event_id,
                quality_score=0.95,
            )
            consolidated = True

    challenge_view = {
        "challenge_id": challenge["challenge_id"],
        "tenant": TENANT_NAME,
        "tenant_id": tenant_id,
        "customer_id": challenge["customer_id"],
        "asset_id": challenge["asset_id"],
        "status": challenge["status"],
        "modality": challenge["modality"],
        "channel": channel or row_raw.get("source", "voice_api"),
        "ts": row_raw.get("ts"),
        "raw_features": row_raw,
        "hash": row_raw.get("asset_hash", f"sha256:{challenge['challenge_id']}"),
    }

    return {
        "challenge": challenge_view,
        "phase": row_raw,
        "decision": out,
        "consolidated": consolidated,
    }


def _coerce_raw_features(raw):
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {"raw_features": raw}
    return {"raw_features": str(raw)}


def run_scenario(
    backend: str = "sqlite",
    db_path: Optional[str] = None,
    database_url: Optional[str] = None,
    tenant_id: str = TENANT_ID,
    scenario_id: str = "dating_takeover",
    run_update_cycle: bool = True,
    reset: bool = True,
) -> Dict:
    store = _build_store(backend=backend, db_path=db_path, database_url=database_url)
    svc = AMLService(store)
    try:
        phases = scenario_catalog().get(scenario_id, {}).get("phases", [])
        if not phases:
            raise ValueError(f"Unknown scenario: {scenario_id}")

        if reset:
            seeded = seed_demo_scenario(store=store, scenario_id=scenario_id, tenant_id=tenant_id)
        else:
            seeded = phases

        results = []
        for phase in seeded:
            challenge_id = phase["challenge_id"]
            step = run_phase(store=store, svc=svc, tenant_id=tenant_id, challenge_id=challenge_id, channel=phase["channel"])
            row = dict(step)
            row["challenge_id"] = challenge_id
            row["label"] = phase["label"]
            row["phase"] = phase["phase"]
            results.append(row)

        summary = {
            "scenario_id": scenario_id,
            "scenario_name": scenario_catalog()[scenario_id]["name"],
            "steps": results,
        }

        if run_update_cycle:
            cycle = svc.run_update_cycle(
                tenant_id=tenant_id,
                window_days=90,
                drift_signal="verified_voice_clone_false_negatives_up_2x",
                run_on_exa_intel=True,
            )
            summary["update_cycle"] = cycle
            summary["audit"] = svc.audit_bundle(
                tenant_id=tenant_id,
                branch_run_id=cycle["branch_run_id"],
                fmt="json",
            )

        return summary
    finally:
        store.close()


if __name__ == "__main__":
    output = run_scenario()
    print(json.dumps(output, indent=2))
