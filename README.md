# Aubric AML — Authenticity Memory for Agents

## Why this project

Aubric AML is a memory-first trust layer for AI moderation/identity agents:

- remember **authenticity state** per user (voice/face/document/behavior),
- keep episodic decisions for replay and drift measurement,
- store procedural policy updates as versioned, auditable records,
- expose everything through MCP so agents can call it as a real memory API.

This repo is built as a hackathon-ready demo stack with a clear Track 2 story and a TiDB cross-track advantage.

## What you get end-to-end

- **SQLite/TiDB data model** for four memory layers in `schema/ddl/aml_tidb_schema.sql`
- **Vector + SQL + policy query** pattern in code (`KILLER_QUERY_TEMPLATE`)  
- **MCP tool host** in `src/aml/mcp_server.py`
- **Decision/update orchestration** in `src/aml/service.py`
- **Seeded demo fixtures** in `scripts/seed_data.py` (optional manual seed mode)
- **4-phase incident runner** in `scripts/run_demo.py` (onboarding → attack → escalation → recovery)
- **Tool contract** in `mcp/aml_mcp_tool_definitions.json`
- **Ops + pitch artifacts** in `docs/runbook.md`, `docs/architecture_and_demo_script.md`, `docs/aubric_aml_end_to_end.md`

## TiDB architecture map to judges

```mermaid
flowchart LR
    A[Authenticity Input] --> B[active_challenges]
    B --> C[AML Service]
    C --> D[authentic_fingerprints]
    C --> E[attack_fingerprints]
    C --> F[episodic_events]
    C --> G[procedural_policies]
    C --> H[Decision + reason + scores]
    H --> I[MCP Clients / Agent]
    H --> J[audit_events]
    J --> K[branch_runs]
    K --> L[branch_trial_results]
```

### Memory layers

1. **Short-term** → `active_challenges` (per-in-flight request)
2. **Semantic** → `authentic_fingerprints`, `attack_fingerprints` (vector memory)
3. **Episodic** → `episodic_events` (append-only behavior)
4. **Procedural** → `procedural_policies`, `branch_runs` (versioned policy + replay)

## Fast start (SQLite local demo)

### One-shot commands

- `make install` — install pnpm + pip deps
- `make demo` — run the demo (SQLite)
- `make demo-tidb` — run the demo against TiDB (requires DATABASE_URL)
- `make test` — run the pytest smoke suite
- `make rehearse` — full dress rehearsal (install + build + test + demo)
- `make prewarm` — warm the TiDB connection + Daytona sandbox before judging
- See [docs/tidb_setup.md](docs/tidb_setup.md) for the TiDB Cloud runbook.

### 1) Install frontend dependencies

```bash
pnpm install
python -m pip install -r requirements.txt
```

### 2) Initialize data + run the full demo stack

```bash
pnpm demo
```

Then open:

- `http://localhost:3000` for the Next.js frontend
- API runs on `http://127.0.0.1:9000` (used by the frontend)

If you prefer to run frontend and API separately:

```bash
pnpm dev:api      # Terminal 1
pnpm dev          # Terminal 2
```

You can also run the backend demo script directly (`scripts/run_demo.py`) if you only want to exercise the service without the UI.

### MCP mode

**stdio fallback (works without MCP package):**

```bash
AML_BACKEND=sqlite AML_SQLITE_PATH=./data/aml_memory.sqlite \
echo '{"tool":"aml_authenticity_decide","input":{"tenant_id":"t-geo","challenge_id":"ch-001","channel":"profile_photo"}}' | \
python -m src.aml.mcp_server --mode stdio
```

**MCP server mode (requires mcp package):**

```bash
AML_BACKEND=sqlite AML_SQLITE_PATH=./data/aml_memory.sqlite \
python -m src.aml.mcp_server --mode mcp
```

Register tools from: `mcp/aml_mcp_tool_definitions.json`.

## TiDB mode

Set env:

```bash
AML_BACKEND=tidb DATABASE_URL=mysql://user:password@host:4000/aubric_aml
```

Then run the same seed/demo flow against TiDB.

## 3-minute demo script (end-to-end, real-world style)

1. **0:00–0:30 Set the problem**  
   EU AI Act deadline pressure + “agents forget, one false positive can break trust.”

2. **0:30–1:15 Baseline case (onboarding)**  
   `python scripts/run_demo.py` executes phase 1 as onboarding verification and should output `allow` with low auth-distance and high trust.

3. **1:15–2:00 Attack + escalation case**  
   phase 2 and 3 show `review`/`deny` as cloned/financial abuse attempts hit similarity and policy thresholds.

4. **2:00–2:45 Update loop**  
   shows replay + adversarial-sim signal via `run_update_cycle`, then recommendation and drift delta.

5. **2:45–3:00 Compliance close**  
   show exported audit bundle from `data/audit_<branch>.json`.

## Strategic assumptions (explicit)

If any assumption fails, the story still lands:

1. **Track stackability fails** → core product remains a strong Track 2 MCP memory substrate with reproducible replay/audit.
2. **TiDB distinctness not rewarded** → still a pragmatic agentic architecture with four memory layers and deterministic behavior.
3. **Live Aubric endpoints unavailable** → fixtures produce realistic trajectories and stable, demonstrable flow.

## Files you should reference in your pitch

- `docs/architecture_and_demo_script.md` (short, presentation-ready story)
- `docs/runbook.md` (operator commands)
- `mcp/aml_mcp_tool_definitions.json` (agent contract)
- `schema/ddl/aml_tidb_schema.sql` (single-query + vector + branches)
