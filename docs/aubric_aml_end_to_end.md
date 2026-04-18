# Aubric AML End-to-End Build Pack

This repo now includes three artifacts:

- `schema/ddl/aml_tidb_schema.sql`: authoritative TiDB schema for four-memory architecture + replay/audit tables.
- `mcp/aml_mcp_tool_definitions.json`: MCP tool contract with concrete tool inputs/outputs.
- This document: execution model and sample calls.

## 1) Memory stack implementation map

Layer 1
- `active_challenges` stores short-term session state for an in-flight authenticity challenge.

Layer 2
- `authentic_fingerprints` stores customer baselines per modality.
- `attack_fingerprints` stores negative corpus for known synthetic/attack artifacts.

Layer 3
- `episodic_events` stores immutable per-challenge outcomes and outcomes from analysts.
- `branch_runs`, `branch_trial_results`, `audit_events` support replay, A/B comparison, and explainability evidence.

Layer 4
- `procedural_policies` stores versioned SQL-driven policies and thresholds.
- `policy_version` selected in challenge query controls behavior without hardcoding logic.

## 2) Launch sequence for the hackathon demo

1. Provision TiDB schema from `schema/ddl/aml_tidb_schema.sql`.
2. Load seed customers/events in a fixture script (small synthetic 90-day set).
3. Start MCP server and register these tools with your agent framework.
4. Run a normal challenge through `aml_authenticity_decide`.
5. Run one synthetic attack and show changed distance scores and escalation.
6. Trigger `aml_run_update_cycle` for branch + replay evidence.
7. Fetch `aml_audit_bundle` for the branch and present as Article 50 evidence.

## 3) MCP quick start payloads

Create challenge:

```json
{
  "tool": "aml_authenticity_decide",
  "input": {
    "tenant_id": "tenant-fid1",
    "challenge_id": "chal-0001",
    "channel": "kyc_voice"
  }
}
```

Log an event from the agent result:

```json
{
  "tool": "aml_log_episode",
  "input": {
    "tenant_id": "tenant-fid1",
    "customer_id": "cust-8821",
    "challenge_id": "chal-0001",
    "modality": "voice",
    "asset_hash": "sha256:8b4...",
    "verdict": "authentic",
    "confidence": 0.94,
    "authenticity_score": 0.91,
    "ts": "2026-04-18T01:10:00Z"
  }
}
```

Run drift cycle and request branch replay:

```json
{
  "tool": "aml_run_update_cycle",
  "input": {
    "tenant_id": "tenant-fid1",
    "window_days": 90,
    "drift_signal": "voice_clone_false_negatives_up_1_3x",
    "run_on_exa_intel": true
  }
}
```

Fetch compliance package:

```json
{
  "tool": "aml_audit_bundle",
  "input": {
    "tenant_id": "tenant-fid1",
    "branch_run_id": "brn-2026-04-18-001",
    "format": "json"
  }
}
```

## 4) What this implementation omits (intentional for 48h)

- No concrete model code inside this repo (Aubric scoring model, Exa/Daytona adapters, and C2PA verification are externalized integrations).
- No UI layer yet.
- No production hardening around key management, RBAC, encryption-at-rest details, or tenant onboarding guardrails.

These are add-on layers once the schema + MCP contract is stable.

## 5) One thing to call out in judge demo

Use one screen with:
1) `v_authenticity_feature_view` output (`auth_distance`, `attack_distance`, `policy_version`)
2) branch promotion decision in `branch_runs`
3) `audit_events` evidence package

That sequence maps directly to the value story: fast memory query, continuous adaptive drift control, and ready-to-present compliance evidence.
