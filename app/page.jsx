"use client";

import { useMemo, useState } from "react";
import { Xhair } from "../components/Primitives";
import ScenarioConsole from "../components/ScenarioConsole";

const TABS = [
  { id: "console", label: "Dashboard", sub: "Live challenges" },
];

const STATS = [
  { label: "Active Challenges", value: "24", change: "+12%", trend: "up" },
  { label: "Authenticity Score", value: "94.2%", change: "+2.1%", trend: "up" },
  { label: "Episodes Logged", value: "1,847", change: "+156", trend: "up" },
  { label: "Policy Rules", value: "42", change: "+3", trend: "neutral" },
];

export default function HomePage() {
  const [tab, setTab] = useState("console");

  const ActiveTab = useMemo(() => {
    return {
      console: ScenarioConsole,
    }[tab];
  }, [tab]);

  return (
    <main>
      <div className="tabbar">
        <div className="brand">
          <div style={{ width: 10, height: 10, background: "rgba(255,255,255,0.3)", borderRadius: "50%" }} />
          <span style={{ letterSpacing: "0.08em", fontSize: "13px" }}>
            AUBRIC · AML
          </span>
        </div>

        <div className="tabset" role="tablist" aria-label="Demo tabs">
          {TABS.map((item) => (
            <button
              className={`tab ${tab === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => setTab(item.id)}
              role="tab"
              aria-selected={tab === item.id}
            >
              {item.label}
              <span className="eyebrow">{item.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "32px" }}>
        {/* Hero Section */}
        <div style={{
          marginBottom: "40px",
          position: "relative"
        }}>
          <div style={{
            position: "absolute",
            top: "-50%",
            left: "-50%",
            width: "200%",
            height: "200%",
            background: "var(--gradient-primary)",
            opacity: 0.05,
            filter: "blur(100px)",
            borderRadius: "50%",
            animation: "gradientShift 20s ease infinite"
          }} />
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

        {/* Stats Grid */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", 
          gap: "24px",
          marginBottom: "40px"
        }}>
          {STATS.map((stat, index) => (
            <div 
              key={index} 
              style={{
                background: "var(--glass-bg)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid var(--glass-border)",
                borderRadius: "var(--radius-xl)",
                padding: "28px",
                position: "relative",
                overflow: "hidden",
                animation: `float 6s ease-in-out ${index * 0.2}s infinite`,
                transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                cursor: "pointer"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-8px) scale(1.02)";
                e.currentTarget.style.boxShadow = "0 20px 40px rgba(102, 126, 234, 0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.boxShadow = "";
              }}
            >
              <div style={{
                position: "absolute",
                top: "-50%",
                right: "-50%",
                width: "100%",
                height: "100%",
                background: index % 2 === 0 ? "var(--gradient-primary)" : "var(--gradient-success)",
                opacity: 0.12,
                borderRadius: "50%",
                filter: "blur(40px)",
                transition: "all 0.4s ease"
              }} />
              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{ 
                  fontSize: "var(--text-xs)", 
                  color: "var(--text-tertiary)", 
                  textTransform: "uppercase", 
                  letterSpacing: "0.05em",
                  marginBottom: "12px",
                  fontWeight: 600
                }}>
                  {stat.label}
                </div>
                <div style={{ 
                  fontSize: "var(--text-3xl)", 
                  fontWeight: 800, 
                  color: "var(--text-primary)",
                  marginBottom: "12px",
                  letterSpacing: "-0.02em"
                }}>
                  {stat.value}
                </div>
                <div style={{ 
                  fontSize: "var(--text-sm)", 
                  color: stat.trend === "up" ? "var(--success)" : "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}>
                  <span style={{ 
                    fontWeight: 700,
                    background: stat.trend === "up" ? "var(--success-bg)" : "transparent",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "var(--text-xs)"
                  }}>{stat.change}</span>
                  <span style={{ opacity: 0.7 }}>vs last week</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Main Content */}
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
            <ActiveTab />
          </Xhair>
        </div>
      </div>
    </main>
  );
}

