"use client";

import { Card, Rule, Tag, Xhair } from "./Primitives";

const LAYERS = [
  {
    n: "01",
    tone: "ink",
    label: "Short-term",
    sub: "active session",
    desc: "Current challenge state kept transactionally for hot-path decisions.",
    tech: ["active_challenges", "TiKV row-store", "sub-ms writes"],
  },
  {
    n: "02",
    tone: "verify",
    label: "Semantic",
    sub: "authenticity fingerprints",
    desc: "Customer truth baselines + attack corpus in a single vector index.",
    tech: ["authentic_fingerprints", "attack_fingerprints", "VECTOR · HNSW cosine"],
  },
  {
    n: "03",
    tone: "alarm",
    label: "Episodic",
    sub: "historical trail",
    desc: "Every verdict + outcome + telemetry event; replayed to validate policy drift.",
    tech: ["episodic_events", "TiFlash columnar", "time-windowed analytics"],
  },
  {
    n: "04",
    tone: "amber",
    label: "Procedural",
    sub: "learned policy",
    desc: "Branchable policy SQL with versioned thresholds and audit artifacts.",
    tech: ["procedural_policies", "branch_runs", "audit trail"],
  },
];

const STEPS = [
  "HTAP scan detects drift signal",
  "TiDB branch + Daytona sandbox isolation",
  "Replay 90 days of episodic decisions",
  "Adversarial evidence check",
  "Promote or archive candidate branch",
];

const toneClass = {
  ink: "var(--ink)",
  verify: "var(--verify)",
  alarm: "var(--alarm)",
  amber: "var(--amber)",
};

export default function ArchitecturePanel() {
  return (
    <section style={{ background: "var(--paper-3)", minHeight: "100vh", padding: "20px 22px 32px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, marginBottom: 18 }}>
        <div>
          <div className="eyebrow">Architecture / Product fit</div>
          <h1 className="serif" style={{ margin: "6px 0 0", fontSize: "var(--t-6)", lineHeight: 1.05 }}>
            Four memory layers. One hot path.
          </h1>
        </div>
        <div className="eyebrow" style={{ textAlign: "right" }}>TiDB · Daytona · Exa · MCP</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {LAYERS.map((layer) => {
          const c = toneClass[layer.tone];
          return (
            <div key={layer.n} className="card" style={{ borderColor: c }}>
              <div className="head" style={{ background: c, color: "var(--paper)" }}>
                <span style={{ letterSpacing: "0.12em", fontSize: "var(--t-1)" }}>LAYER {layer.n}</span>
                <span>{layer.sub}</span>
              </div>
              <div className="body">
                <div style={{ fontFamily: "var(--serif)", fontSize: "var(--t-4)", marginBottom: 8 }}>{layer.label}</div>
                <div style={{ marginBottom: 10, color: "var(--ink-2)", minHeight: 64 }}>{layer.desc}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {layer.tech.map((item) => <Tag key={item} tone="ghost">{item}</Tag>)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Rule dotted />

      <Card title="The update loop" right={<Tag tone="verify">no prod write</Tag>} style={{ marginTop: 18 }}>
        <div style={{ display: "grid", gap: 10 }}>
          {STEPS.map((step, i) => (
            <div key={step} style={{ display: "grid", gridTemplateColumns: "40px 1fr", gap: 10, alignItems: "start" }}>
              <div className="num" style={{ color: "var(--ink-3)" }}>{String(i + 1).padStart(2, "0")}</div>
              <div>{step}</div>
            </div>
          ))}
        </div>
      </Card>

      <Xhair style={{ marginTop: 22 }}>
        <div style={{ padding: 14, border: "1px solid var(--ink)" }}>
          <div className="eyebrow">The core SQL shape</div>
          <pre className="code">
{`SELECT ... MIN(VEC_COSINE_DISTANCE(...)) AS auth_distance,
MIN(VEC_COSINE_DISTANCE(...)) AS attack_distance,
COUNT(...) AS recent_flags,
p.policy_version, p.threshold_auth, p.threshold_attack
FROM active_challenges c
LEFT JOIN authentic_fingerprints f_auth ...
LEFT JOIN attack_fingerprints f_atk ...
LEFT JOIN episodic_events e ...
LEFT JOIN procedural_policies p ...`}
          </pre>
        </div>
      </Xhair>
    </section>
  );
}

