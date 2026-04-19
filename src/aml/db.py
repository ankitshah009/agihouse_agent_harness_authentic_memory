import json
import os
import sqlite3
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from .vector import json_dump_vector


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


@dataclass
class StoreConfig:
    backend: str
    url: Optional[str] = None
    db_path: Optional[str] = None


class MemoryStore:
    def __init__(self, cfg: StoreConfig):
        self.cfg = cfg
        self.backend = cfg.backend
        self.conn = None

        if self.backend == "tidb":
            self._init_tidb()
        else:
            self._init_sqlite()

    def _init_sqlite(self):
        path = self.cfg.db_path or os.environ.get("AML_SQLITE_PATH", "./data/aml_memory.sqlite")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._ensure_sqlite_schema()

    def _init_tidb(self):
        # Optional path for connected TiDB. Keep explicit and fail fast if deps are missing.
        try:
            import mysql.connector  # noqa: F401
        except Exception as exc:
            raise RuntimeError("mysql.connector is required for TiDB backend") from exc

        if not self.cfg.url:
            raise RuntimeError("DATABASE_URL (DSN) is required for TiDB backend")

        parsed = urlparse(self.cfg.url)
        if not parsed.hostname or not parsed.path:
            raise RuntimeError("DATABASE_URL must include host and database (mysql://user:pass@host:port/db)")

        self._tidb_params = dict(
            user=parsed.username,
            password=parsed.password,
            host=parsed.hostname,
            port=parsed.port or 4000,
            database=parsed.path.lstrip("/") or "aubric_aml",
            autocommit=True,
            connection_timeout=15,
            # Use pure-Python implementation. The C extension (_mysql_connector)
            # has a double-free bug in its OpenSSL cleanup path on macOS that
            # SIGTRAPs the interpreter when closing a broken TLS connection
            # (observed during reconnect after TiDB Cloud Serverless idles us
            # out). The pure-Python path is slightly slower but doesn't crash.
            use_pure=True,
        )
        self._connect_tidb()

    def _connect_tidb(self):
        import mysql.connector
        self.conn = mysql.connector.connect(**self._tidb_params)

    def execute(self, sql: str, params: Optional[tuple] = None):
        if self.backend == "tidb" and params is not None:
            # mysql-connector expects %s placeholders; existing SQL in this repo uses ?.
            sql = sql.replace("?", "%s")

        if self.backend != "tidb":
            cur = self.conn.cursor()
            if params is not None:
                cur.execute(sql, params)
            else:
                cur.execute(sql)
            return cur

        # TiDB path: try, and on ANY failure rebuild the connection and retry
        # once. We never call ping() because it can segfault the interpreter
        # when the socket is half-dead (see note on use_pure above).
        try:
            cur = self.conn.cursor()
            if params is not None:
                cur.execute(sql, params)
            else:
                cur.execute(sql)
            return cur
        except Exception:
            try:
                self.conn.close()
            except Exception:
                pass
            self._connect_tidb()
            cur = self.conn.cursor()
            if params is not None:
                cur.execute(sql, params)
            else:
                cur.execute(sql)
            return cur

    def fetchone(self, sql: str, params: Optional[tuple] = None):
        cur = self.execute(sql, params)
        row = cur.fetchone()
        if row is None:
            cur.close()
            return None
        if not isinstance(row, dict):
            row = dict(zip([d[0] for d in cur.description], row))
        cur.close()
        return row

    def fetchall(self, sql: str, params: Optional[tuple] = None):
        cur = self.execute(sql, params)
        rows = cur.fetchall()
        if not rows:
            cur.close()
            return []
        if self.backend == "sqlite":
            rows = [dict(r) for r in rows]
        else:
            rows = [dict(zip([d[0] for d in cur.description], r)) for r in rows]
        cur.close()
        return rows

    def _ensure_sqlite_schema(self):
        schema = """
        CREATE TABLE IF NOT EXISTS tenants (
          tenant_id TEXT PRIMARY KEY,
          tenant_name TEXT NOT NULL,
          legal_entity TEXT,
          compliance_region TEXT NOT NULL DEFAULT 'US',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS customers (
          customer_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          risk_tier TEXT NOT NULL,
          customer_type TEXT NOT NULL DEFAULT 'consumer',
          status TEXT NOT NULL DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS active_challenges (
          challenge_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          modality TEXT NOT NULL,
          asset_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open',
          current_embedding TEXT NOT NULL,
          raw_features TEXT,
          model_version TEXT,
          risk_tier TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          ttl_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS authentic_fingerprints (
          fingerprint_id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          modality TEXT NOT NULL,
          modality_version TEXT DEFAULT 'v1',
          embedding TEXT NOT NULL,
          source_event_id TEXT,
          is_current INTEGER NOT NULL DEFAULT 1,
          quality_score REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS attack_fingerprints (
          attack_id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_scope TEXT NOT NULL DEFAULT 'global',
          modality TEXT NOT NULL,
          generator_family TEXT,
          attack_family TEXT,
          embedding TEXT NOT NULL,
          source_url TEXT,
          exa_observation_id TEXT,
          severity_band TEXT NOT NULL DEFAULT 'medium',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS episodic_events (
          event_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          challenge_id TEXT,
          branch_run_id TEXT,
          modality TEXT NOT NULL,
          asset_hash TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'agent',
          verdict TEXT NOT NULL,
          confidence REAL,
          authenticity_score REAL,
          explainability_json TEXT,
          human_outcome TEXT,
          ground_truth TEXT,
          auth_distance REAL,
          attack_distance REAL,
          ts DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS procedural_policies (
          policy_id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id TEXT NOT NULL,
          risk_tier TEXT NOT NULL,
          policy_version TEXT NOT NULL,
          threshold_auth REAL NOT NULL,
          threshold_attack REAL NOT NULL,
          escalation_rule TEXT NOT NULL,
          policy_sql TEXT,
          is_active INTEGER NOT NULL DEFAULT 0,
          valid_from DATETIME DEFAULT CURRENT_TIMESTAMP,
          valid_to DATETIME,
          created_by TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS branch_runs (
          branch_run_id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          source_branch TEXT NOT NULL,
          branch_name TEXT NOT NULL,
          created_by TEXT NOT NULL,
          drift_signal TEXT NOT NULL,
          hypothesis TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'running',
          metrics_json TEXT,
          started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          finished_at DATETIME,
          promoted INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          audit_package_ref TEXT
        );

        CREATE TABLE IF NOT EXISTS branch_trial_results (
          trial_id INTEGER PRIMARY KEY AUTOINCREMENT,
          branch_run_id TEXT NOT NULL,
          window_days INTEGER NOT NULL,
          delta_fpr REAL,
          delta_fnr REAL,
          delta_latency_ms REAL,
          replay_size INTEGER,
          adversarial_passed INTEGER,
          winner INTEGER DEFAULT 0,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_events (
          audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id TEXT,
          branch_run_id TEXT,
          event_type TEXT NOT NULL,
          actor TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          ts DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """
        self.conn.executescript(schema)

    def get_connection(self):
        return self.conn

    @staticmethod
    def _coerce_json(value):
        if value is None:
            return None
        if isinstance(value, (dict, list)):
            return value
        if isinstance(value, str):
            try:
                return json.loads(value)
            except Exception:
                return value
        return value

    def get_policy(self, tenant_id: str, risk_tier: str):
        row = self.fetchone(
            """
            SELECT * FROM procedural_policies
            WHERE tenant_id=? AND risk_tier=? AND is_active=1
            ORDER BY policy_id DESC LIMIT 1
            """,
            (tenant_id, risk_tier),
        )
        if not row:
            return {
                "policy_version": "policy-default",
                "threshold_auth": 0.24,
                "threshold_attack": 0.22,
                "escalation_rule": {"review_if_auth_gap": 0.24, "deny_if_attack_match": 0.20},
            }
        row["escalation_rule"] = self._coerce_json(row.get("escalation_rule"))
        return row

    def get_any_active_policy(self, tenant_id: str):
        row = self.fetchone(
            """
            SELECT * FROM procedural_policies
            WHERE tenant_id=? AND is_active=1
            ORDER BY policy_id DESC LIMIT 1
            """,
            (tenant_id,),
        )
        if row is None:
            return None
        row["escalation_rule"] = self._coerce_json(row.get("escalation_rule"))
        return row

    def get_challenge(self, challenge_id: str, tenant_id: str):
        return self.fetchone(
            "SELECT * FROM active_challenges WHERE challenge_id=? AND tenant_id=?",
            (challenge_id, tenant_id),
        )

    def set_challenge_status(self, challenge_id: str, tenant_id: str, status: str):
        self.execute(
            "UPDATE active_challenges SET status=? WHERE challenge_id=? AND tenant_id=?",
            (status, challenge_id, tenant_id),
        )

    def list_authentic_fingerprints(self, tenant_id: str, customer_id: str, modality: str):
        return self.fetchall(
            "SELECT * FROM authentic_fingerprints WHERE tenant_id=? AND customer_id=? AND modality=? AND is_current=1",
            (tenant_id, customer_id, modality),
        )

    def list_attack_fingerprints(self, tenant_id: str, modality: str):
        return self.fetchall(
            """
            SELECT * FROM attack_fingerprints
            WHERE modality=?
              AND (tenant_scope='global' OR tenant_scope IS NULL OR tenant_scope=?)
            """,
            (modality, tenant_id),
        )

    def upsert_authentic_fingerprint(self, tenant_id, customer_id, modality, embedding, source_event_id=None, quality_score=None):
        self.execute(
            "UPDATE authentic_fingerprints SET is_current=0 WHERE tenant_id=? AND customer_id=? AND modality=?",
            (tenant_id, customer_id, modality),
        )
        cur = self.execute(
            """
            INSERT INTO authentic_fingerprints
              (tenant_id, customer_id, modality, embedding, source_event_id, quality_score)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (tenant_id, customer_id, modality, json_dump_vector(embedding), source_event_id, quality_score),
        )
        if self.backend == "sqlite":
            return int(self.conn.execute("select last_insert_rowid()").fetchone()[0])
        return int(cur.lastrowid)

    def log_episode(
        self,
        event_id: str,
        tenant_id: str,
        customer_id: str,
        challenge_id: str,
        modality: str,
        asset_hash: str,
        verdict: str,
        confidence: float = None,
        authenticity_score: float = None,
        explainability_json: Dict[str, Any] = None,
        human_outcome: str = None,
        ground_truth: str = None,
        ts: str = None,
        branch_run_id: str = None,
        auth_distance: float = None,
        attack_distance: float = None,
    ):
        self.execute(
            """
            INSERT INTO episodic_events
            (event_id, tenant_id, customer_id, challenge_id, modality, asset_hash, verdict,
             confidence, authenticity_score, explainability_json, human_outcome, ground_truth,
             ts, branch_run_id, auth_distance, attack_distance)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                tenant_id,
                customer_id,
                challenge_id,
                modality,
                asset_hash,
                verdict,
                confidence,
                authenticity_score,
                None if explainability_json is None else json.dumps(explainability_json),
                human_outcome,
                ground_truth,
                ts,
                branch_run_id,
                auth_distance,
                attack_distance,
            ),
        )

    def list_recent_events(self, tenant_id: str, customer_id: str = None, days: int = 90):
        days = int(days)
        if customer_id:
            if self.backend == "tidb":
                return self.fetchall(
                    """
                    SELECT * FROM episodic_events
                    WHERE tenant_id=%s AND customer_id=%s AND ts >= NOW() - INTERVAL %s DAY
                    ORDER BY ts DESC
                    """,
                    (tenant_id, customer_id, days),
                )
            return self.fetchall(
                """
                SELECT * FROM episodic_events
                WHERE tenant_id=? AND customer_id=? AND ts >= datetime('now', ?)
                ORDER BY ts DESC
                """,
                (tenant_id, customer_id, f"-{days} day"),
            )
        if self.backend == "tidb":
            return self.fetchall(
                "SELECT * FROM episodic_events WHERE tenant_id=%s AND ts >= NOW() - INTERVAL %s DAY ORDER BY ts DESC",
                (tenant_id, days),
            )
        return self.fetchall(
            "SELECT * FROM episodic_events WHERE tenant_id=? AND ts >= datetime('now', ?) ORDER BY ts DESC",
            (tenant_id, f"-{days} day"),
        )

    def create_branch_run(
        self,
        branch_run_id: str,
        tenant_id: str,
        source_branch: str,
        branch_name: str,
        created_by: str,
        drift_signal: str,
        hypothesis: str,
    ):
        self.execute(
            """
            INSERT INTO branch_runs
            (branch_run_id, tenant_id, source_branch, branch_name, created_by, drift_signal, hypothesis)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (branch_run_id, tenant_id, source_branch, branch_name, created_by, drift_signal, hypothesis),
        )

    def close_branch_run(self, branch_run_id: str, status: str, promoted: int, archived: int, metrics_json: Optional[Dict[str, Any]] = None):
        self.execute(
            """
            UPDATE branch_runs
               SET status=?, promoted=?, archived=?, finished_at=CURRENT_TIMESTAMP, metrics_json=?
             WHERE branch_run_id=?
            """,
            (status, promoted, archived, None if metrics_json is None else json.dumps(metrics_json), branch_run_id),
        )

    def record_trial(self, branch_run_id: str, window_days: int, delta_fpr: float, delta_fnr: float, delta_latency_ms: float, replay_size: int, adversarial_passed: bool, winner: bool, notes: Dict[str, Any]):
        self.execute(
            """
            INSERT INTO branch_trial_results
            (branch_run_id, window_days, delta_fpr, delta_fnr, delta_latency_ms, replay_size, adversarial_passed, winner, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                branch_run_id,
                window_days,
                delta_fpr,
                delta_fnr,
                delta_latency_ms,
                replay_size,
                1 if adversarial_passed else 0,
                1 if winner else 0,
                json.dumps(notes),
            ),
        )

    def log_audit_event(self, tenant_id, branch_run_id, event_type, actor, payload):
        self.execute(
            "INSERT INTO audit_events (tenant_id, branch_run_id, event_type, actor, payload_json) VALUES (?, ?, ?, ?, ?)",
            (tenant_id, branch_run_id, event_type, actor, json.dumps(payload)),
        )

    def execute_killer_query(self, challenge_id: str, tenant_id: str) -> Dict[str, Any]:
        """Run the authenticity killer SQL directly on TiDB.

        On SQLite, returns executed=False so the service layer can fall back
        to the Python cosine-distance path (SQLite lacks VEC_COSINE_DISTANCE).
        """
        if self.backend != "tidb":
            return {"row": None, "elapsed_ms": 0.0, "executed": False}

        start = time.time()
        row = self.fetchone(KILLER_QUERY_TEMPLATE, (challenge_id,))
        elapsed_ms = round((time.time() - start) * 1000, 3)

        if not row:
            return {"row": None, "elapsed_ms": elapsed_ms, "executed": True}

        escalation_rule = self._coerce_json(row.get("escalation_rule"))
        shaped = {
            "challenge_id": row.get("challenge_id"),
            "customer_id": row.get("customer_id"),
            "modality": row.get("modality"),
            "auth_distance": float(row["auth_distance"]) if row.get("auth_distance") is not None else 1.0,
            "attack_distance": float(row["attack_distance"]) if row.get("attack_distance") is not None else 1.0,
            "recent_flags": int(row.get("recent_flags") or 0),
            "trailing_confidence": (
                float(row["trailing_confidence"]) if row.get("trailing_confidence") is not None else None
            ),
            "policy_version": row.get("policy_version"),
            "threshold_auth": (
                float(row["threshold_auth"]) if row.get("threshold_auth") is not None else None
            ),
            "threshold_attack": (
                float(row["threshold_attack"]) if row.get("threshold_attack") is not None else None
            ),
            "escalation_rule": escalation_rule,
        }
        return {"row": shaped, "elapsed_ms": elapsed_ms, "executed": True}

    def get_branch_bundle(self, branch_run_id: str):
        run = self.fetchone("SELECT * FROM branch_runs WHERE branch_run_id=?", (branch_run_id,))
        trial = self.fetchone(
            "SELECT * FROM branch_trial_results WHERE branch_run_id=? ORDER BY trial_id DESC LIMIT 1",
            (branch_run_id,),
        )
        audits = self.fetchall("SELECT * FROM audit_events WHERE branch_run_id=? ORDER BY audit_id ASC", (branch_run_id,))
        return {
            "branch_run": run,
            "trial": trial,
            "audits": audits,
        }

    def close(self):
        if self.conn:
            self.conn.commit()
            self.conn.close()
            self.conn = None
