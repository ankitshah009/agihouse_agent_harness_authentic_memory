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

      <div style={{ padding: "32px" }}>
        <div style={{
          marginBottom: "40px",
          position: "relative"
        }}>
          <div style={{ position: "relative", zIndex: 1 }}>
            <h1 style={{
              fontSize: "var(--text-3xl)",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "12px",
              background: "var(--gradient-primary)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text"
            }}>
              Authenticity Memory Layer
            </h1>
            <p style={{
              fontSize: "var(--text-lg)",
              color: "var(--text-secondary)",
              maxWidth: "600px",
              lineHeight: 1.6
            }}>
              Real-time authenticity verification and memory management for AI agents. Monitor challenges, track episodes, and enforce policy rules across your entire system.
            </p>
          </div>
        </div>

        <div style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid var(--glass-border)",
          borderRadius: "var(--radius-xl)",
          padding: "32px",
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "300px",
            height: "300px",
            background: "var(--gradient-secondary)",
            opacity: 0.05,
            filter: "blur(80px)",
            borderRadius: "50%"
          }} />
          <Xhair>
            <ScenarioConsole />
          </Xhair>
        </div>
      </div>
    </main>
  );
}
