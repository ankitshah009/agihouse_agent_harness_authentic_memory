"""Standalone sandbox replay script.

Reads JSON from stdin, computes TP/FP/FN/TN and fpr/fnr for an active policy
and a candidate policy against the same event list, and emits a JSON decision
envelope on stdout. This module intentionally uses only the standard library
so it can execute inside a fresh Daytona sandbox without any project install.

Input schema:
    {
      "events": [ { "ground_truth": "...", "auth_distance": 0.3, "attack_distance": 0.2 }, ... ],
      "active_policy":    { "threshold_auth": 0.24, "threshold_attack": 0.22 },
      "candidate_policy": { "threshold_auth": 0.30, "threshold_attack": 0.17 }
    }

Output schema (stdout, single JSON object):
    {
      "old": {...}, "new": {...},
      "delta_fpr": float, "delta_fnr": float,
      "winner": bool, "replay_size": int
    }
"""

import json
import sys


def _safe_float(value, default=1.0):
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _predicted_positive(auth_distance: float, attack_distance: float, threshold_auth: float, threshold_attack: float) -> bool:
    return (auth_distance > threshold_auth) or (attack_distance <= threshold_attack)


def _simulate(events, policy):
    threshold_auth = float(policy.get("threshold_auth", 0.24))
    threshold_attack = float(policy.get("threshold_attack", 0.22))

    tp = fp = fn = tn = 0
    matched = 0
    for event in events or []:
        auth_distance = _safe_float(event.get("auth_distance"), 1.0)
        attack_distance = _safe_float(event.get("attack_distance"), 1.0)
        matched += 1

        pred_pos = _predicted_positive(auth_distance, attack_distance, threshold_auth, threshold_attack)
        actual_pos = (event.get("ground_truth") or "unknown") == "confirmed_fraud"

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


def run(payload):
    events = payload.get("events") or []
    active_policy = payload.get("active_policy") or {}
    candidate_policy = payload.get("candidate_policy") or {}

    old = _simulate(events, active_policy)
    new = _simulate(events, candidate_policy)

    delta_fpr = round(new["fpr"] - old["fpr"], 6)
    delta_fnr = round(new["fnr"] - old["fnr"], 6)
    winner = (delta_fpr <= 0) and (delta_fnr <= 0)

    return {
        "old": old,
        "new": new,
        "delta_fpr": delta_fpr,
        "delta_fnr": delta_fnr,
        "winner": winner,
        "replay_size": old["n"],
    }


def main():
    raw = sys.stdin.read() or "{}"
    try:
        payload = json.loads(raw)
    except Exception as exc:
        sys.stdout.write(json.dumps({"error": f"invalid_json: {exc}"}))
        return 2
    result = run(payload)
    sys.stdout.write(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
