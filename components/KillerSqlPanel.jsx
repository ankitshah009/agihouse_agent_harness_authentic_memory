"use client";

import { Fragment, useMemo } from "react";

const SQL_KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "AS", "JOIN", "LEFT", "RIGHT", "INNER",
  "OUTER", "ON", "AND", "OR", "NOT", "IN", "IS", "NULL", "MIN", "MAX",
  "COUNT", "SUM", "AVG", "GROUP", "BY", "ORDER", "LIMIT", "OFFSET",
  "HAVING", "WITH", "UNION", "ALL", "DISTINCT", "CASE", "WHEN", "THEN",
  "ELSE", "END", "CAST", "COALESCE", "USING", "VALUES", "INSERT", "UPDATE",
  "DELETE", "SET", "INTO", "CREATE", "TABLE", "INDEX", "VIEW", "EXISTS",
  "BETWEEN", "LIKE", "DESC", "ASC", "INTERVAL", "VEC_COSINE_DISTANCE", "NOW",
  "DAY",
]);

const TOKEN_RE = /(--[^\n]*)|('(?:[^'\\]|\\.)*')|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|([^\w\s])/g;

const tokenizeLine = (line) => {
  const out = [];
  if (!line) return out;
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(line)) !== null) {
    const [, comment, str, num, ident, ws, sym] = m;
    if (comment !== undefined) out.push({ kind: "cmt", text: comment });
    else if (str !== undefined) out.push({ kind: "str", text: str });
    else if (num !== undefined) out.push({ kind: "num", text: num });
    else if (ident !== undefined) {
      if (SQL_KEYWORDS.has(ident.toUpperCase())) {
        out.push({ kind: "kw", text: ident.toUpperCase() });
      } else {
        out.push({ kind: "id", text: ident });
      }
    } else if (ws !== undefined) out.push({ kind: "ws", text: ws });
    else if (sym !== undefined) out.push({ kind: "sym", text: sym });
  }
  return out;
};

const kindStyle = {
  kw: { color: "#c084fc", fontWeight: 700 },
  str: { color: "#fbbf24" },
  num: { color: "#4facfe" },
  cmt: { color: "#64748b", fontStyle: "italic" },
  id: { color: "#e2e8f0" },
  ws: {},
  sym: { color: "#94a3b8" },
};

const DEFAULT_SQL = `SELECT c.challenge_id,
  MIN(VEC_COSINE_DISTANCE(c.features_vec, f_auth.embedding)) AS auth_distance,
  MIN(VEC_COSINE_DISTANCE(c.features_vec, f_atk.embedding))  AS attack_distance,
  COUNT(e.event_id) AS recent_flags_90d,
  p.policy_version, p.threshold_auth, p.threshold_attack
FROM active_challenges c
LEFT JOIN authentic_fingerprints f_auth
  ON f_auth.customer_id = c.customer_id AND f_auth.tenant_id = c.tenant_id
LEFT JOIN attack_fingerprints  f_atk
  ON f_atk.tenant_id = c.tenant_id
LEFT JOIN episodic_events e
  ON e.customer_id = c.customer_id
 AND e.ts > NOW() - INTERVAL 90 DAY
 AND e.verdict IN ('deny','review')
LEFT JOIN procedural_policies p
  ON p.tenant_id = c.tenant_id AND p.active = 1
WHERE c.challenge_id = ?
GROUP BY c.challenge_id, p.policy_version, p.threshold_auth, p.threshold_attack;`;

const PillRow = ({ items }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
    {items.map((it) => (
      <span
        key={it.label}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.14)",
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          color: "var(--text-secondary)",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: it.color,
            boxShadow: `0 0 10px ${it.color}`,
          }}
        />
        <strong style={{ color: it.color, fontWeight: 700 }}>{it.label}</strong>
        <span style={{ color: "var(--text-tertiary)" }}>{it.desc}</span>
      </span>
    ))}
  </div>
);

const KillerSqlPanel = ({ sql, elapsedMs, backend, executed }) => {
  const rawSql = sql && String(sql).trim().length ? String(sql) : DEFAULT_SQL;

  const lines = useMemo(() => rawSql.split("\n").map(tokenizeLine), [rawSql]);

  const isTidb = backend === "tidb";
  const isExecuted = executed === true;
  const ms = Number.isFinite(elapsedMs) ? Math.round(elapsedMs) : null;

  let badgeText;
  let badgeTone;
  let badgePulse = false;

  if (isExecuted && isTidb) {
    badgeText = `${ms != null ? ms : "—"}ms`;
    badgeTone = { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.6)", color: "#10b981" };
    badgePulse = true;
  } else if (isExecuted && !isTidb) {
    badgeText = `SIMULATED · ${ms != null ? ms : "—"}ms`;
    badgeTone = { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.5)", color: "#f59e0b" };
  } else {
    badgeText = "QUERY TEMPLATE";
    badgeTone = { bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.35)", color: "#cbd5e1" };
  }

  return (
    <div
      style={{
        position: "relative",
        background: "linear-gradient(180deg, #0b1120 0%, #070a14 100%)",
        border: "1px solid rgba(102,126,234,0.35)",
        borderRadius: "var(--radius-xl)",
        padding: "18px 20px 16px",
        boxShadow: "0 20px 40px rgba(0,0,0,0.45), 0 0 60px rgba(102,126,234,0.15)",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes killerPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.55); transform: scale(1); }
          50% { box-shadow: 0 0 0 10px rgba(16,185,129,0); transform: scale(1.03); }
        }
        .killer-pulse { animation: killerPulse 2.2s ease-in-out infinite; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            fontSize: "11px",
            fontWeight: 700,
            color: "#94a3b8",
          }}
        >
          One SQL. Four memory layers.
        </div>
        <div
          className={badgePulse ? "killer-pulse" : ""}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            borderRadius: 999,
            background: badgeTone.bg,
            border: `1px solid ${badgeTone.border}`,
            color: badgeTone.color,
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: badgeTone.color,
              boxShadow: `0 0 10px ${badgeTone.color}`,
            }}
          />
          {badgeText}
        </div>
      </div>

      <pre
        className="mono"
        style={{
          margin: "12px 0 0",
          padding: "12px 14px",
          background: "rgba(8,12,22,0.65)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 12,
          maxHeight: 320,
          overflow: "auto",
          fontSize: "12.5px",
          lineHeight: 1.55,
        }}
      >
        <code style={{ display: "grid", gap: 0 }}>
          {lines.map((tokens, idx) => (
            <div
              key={idx}
              style={{
                display: "grid",
                gridTemplateColumns: "36px 1fr",
                gap: 8,
              }}
            >
              <span
                style={{
                  color: "#475569",
                  textAlign: "right",
                  userSelect: "none",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {idx + 1}
              </span>
              <span style={{ color: "#e2e8f0", whiteSpace: "pre" }}>
                {tokens.length === 0
                  ? "\u00a0"
                  : tokens.map((t, i) => (
                      <Fragment key={i}>
                        <span style={kindStyle[t.kind] || undefined}>{t.text}</span>
                      </Fragment>
                    ))}
              </span>
            </div>
          ))}
        </code>
      </pre>

      <PillRow
        items={[
          { label: "semantic", desc: "MIN(VEC_COSINE_DISTANCE)", color: "#10b981" },
          { label: "episodic", desc: "COUNT recent flags", color: "#f59e0b" },
          { label: "procedural", desc: "JOIN policy", color: "#c084fc" },
        ]}
      />
    </div>
  );
};

export default KillerSqlPanel;
