-- Aubric AML – TiDB schema for 48h hackathon
-- Assumes TiDB 8.5+ with VECTOR + HNSW enabled.

CREATE DATABASE IF NOT EXISTS aubric_aml;
USE aubric_aml;

CREATE TABLE IF NOT EXISTS tenants (
  tenant_id        VARCHAR(64) PRIMARY KEY,
  tenant_name      VARCHAR(255) NOT NULL,
  legal_entity     VARCHAR(255),
  compliance_region VARCHAR(32) NOT NULL DEFAULT 'US',
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  customer_id      VARCHAR(64) PRIMARY KEY,
  tenant_id        VARCHAR(64) NOT NULL,
  risk_tier        VARCHAR(32) NOT NULL,
  customer_type    VARCHAR(32) NOT NULL DEFAULT 'consumer',
  status           VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customers_tenant (tenant_id, risk_tier, status),
  CONSTRAINT fk_customers_tenants FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

CREATE TABLE IF NOT EXISTS active_challenges (
  challenge_id      VARCHAR(64) PRIMARY KEY,
  tenant_id         VARCHAR(64) NOT NULL,
  customer_id       VARCHAR(64) NOT NULL,
  modality          VARCHAR(16) NOT NULL,
  asset_id          VARCHAR(255) NOT NULL,
  status            VARCHAR(24) NOT NULL DEFAULT 'open',
  current_embedding VECTOR(1536),
  raw_features      JSON,
  model_version     VARCHAR(64),
  risk_tier         VARCHAR(32) NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ttl_at            TIMESTAMP NULL,
  INDEX idx_active_lookup (tenant_id, customer_id, modality, status),
  INDEX idx_active_asset (tenant_id, asset_id),
  CONSTRAINT fk_active_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
  CONSTRAINT fk_active_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE IF NOT EXISTS authentic_fingerprints (
  fingerprint_id     BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id         VARCHAR(64) NOT NULL,
  customer_id       VARCHAR(64) NOT NULL,
  modality          VARCHAR(16) NOT NULL,
  modality_version  VARCHAR(32) DEFAULT 'v1',
  embedding         VECTOR(1536) NOT NULL,
  source_event_id    VARCHAR(64),
  is_current        TINYINT(1) NOT NULL DEFAULT 1,
  quality_score     DECIMAL(5,4) DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at        TIMESTAMP NULL,
  INDEX idx_fingerprint_lookup (tenant_id, customer_id, modality, is_current),
  INDEX idx_fingerprint_expires (expires_at),
  VECTOR INDEX idx_auth_fingerprint_embedding USING HNSW ((VEC_COSINE_DISTANCE(embedding))),
  CONSTRAINT fk_auth_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
  CONSTRAINT fk_auth_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE IF NOT EXISTS attack_fingerprints (
  attack_id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_scope       VARCHAR(32) NOT NULL DEFAULT 'global',
  modality           VARCHAR(16) NOT NULL,
  generator_family   VARCHAR(128),
  attack_family      VARCHAR(128),
  embedding          VECTOR(1536) NOT NULL,
  source_url         VARCHAR(1024),
  exa_observation_id VARCHAR(128),
  severity_band      VARCHAR(16) NOT NULL DEFAULT 'medium',
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  VECTOR INDEX idx_attack_fingerprint_embedding USING HNSW ((VEC_COSINE_DISTANCE(embedding))),
  INDEX idx_attack_lookup (tenant_scope, modality, attack_family)
);

CREATE TABLE IF NOT EXISTS episodic_events (
  event_id           VARCHAR(64) PRIMARY KEY,
  tenant_id          VARCHAR(64) NOT NULL,
  customer_id        VARCHAR(64) NOT NULL,
  challenge_id       VARCHAR(64),
  branch_run_id      VARCHAR(64),
  modality           VARCHAR(16) NOT NULL,
  asset_hash         VARCHAR(128) NOT NULL,
  source             VARCHAR(32) NOT NULL DEFAULT 'agent',
  verdict            VARCHAR(32) NOT NULL,
  confidence         DECIMAL(6,5),
  authenticity_score DECIMAL(6,5),
  explainability_json JSON,
  human_outcome      VARCHAR(32),
  ground_truth       VARCHAR(32),
  ts                 TIMESTAMP NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_events_customer_ts (tenant_id, customer_id, ts),
  INDEX idx_events_challenge (challenge_id),
  INDEX idx_events_branch (branch_run_id),
  CONSTRAINT fk_event_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
  CONSTRAINT fk_event_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE IF NOT EXISTS procedural_policies (
  policy_id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id          VARCHAR(64) NOT NULL,
  risk_tier          VARCHAR(32) NOT NULL,
  policy_version     VARCHAR(64) NOT NULL,
  threshold_auth     DECIMAL(6,5) NOT NULL,
  threshold_attack   DECIMAL(6,5) NOT NULL,
  escalation_rule    JSON NOT NULL,
  policy_sql         JSON NULL,
  is_active          TINYINT(1) NOT NULL DEFAULT 0,
  valid_from         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  valid_to           TIMESTAMP NULL,
  created_by         VARCHAR(128) NOT NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_policy_version (tenant_id, risk_tier, policy_version),
  INDEX idx_policy_active (tenant_id, risk_tier, is_active, valid_from)
);

CREATE TABLE IF NOT EXISTS branch_runs (
  branch_run_id      VARCHAR(64) PRIMARY KEY,
  tenant_id          VARCHAR(64) NOT NULL,
  source_branch      VARCHAR(128) NOT NULL,
  branch_name        VARCHAR(128) NOT NULL,
  created_by         VARCHAR(128) NOT NULL,
  drift_signal       VARCHAR(255) NOT NULL,
  hypothesis         TEXT NOT NULL,
  status             VARCHAR(32) NOT NULL DEFAULT 'running',
  metrics_json       JSON,
  started_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at        TIMESTAMP NULL,
  promoted           TINYINT(1) NOT NULL DEFAULT 0,
  archived           TINYINT(1) NOT NULL DEFAULT 0,
  audit_package_ref   VARCHAR(255),
  CONSTRAINT fk_branch_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

CREATE TABLE IF NOT EXISTS branch_trial_results (
  trial_id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  branch_run_id      VARCHAR(64) NOT NULL,
  window_days        INT NOT NULL,
  delta_fpr          DECIMAL(8,6),
  delta_fnr          DECIMAL(8,6),
  delta_latency_ms   DECIMAL(10,3),
  replay_size        INT,
  adversarial_passed  TINYINT(1) DEFAULT NULL,
  winner             TINYINT(1) DEFAULT 0,
  notes              JSON,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_trial_branch FOREIGN KEY (branch_run_id) REFERENCES branch_runs(branch_run_id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  audit_id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id          VARCHAR(64),
  branch_run_id      VARCHAR(64),
  event_type         VARCHAR(64) NOT NULL,
  actor              VARCHAR(128) NOT NULL,
  payload_json       JSON NOT NULL,
  ts                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_tenant_ts (tenant_id, ts),
  INDEX idx_audit_branch (branch_run_id, ts),
  CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
  CONSTRAINT fk_audit_branch FOREIGN KEY (branch_run_id) REFERENCES branch_runs(branch_run_id)
);

-- 1-query scoring statement used by the demo path
CREATE VIEW IF NOT EXISTS v_authenticity_feature_view AS
SELECT
  c.challenge_id,
  c.tenant_id,
  c.customer_id,
  c.modality,
  MIN(VEC_COSINE_DISTANCE(f_auth.embedding, c.current_embedding)) AS auth_distance,
  MIN(VEC_COSINE_DISTANCE(f_atk.embedding, c.current_embedding)) AS attack_distance,
  COUNT(CASE WHEN e.verdict = 'flagged' AND e.ts > NOW() - INTERVAL 90 DAY THEN 1 END) AS recent_flags,
  AVG(CASE WHEN e.ts > NOW() - INTERVAL 30 DAY THEN e.confidence END) AS trailing_confidence,
  p.policy_version,
  p.threshold_auth,
  p.threshold_attack,
  p.escalation_rule
FROM active_challenges c
LEFT JOIN authentic_fingerprints f_auth
  ON f_auth.tenant_id = c.tenant_id
  AND f_auth.customer_id = c.customer_id
  AND f_auth.modality = c.modality
  AND f_auth.is_current = 1
LEFT JOIN attack_fingerprints f_atk
  ON f_atk.modality = c.modality
LEFT JOIN episodic_events e
  ON e.tenant_id = c.tenant_id
  AND e.customer_id = c.customer_id
LEFT JOIN procedural_policies p
  ON p.tenant_id = c.tenant_id
  AND p.risk_tier = c.risk_tier
  AND p.is_active = 1
WHERE c.status = 'open'
GROUP BY c.challenge_id, c.tenant_id, c.customer_id, c.modality,
         p.policy_version, p.threshold_auth, p.threshold_attack, p.escalation_rule;
