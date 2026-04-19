"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

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

// Syntax highlight colors use design tokens where semantic; keep minimal
// inline mappings only for token *classes* so the SQL body stays readable
// on a projector. Keywords -> accent, strings -> warning, numbers -> accent
// (lighter), comments -> ink-3 italic, identifiers -> ink, symbols -> ink-2.
const kindStyle = {
  kw: { color: "var(--accent)", fontWeight: 700 },
  str: { color: "var(--warning)" },
  num: { color: "var(--accent)" },
  cmt: { color: "var(--ink-3)", fontStyle: "italic" },
  id: { color: "var(--ink)" },
  ws: {},
  sym: { color: "var(--ink-2)" },
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

const LayerPills = ({ items }) => (
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
          background: "var(--paper-2)",
          border: "1px solid var(--rule)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--t-2)",
          color: "var(--ink-2)",
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
        <span style={{ color: "var(--ink-3)" }}>{it.desc}</span>
      </span>
    ))}
  </div>
);

const KillerSqlPanel = ({
  sql,
  elapsedMs,
  queryMs,
  backend,
  executed,
  executing = false,
}) => {
  const rawSql = sql && String(sql).trim().length ? String(sql) : DEFAULT_SQL;

  const lines = useMemo(() => rawSql.split("\n").map(tokenizeLine), [rawSql]);

  const isTidb = backend === "tidb";

  // Live ms counter while executing. Resets to 0 on the rising edge of
  // `executing` and freezes (does not reset) on the falling edge so the
  // final tick remains visible until `elapsedMs`/`queryMs` from the next
  // query-meta update arrives.
  const [tickMs, setTickMs] = useState(0);
  const startRef = useRef(null);
  const wasExecutingRef = useRef(false);

  useEffect(() => {
    if (executing && !wasExecutingRef.current) {
      // rising edge: reset counter
      startRef.current = performance.now();
      setTickMs(0);
      wasExecutingRef.current = true;
    }
    if (!executing) {
      wasExecutingRef.current = false;
    }

    if (!executing) return undefined;

    const id = setInterval(() => {
      if (startRef.current != null) {
        setTickMs(Math.round(performance.now() - startRef.current));
      }
    }, 50);
    return () => clearInterval(id);
  }, [executing]);

  // Latency text: live tick while executing, else sql_elapsed_ms, else
  // query_ms fallback, else em-dash.
  const resolvedMs = Number.isFinite(elapsedMs)
    ? Math.round(elapsedMs)
    : Number.isFinite(queryMs)
    ? Math.round(queryMs)
    : null;
  const latencyText = executing
    ? `${tickMs}ms`
    : resolvedMs != null
    ? `${resolvedMs}ms`
    : "–";

  // Backend pill tones via tokens
  const backendPill = isTidb
    ? {
        text: "tidb",
        color: "var(--success)",
        bg: "color-mix(in srgb, var(--success) 14%, transparent)",
        border: "color-mix(in srgb, var(--success) 55%, transparent)",
        glow: true,
      }
    : {
        text: backend === "sqlite" ? "sqlite · dev" : (backend || "unknown"),
        color: "var(--warning)",
        bg: "color-mix(in srgb, var(--warning) 14%, transparent)",
        border: "color-mix(in srgb, var(--warning) 55%, transparent)",
        glow: false,
      };

  return (
    <div
      style={{
        position: "relative",
        background: "var(--paper)",
        border: "1px solid var(--rule)",
        borderRadius: "var(--radius-xl, 16px)",
        padding: "18px 20px 16px",
        boxShadow:
          "0 20px 40px rgba(0,0,0,0.18), 0 0 40px color-mix(in srgb, var(--accent) 10%, transparent)",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes killerPulse {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 55%, transparent); }
          50%      { box-shadow: 0 0 0 10px color-mix(in srgb, var(--success) 0%, transparent); }
        }
        @keyframes killerTitlePulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.68; }
        }
        @keyframes killerEyebrowDot {
          0%, 100% { transform: scale(1);   opacity: 1;   }
          50%      { transform: scale(1.4); opacity: 0.55;}
        }
        .killer-pulse       { animation: killerPulse 2.2s ease-in-out infinite; }
        .killer-title-pulse { animation: killerTitlePulse 1.4s ease-in-out infinite; }
        .killer-eyebrow-dot { animation: killerEyebrowDot 1s ease-in-out infinite; }
      `}</style>

      {/* ───────── Hero block (eyebrow + title + secondary + backend pill) ───────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          {/* Executing eyebrow — reserved height so layout doesn't jump */}
          <div
            className="eyebrow"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minHeight: 16,
              color: "var(--success)",
              opacity: executing ? 1 : 0,
              transition: "opacity 160ms ease",
              letterSpacing: "0.12em",
              fontSize: "var(--t-2, 12px)",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            <span
              className="killer-eyebrow-dot"
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--success)",
                boxShadow: "0 0 10px var(--success)",
                display: "inline-block",
              }}
            />
            executing on TiDB…
          </div>

          {/* Primary title */}
          <div
            className={executing ? "killer-title-pulse" : ""}
            style={{
              marginTop: 4,
              fontFamily: "var(--font-sans)",
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              lineHeight: 1.15,
              color: "var(--ink)",
            }}
          >
            One SQL. Four memory layers.
          </div>

          {/* Secondary line */}
          <div
            style={{
              marginTop: 4,
              fontFamily: "var(--font-mono)",
              fontSize: 13.5,
              lineHeight: 1.4,
              color: "var(--ink-2)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            <span>TiDB Cloud</span>
            <span style={{ margin: "0 8px", color: "var(--ink-3)" }}>·</span>
            <span>HTAP + HNSW</span>
            <span style={{ margin: "0 8px", color: "var(--ink-3)" }}>·</span>
            <span
              className="num"
              style={{
                color: executing ? "var(--success)" : "var(--ink)",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {latencyText}
            </span>
          </div>
        </div>

        {/* Backend badge */}
        <div
          className={backendPill.glow ? "killer-pulse" : ""}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderRadius: 999,
            background: backendPill.bg,
            border: `1px solid ${backendPill.border}`,
            color: backendPill.color,
            fontFamily: "var(--font-mono)",
            fontSize: "var(--t-2, 12px)",
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
          title={isTidb ? "TiDB Cloud Serverless · HNSW vector index" : "Local SQLite fallback (dev)"}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: backendPill.color,
              boxShadow: `0 0 10px ${backendPill.color}`,
            }}
          />
          {backendPill.text}
          {!isTidb ? null : executed === true ? null : (
            <span style={{ opacity: 0.7, fontWeight: 600 }}>· template</span>
          )}
        </div>
      </div>

      {/* thin rule under hero */}
      <div style={{ height: 1, background: "var(--rule)", margin: "12px -20px 0" }} />

      {/* ───────── SQL body ───────── */}
      <pre
        className="mono"
        style={{
          margin: "12px 0 0",
          padding: "12px 14px",
          background: "var(--paper-2)",
          border: "1px solid var(--rule)",
          borderRadius: 12,
          maxHeight: 300,
          overflow: "auto",
          fontSize: "12.5px",
          lineHeight: 1.55,
          color: "var(--ink)",
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
                  color: "var(--ink-3)",
                  textAlign: "right",
                  userSelect: "none",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {idx + 1}
              </span>
              <span style={{ color: "var(--ink)", whiteSpace: "pre" }}>
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

      {/* ───────── Layer pills ───────── */}
      <LayerPills
        items={[
          { label: "semantic", desc: "MIN(VEC_COSINE_DISTANCE)", color: "var(--success)" },
          { label: "episodic", desc: "COUNT recent flags", color: "var(--warning)" },
          { label: "procedural", desc: "JOIN policy", color: "var(--accent)" },
        ]}
      />
    </div>
  );
};

export default KillerSqlPanel;
