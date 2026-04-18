# Aubric AML — End-to-End Demo Runbook

## Quick start

1) Install deps (if you want MCP mode):

```bash
python -m pip install -r requirements.txt
```

2) Seed local sqlite data:

```bash
python scripts/seed_data.py --db ./data/aml_memory.sqlite
```

3) Run the 3-scenario story:

```bash
python scripts/run_demo.py
```

## MCP execution modes

### 1) MCP package mode (best for live agent)

```bash
AML_BACKEND=sqlite AML_SQLITE_PATH=./data/aml_memory.sqlite \
python -m src.aml.mcp_server --mode mcp
```

- Register tools with your MCP client using `mcp/aml_mcp_tool_definitions.json`.
- Tool names: `aml_authenticity_decide`, `aml_log_episode`, `aml_upsert_authentic_fingerprint`, `aml_run_update_cycle`, `aml_audit_bundle`.

### 2) StdIO dev mode (single-file fallback)

```bash
echo '{"tool":"aml_authenticity_decide","input":{"tenant_id":"t-geo","challenge_id":"ch-001","channel":"profile_photo"}}' | \
AML_BACKEND=sqlite AML_SQLITE_PATH=./data/aml_memory.sqlite python -m src.aml.mcp_server --mode stdio
```

## Track assumptions (explicit)

This build is intentionally optimized for Track 2 with maximum TiDB award overlap.

Assumption A — Track 2 + TiDB cross-track are stackable.
- If this is not true, we still keep a valid demo by defaulting to demo output and SQLite mode.

Assumption B — Distinctive TiDB usage is rewarded.
- Single query story, vector search + SQL + HTAP view, and branch-oriented update loop are all first-class in the architecture and visible in code.

Assumption C — Aubric inference available.
- This repo ships deterministic fixtures and can run without live model calls.
- If live inference is available, replace `scripts/run_demo.py` scoring constants with model responses.

## If any assumption fails

- Replace SQLite with real TiDB DSN and set:

```bash
AML_BACKEND=tidb DATABASE_URL=mysql://user:pass@host:4000/aubric_aml
```

- If model inference is unavailable, keep all demo values as seeded fixture trajectories and keep the story on-memory drift mechanics and compliance evidence.
