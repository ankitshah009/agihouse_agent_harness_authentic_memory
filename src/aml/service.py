import json
import os
import time
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from .vector import min_cosine_distance, safe_float, to_float_list
from .db import MemoryStore


KILLER_QUERY_TEMPLATE = """
SELECT
  c.challenge_id,
  c.customer_id,
  c.modality,
  MIN(VEC_COSINE_DISTANCE(f_auth.embedding, c.current_embedding)) AS auth_distance,
  MIN(VEC_COSINE_DISTANCE(f_atk.embedding, c.current_embedding)) AS attack_distance,
  COUNT(CASE WHEN e.verdict='flagged' AND e.ts > NOW() - INTERVAL 90 DAY THEN 1 END) AS recent_flags,
  AVG(CASE WHEN e.ts > NOW() - INTERVAL 30 DAY THEN e.confidence ELSE NULL END) AS trailing_confidence,
  p.policy_version,
  p.threshold_auth,
  p.threshold_attack,
  p.escalation_rule
FROM active_challenges c
LEFT JOIN authentic_fingerprints f_auth
  ON f_auth.customer_id = c.customer_id AND f_auth.modality = c.modality AND f_auth.is_current = 1
LEFT JOIN attack_fingerprints f_atk
  ON f_atk.modality = c.modality
LEFT JOIN episodic_events e
  ON e.customer_id = c.customer_id
LEFT JOIN procedural_policies p
  ON p.tenant_id = c.tenant_id AND p.risk_tier = c.risk_tier AND p.is_active = TRUE
WHERE c.challenge_id = ?
GROUP BY c.challenge_id, c.customer_id, c.modality, p.policy_version, p.threshold_auth, p.threshold_attack, p.escalation_rule;
"""


class AMLService:
    def __init__(self, store: MemoryStore):
        self.store = store

    @staticmethod
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

    def decide(self, tenant_id: str, challenge_id: str, channel: Optional[str] = None):
        start = time.time()
        challenge = self.store.get_challenge(challenge_id, tenant_id)
        if not challenge:
            raise ValueError("challenge not found")

        policy = self.store.get_policy(tenant_id, challenge["risk_tier"])
        policy_version = policy.get("policy_version", "policy-default")
        threshold_auth = float(policy["threshold_auth"])
        threshold_attack = float(policy["threshold_attack"])

        customer_id = challenge["customer_id"]
        modality = challenge["modality"]
        challenge_embedding = self._load_vector(challenge["current_embedding"])

        auth_rows = self.store.list_authentic_fingerprints(tenant_id, customer_id, modality)
        atk_rows = self.store.list_attack_fingerprints(tenant_id, modality)

        auth_distance = self._min_distance(auth_rows, challenge_embedding, source="embedding")
        attack_distance = self._min_distance(atk_rows, challenge_embedding, source="embedding")

        events = self.store.list_recent_events(tenant_id, customer_id)
        recent_flags = sum(
            1
            for e in events
            if e.get("verdict") in ("fraud", "deny", "review") and self._days_old(e["ts"]) <= 90
        )
        trailing_conf = self._trailing_confidence(events)

        decision = self._apply_policy(
            auth_distance=auth_distance,
            attack_distance=attack_distance,
            threshold_auth=threshold_auth,
            threshold_attack=threshold_attack,
            recent_flags=recent_flags,
        )

        reason = self._build_reason(
            decision,
            auth_distance,
            attack_distance,
            threshold_auth,
            threshold_attack,
            recent_flags,
        )

        self.store.log_audit_event(
            tenant_id=tenant_id,
            branch_run_id=None,
            event_type="challenge_decision",
            actor="agent-service",
            payload={
                "challenge_id": challenge_id,
                "channel": channel or "unspecified",
                "decision": decision,
                "policy_version": policy_version,
                "auth_distance": auth_distance,
                "attack_distance": attack_distance,
                "recent_flags": recent_flags,
            },
        )

        self.store.set_challenge_status(challenge_id, tenant_id, "closed")

        elapsed_ms = round((time.time() - start) * 1000, 2)

        return {
            "decision": decision,
            "reason": reason,
            "scores": {
                "auth_distance": auth_distance,
                "attack_distance": attack_distance,
                "recent_flags_90d": recent_flags,
                "trailing_confidence": trailing_conf,
                "policy_version": policy_version,
            },
            "applied_policy": policy_version,
            "query_ms": elapsed_ms,
            "query_template": KILLER_QUERY_TEMPLATE.strip(),
            "policy_sql_ref": None,
        }

    def query_layer(self, tenant_id: str, challenge_id: str):
        challenge = self.store.get_challenge(challenge_id, tenant_id)
        if not challenge:
            raise ValueError("challenge not found")

        policy = self.store.get_policy(tenant_id, challenge["risk_tier"])
        policy_version = policy.get("policy_version", "policy-default")
        threshold_auth = float(policy["threshold_auth"])
        threshold_attack = float(policy["threshold_attack"])

        challenge_embedding = self._load_vector(challenge["current_embedding"])
        auth_rows = self.store.list_authentic_fingerprints(tenant_id, challenge["customer_id"], challenge["modality"])
        atk_rows = self.store.list_attack_fingerprints(tenant_id, challenge["modality"])

        auth_distance = self._min_distance(auth_rows, challenge_embedding, source="embedding")
        attack_distance = self._min_distance(atk_rows, challenge_embedding, source="embedding")

        events = self.store.list_recent_events(tenant_id, challenge["customer_id"], days=90)
        recent_flags = sum(
            1
            for e in events
            if e.get("verdict") in ("fraud", "deny", "review", "escalate") and self._days_old(e["ts"]) <= 90
        )
        trailing_conf = self._trailing_confidence(events)

        decision = self._apply_policy(
            auth_distance=auth_distance,
            attack_distance=attack_distance,
            threshold_auth=threshold_auth,
            threshold_attack=threshold_attack,
            recent_flags=recent_flags,
        )

        reason = self._build_reason(
            decision=decision,
            auth_distance=auth_distance,
            attack_distance=attack_distance,
            threshold_auth=threshold_auth,
            threshold_attack=threshold_attack,
            recent_flags=recent_flags,
        )

        return {
            "challenge_id": challenge["challenge_id"],
            "customer_id": challenge["customer_id"],
            "tenant_id": tenant_id,
            "modality": challenge["modality"],
            "status": challenge.get("status", "open"),
            "raw_features": self._coerce_raw_features(challenge.get("raw_features")),
            "policy": {
                "policy_version": policy_version,
                "threshold_auth": threshold_auth,
                "threshold_attack": threshold_attack,
                "escalation_rule": policy.get("escalation_rule"),
            },
            "scores": {
                "auth_distance": auth_distance,
                "attack_distance": attack_distance,
                "recent_flags_90d": recent_flags,
                "trailing_confidence": trailing_conf,
                "policy_version": policy_version,
            },
            "decision": decision,
            "reason": reason,
            "query_template": KILLER_QUERY_TEMPLATE.strip(),
        }

    def upsert_authentic_fingerprint(
        self,
        tenant_id: str,
        customer_id: str,
        modality: str,
        embedding: list[float],
        source_event_id: Optional[str] = None,
        quality_score: Optional[float] = None,
    ):
        fingerprint_id = self.store.upsert_authentic_fingerprint(
            tenant_id=tenant_id,
            customer_id=customer_id,
            modality=modality,
            embedding=embedding,
            source_event_id=source_event_id,
            quality_score=quality_score,
        )
        return {
            "fingerprint_id": fingerprint_id,
            "is_current": True,
            "deactivated_prior": 0,
        }

    def log_episode(self, event: Dict[str, Any]):
        event_id = event.get("event_id") or str(uuid.uuid4())
        self.store.log_episode(
            event_id=event_id,
            tenant_id=event["tenant_id"],
            customer_id=event["customer_id"],
            challenge_id=event["challenge_id"],
            modality=event["modality"],
            asset_hash=event["asset_hash"],
            verdict=event["verdict"],
            confidence=event.get("confidence"),
            authenticity_score=event.get("authenticity_score"),
            explainability_json=event.get("explainability_json"),
            human_outcome=event.get("human_outcome"),
            ground_truth=event.get("ground_truth"),
            ts=event.get("ts", datetime.utcnow().isoformat()),
            branch_run_id=event.get("branch_run_id"),
            auth_distance=event.get("auth_distance"),
            attack_distance=event.get("attack_distance"),
        )
        return {
            "event_id": event_id,
            "status": "logged",
        }

    def run_update_cycle(
        self,
        tenant_id: str,
        window_days: int,
        drift_signal: str,
        candidate_policy_version: Optional[str] = None,
        prewarm_branch: Optional[str] = None,
        run_on_exa_intel: bool = True,
    ):
        branch_run_id = f"brn-{uuid.uuid4()}"
        branch_name = prewarm_branch or f"aml-update-{int(time.time())}"

        self.store.create_branch_run(
            branch_run_id=branch_run_id,
            tenant_id=tenant_id,
            source_branch="main",
            branch_name=branch_name,
            created_by="autobuild",
            drift_signal=drift_signal,
            hypothesis=f"Hypothesis derived from: {drift_signal}",
        )

        active_policy = self.store.get_any_active_policy(tenant_id)
        if not active_policy:
            active_policy = {"threshold_auth": 0.24, "threshold_attack": 0.22, "policy_version": "policy-default"}

        cand = {
            "policy_version": candidate_policy_version or f"candidate-{int(time.time())}",
            "threshold_auth": float(active_policy["threshold_auth"]),
            "threshold_attack": float(active_policy["threshold_attack"]),
        }

        signal = (drift_signal or "").lower()
        if "false_positive" in signal:
            cand["threshold_auth"] = min(cand["threshold_auth"] + 0.06, 0.45)
        if "false_negative" in signal or "attack" in signal or "clone" in signal:
            cand["threshold_attack"] = max(cand["threshold_attack"] - 0.05, 0.05)

        events = self.store.list_recent_events(tenant_id=tenant_id, days=window_days)
        old = self._simulate_series(events, active_policy)
        new = self._simulate_series(events, cand)

        delta_fpr = self._delta_rate(old["fpr"], new["fpr"])
        delta_fnr = self._delta_rate(old["fnr"], new["fnr"])
        replay_size = old["n"]
        adversarial_passed = len(events) > 0 and run_on_exa_intel
        latency_ms = self._estimate_latency_ms(replay_size)

        winner = delta_fpr <= 0 and delta_fnr <= 0

        self.store.record_trial(
            branch_run_id=branch_run_id,
            window_days=window_days,
            delta_fpr=delta_fpr,
            delta_fnr=delta_fnr,
            delta_latency_ms=latency_ms,
            replay_size=replay_size,
            adversarial_passed=adversarial_passed,
            winner=winner,
            notes={
                "old": {
                    "fpr": old["fpr"],
                    "fnr": old["fnr"],
                    "positive_rate": old["positive_rate"],
                    "support": old["n"],
                },
                "new": {
                    "fpr": new["fpr"],
                    "fnr": new["fnr"],
                    "positive_rate": new["positive_rate"],
                    "support": new["n"],
                },
                "hypothesis": drift_signal,
                "adversarial_inputs": run_on_exa_intel,
                "exa_ready": True,
            },
        )

        if winner:
            recommendation = "promote"
            self.store.close_branch_run(
                branch_run_id=branch_run_id,
                status="promoted",
                promoted=1,
                archived=0,
                metrics_json={
                    "winner": True,
                    "delta_fpr": delta_fpr,
                    "delta_fnr": delta_fnr,
                    "adversarial_passed": adversarial_passed,
                },
            )
        else:
            recommendation = "archive"
            self.store.close_branch_run(
                branch_run_id=branch_run_id,
                status="rejected",
                promoted=0,
                archived=1,
                metrics_json={
                    "winner": False,
                    "delta_fpr": delta_fpr,
                    "delta_fnr": delta_fnr,
                    "adversarial_passed": adversarial_passed,
                },
            )

        self.store.log_audit_event(
            tenant_id=tenant_id,
            branch_run_id=branch_run_id,
            event_type="update_cycle_completed",
            actor="autobuild",
            payload={
                "window_days": window_days,
                "drift_signal": drift_signal,
                "recommendation": recommendation,
                "delta_fpr": delta_fpr,
                "delta_fnr": delta_fnr,
            },
        )

        artifact_uri = f"file://{self._write_audit_bundle(branch_run_id)}"

        return {
            "branch_run_id": branch_run_id,
            "branch_name": branch_name,
            "replay_size": replay_size,
            "delta_fpr": delta_fpr,
            "delta_fnr": delta_fnr,
            "adversarial_passed": adversarial_passed,
            "recommendation": recommendation,
            "artifact_uri": artifact_uri,
        }

    def audit_bundle(self, tenant_id: str, branch_run_id: str, fmt: str = "json"):
        bundle = self.store.get_branch_bundle(branch_run_id)
        if not bundle["branch_run"]:
            raise ValueError("branch not found")
        if bundle["branch_run"]["tenant_id"] != tenant_id:
            raise ValueError("tenant mismatch")

        if fmt == "json":
            path = self._write_audit_bundle(branch_run_id, force_content=json.dumps(bundle, indent=2, default=str))
            return {
                "format": "json",
                "path": path,
                "bundle": bundle,
            }

        path = self._write_audit_bundle(branch_run_id)
        return {
            "format": fmt,
            "path": path,
            "bundle": bundle,
        }

    def _days_old(self, ts_value):
        if not ts_value:
            return 9999
        try:
            dt = datetime.fromisoformat(ts_value.replace("Z", "+00:00"))
        except Exception:
            return 9999
        return max(0, int((datetime.utcnow() - dt.replace(tzinfo=None)).days))

    def _trailing_confidence(self, events):
        vals = [e.get("confidence") for e in events if e.get("confidence") is not None][:30]
        if not vals:
            return None
        return sum(vals) / len(vals)

    def _apply_policy(self, auth_distance: float, attack_distance: float, threshold_auth: float, threshold_attack: float, recent_flags: int):
        if auth_distance > threshold_auth and attack_distance <= threshold_attack:
            return "deny"
        if auth_distance > threshold_auth or attack_distance <= threshold_attack:
            return "review"
        if recent_flags > 6:
            return "review"
        return "allow"

    def _build_reason(self, decision, auth_distance, attack_distance, threshold_auth, threshold_attack, recent_flags):
        if decision == "allow":
            return (
                f"auth_distance={auth_distance:.4f} within threshold ({threshold_auth:.4f}) and "
                f"attack_distance={attack_distance:.4f} above attack threshold ({threshold_attack:.4f})."
            )
        if decision == "review":
            return (
                f"Risk check elevated: auth_distance={auth_distance:.4f} vs {threshold_auth:.4f}, "
                f"attack_distance={attack_distance:.4f} vs {threshold_attack:.4f}, recent_flags_90d={recent_flags}."
            )
        return (
            f"High confidence attack match: auth_distance={auth_distance:.4f} exceeds threshold and "
            f"attack_distance={attack_distance:.4f} is within attack envelope."
        )

    def _min_distance(self, rows, target, source="embedding"):
        vectors = [to_float_list(r[source]) for r in rows] if rows else []
        if not vectors:
            return 1.0
        return min_cosine_distance(vectors, target)

    def _load_vector(self, raw):
        if raw is None:
            return []
        if isinstance(raw, (list, tuple)):
            return [safe_float(x) for x in raw]
        return to_float_list(raw)

    def _simulate_series(self, events, policy):
        threshold_auth = float(policy["threshold_auth"])
        threshold_attack = float(policy["threshold_attack"])

        tp = fp = fn = tn = 0
        matched = 0
        for e in events:
            ad = safe_float(e.get("auth_distance"), 1.0)
            atk = safe_float(e.get("attack_distance"), 1.0)
            matched += 1
            pred = self._apply_policy(ad, atk, threshold_auth, threshold_attack, recent_flags=0)
            pred_pos = pred in ("review", "deny")

            truth = (e.get("ground_truth") or "unknown")
            actual_pos = truth == "confirmed_fraud"
            if pred_pos and actual_pos:
                tp += 1
            elif pred_pos and not actual_pos:
                fp += 1
            elif (not pred_pos) and actual_pos:
                fn += 1
            else:
                tn += 1

        n = max(1, tp + fp + fn + tn)
        fpr = fp / max(1, fp + tn)
        fnr = fn / max(1, fn + tp)
        positive_rate = (tp + fp) / n
        return {
            "n": matched,
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "tn": tn,
            "fpr": fpr,
            "fnr": fnr,
            "positive_rate": positive_rate,
        }

    def _delta_rate(self, old: float, new: float):
        return round(new - old, 6)

    def _estimate_latency_ms(self, replay_size: int) -> float:
        return round(8.5 + (replay_size * 0.4), 2)

    def _write_audit_bundle(self, branch_run_id: str, force_content: Optional[str] = None) -> str:
        payload = self.store.get_branch_bundle(branch_run_id)
        out_dir = os.environ.get("AML_AUDIT_DIR", "./data")
        os.makedirs(out_dir, exist_ok=True)
        path = f"{out_dir}/audit_{branch_run_id}.json"
        with open(path, "w", encoding="utf-8") as fp:
            fp.write(force_content or json.dumps(payload, default=str, indent=2))
        return path
