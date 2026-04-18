# Aubric AML — Authenticity Memory Layer

Aubric AML is a persistent memory substrate for trust & safety agents. In financial-services workflows (KYC, call-center fraud, document provenance), an agent queries AML to reason over what is authentic, what is suspicious, and how decisions should evolve over time.

## Why now

EU AI Act Article 50 enforcement begins **Aug 2, 2026**. Deployers need detection, disclosure, and audit-ready evidence chains. AML is designed so compliance artifacts are produced by normal operation (especially the update loop with versioned branches).

## Verified tooling stack and roles

- **TiDB**: SQL + vectors + transactions in one system; HTAP split (TiKV row + TiFlash columnar); branch-based isolated experiments.
- **Daytona**: fast stateful sandboxes, snapshot reuse, parallel branches for policy/model experiments.
- **Exa**: deep research, semantic similarity discovery (`findSimilar`), and continuous monitoring (`Websets`) for adversarial OSINT.

## Memory architecture (four layers)

1. **Short-term memory** (`active_challenges`): active authenticity challenge state.
2. **Semantic memory** (`authentic_fingerprints`, `attack_fingerprints`): vector fingerprints for authentic baselines and known attacks.
3. **Episodic memory** (`episodic_events`): immutable event log for every decision and eventual outcome.
4. **Procedural memory** (`procedural_policies`): versioned decision rules and thresholds per tenant/risk tier.

## Why authenticity state is hard

Authenticity policy quality degrades under:

- Natural drift (voice/face/behavior changes)
- Adversarial drift (new generator families)
- Distributional drift (regional/seasonal fraud economics)
- Regulatory drift (traceability and auditability requirements)
- Cross-modal drift (voice updated but face stale)
- Privacy constraints (biometrics must stay protected)

The core engineering problem is safe, continuous, replayable state updates at scale without touching production data paths.

## Update loop (TiDB branching × Daytona)

1. Detect drift from episodic HTAP analytics.
2. Spawn isolated TiDB branch + Daytona sandbox.
3. Apply candidate policy/model update in branch.
4. Replay historical challenges (e.g., 90 days) and compare deltas.
5. Run adversarial suite enriched by Exa OSINT artifacts.
6. Promote winning branch or archive rejected branch with full audit trail.

## Killer query (single statement across memory layers)

```sql
SELECT
  c.challenge_id,
  c.customer_id,
  c.modality,
  MIN(VEC_COSINE_DISTANCE(f_auth.embedding, c.current_embedding)) AS auth_distance,
  MIN(VEC_COSINE_DISTANCE(f_atk.embedding, c.current_embedding)) AS attack_distance,
  COUNT(CASE WHEN e.verdict='flagged' AND e.ts > NOW() - INTERVAL 90 DAY THEN 1 END) AS recent_flags,
  AVG(CASE WHEN e.ts > NOW() - INTERVAL 30 DAY THEN e.confidence END) AS trailing_confidence,
  p.policy_version,
  p.threshold_auth,
  p.threshold_attack,
  p.escalation_rule
FROM active_challenges c
LEFT JOIN authentic_fingerprints f_auth
  ON f_auth.customer_id = c.customer_id AND f_auth.modality = c.modality
LEFT JOIN attack_fingerprints f_atk
  ON f_atk.modality = c.modality
LEFT JOIN episodic_events e
  ON e.customer_id = c.customer_id
LEFT JOIN procedural_policies p
  ON p.tenant_id = c.tenant_id
  AND p.risk_tier = c.risk_tier
  AND p.is_active = TRUE
WHERE c.challenge_id = ?
GROUP BY c.challenge_id, c.customer_id, c.modality, p.policy_version,
         p.threshold_auth, p.threshold_attack, p.escalation_rule;
```

## TiDB schema DDL (MVP-ready)

```sql
CREATE TABLE tenants (
  tenant_id            VARCHAR(64) PRIMARY KEY,
  tenant_name          VARCHAR(255) NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
  customer_id          VARCHAR(64) PRIMARY KEY,
  tenant_id            VARCHAR(64) NOT NULL,
  risk_tier            VARCHAR(32) NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customers_tenant (tenant_id)
);

CREATE TABLE active_challenges (
  challenge_id         VARCHAR(64) PRIMARY KEY,
  tenant_id            VARCHAR(64) NOT NULL,
  customer_id          VARCHAR(64) NOT NULL,
  modality             VARCHAR(16) NOT NULL,
  current_embedding    VECTOR(1536),
  context_json         JSON,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status               VARCHAR(16) NOT NULL DEFAULT 'open',
  INDEX idx_active_customer (customer_id),
  INDEX idx_active_tenant_status (tenant_id, status)
);

CREATE TABLE authentic_fingerprints (
  fingerprint_id       BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id            VARCHAR(64) NOT NULL,
  customer_id          VARCHAR(64) NOT NULL,
  modality             VARCHAR(16) NOT NULL,
  embedding            VECTOR(1536) NOT NULL,
  source_event_id      VARCHAR(64),
  is_current           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auth_lookup (tenant_id, customer_id, modality, is_current),
  VECTOR INDEX idx_auth_embedding ((VEC_COSINE_DISTANCE(embedding))) USING HNSW
);

CREATE TABLE attack_fingerprints (
  attack_id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  modality             VARCHAR(16) NOT NULL,
  generator_family     VARCHAR(128),
  embedding            VECTOR(1536) NOT NULL,
  source_url           VARCHAR(1024),
  first_seen_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  VECTOR INDEX idx_attack_embedding ((VEC_COSINE_DISTANCE(embedding))) USING HNSW
);

CREATE TABLE episodic_events (
  event_id             VARCHAR(64) PRIMARY KEY,
  tenant_id            VARCHAR(64) NOT NULL,
  customer_id          VARCHAR(64) NOT NULL,
  challenge_id         VARCHAR(64),
  modality             VARCHAR(16) NOT NULL,
  asset_hash           VARCHAR(128) NOT NULL,
  verdict              VARCHAR(32) NOT NULL,
  confidence           DECIMAL(6,5),
  explainability_json  JSON,
  human_outcome        VARCHAR(32),
  ground_truth         VARCHAR(32),
  ts                   TIMESTAMP NOT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_events_customer_ts (customer_id, ts),
  INDEX idx_events_tenant_ts (tenant_id, ts)
);

CREATE TABLE procedural_policies (
  policy_id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id            VARCHAR(64) NOT NULL,
  risk_tier            VARCHAR(32) NOT NULL,
  policy_version       VARCHAR(64) NOT NULL,
  threshold_auth       DECIMAL(6,5) NOT NULL,
  threshold_attack     DECIMAL(6,5) NOT NULL,
  escalation_rule      JSON NOT NULL,
  is_active            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_policy_version (tenant_id, risk_tier, policy_version),
  INDEX idx_policy_active (tenant_id, risk_tier, is_active)
);
```

## MCP tool definitions (agent integration contract)

```json
{
  "name": "aml_authenticity_decide",
  "description": "Evaluate active challenge against semantic, episodic, and procedural memory",
  "inputSchema": {
    "type": "object",
    "properties": {
      "challenge_id": {"type": "string"}
    },
    "required": ["challenge_id"]
  }
}
```

```json
{
  "name": "aml_log_episode",
  "description": "Write an episodic authenticity event",
  "inputSchema": {
    "type": "object",
    "properties": {
      "event_id": {"type": "string"},
      "tenant_id": {"type": "string"},
      "customer_id": {"type": "string"},
      "challenge_id": {"type": "string"},
      "modality": {"type": "string"},
      "asset_hash": {"type": "string"},
      "verdict": {"type": "string"},
      "confidence": {"type": "number"},
      "ts": {"type": "string", "format": "date-time"}
    },
    "required": ["event_id", "tenant_id", "customer_id", "modality", "asset_hash", "verdict", "ts"]
  }
}
```

```json
{
  "name": "aml_run_update_cycle",
  "description": "Launch drift-driven sandbox replay on branched memory and return promotion decision",
  "inputSchema": {
    "type": "object",
    "properties": {
      "tenant_id": {"type": "string"},
      "window_days": {"type": "integer", "minimum": 1},
      "drift_signal": {"type": "string"}
    },
    "required": ["tenant_id", "window_days", "drift_signal"]
  }
}
```

## Hackathon demo flow (3 minutes)

1. Setup: "Article 50 deadline is near; trust agents without memory fail both security and compliance."
2. Cold case: authentic sample evaluated with explainability.
3. Attack case: cloned sample escalated with policy trace.
4. Live update loop: branch + sandbox + replay + Exa-fed adversarial check.
5. Close: promoted/archived branch artifacts as compliance evidence.

## Scope notes / risk flags

- TiDB vector indexing was publicly announced as beta; position production claims carefully.
- TiDB branching and Daytona startup numbers may vary in first-run paths; pre-warm for demos.
- Exa coverage is strongest on public web content; avoid overclaiming underground forum visibility.
