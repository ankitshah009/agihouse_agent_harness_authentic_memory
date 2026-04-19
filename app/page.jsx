"use client";

import { Xhair } from "../components/Primitives";
import ScenarioConsole from "../components/ScenarioConsole";

export default function HomePage() {
  return (
    <main>
      <div className="tabbar">
        <div className="brand">
          <div style={{ width: 10, height: 10, background: "rgba(255,255,255,0.3)", borderRadius: "50%" }} />
          <span style={{ letterSpacing: "0.08em", fontSize: "13px" }}>
            AUBRIC · AML
          </span>
        </div>
      </div>

      <div style={{ padding: "20px 32px 32px" }}>
        <div style={{ marginBottom: "16px" }}>
          <h1 style={{
            fontSize: "18px",
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 6px",
            letterSpacing: "0.01em"
          }}>
            Aubric AML · Authenticity Memory Layer
          </h1>
          <p style={{
            fontSize: "14px",
            color: "var(--text-secondary)",
            margin: 0,
            lineHeight: 1.5
          }}>
            A $250K wire blocked in &lt;1s — because TiDB remembered a voice from three weeks ago.
          </p>
        </div>

        <div style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid var(--glass-border)",
          borderRadius: "var(--radius-xl)",
          padding: "24px",
          position: "relative",
          overflow: "hidden"
        }}>
          <Xhair>
            <ScenarioConsole />
          </Xhair>
        </div>
      </div>
    </main>
  );
}
