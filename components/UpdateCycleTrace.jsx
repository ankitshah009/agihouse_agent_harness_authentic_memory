"use client";

import { useState } from "react";
import { getAudit } from "./AubricApi";

const safeNum = (value, fallback = "—") => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return fallback;
    if (Math.abs(value) >= 10) return value.toFixed(0);
    return value.toFixed(4);
  }
  return String(value);
};

const triggerDownload = (branchRunId, bundle) => {
  const payload = JSON.stringify(bundle, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit_${branchRunId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const Step = ({ index, title, subtitle, detail, tone = "ink", children }) => {
  const colorMap = {
    ink: "#94a3b8",
    verify: "#10b981",
    amber: "#f59e0b",
    alarm: "#ef4444",
    purple: "#c084fc",
  };
  const color = colorMap[tone] || colorMap.ink;
  return (
    <div
      style={{
        position: "relative",
        flex: "1 1 0",
        minWidth: 0,
        padding: "14px 14px 12px",
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${color}33`,
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${color}22`,
            border: `1px solid ${color}77`,
            color,
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            fontWeight: 700,
          }}
        >
          {String(index).padStart(2, "0")}
        </span>
        <div
          className="eyebrow"
          style={{ color, letterSpacing: "0.08em", fontSize: "10px" }}
        >
          {title}
        </div>
      </div>
      {subtitle ? (
        <div style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: 600 }}>
          {subtitle}
        </div>
      ) : null}
      {detail ? (
        <div
          className="mono"
          style={{ color: "var(--text-tertiary)", fontSize: "11px", overflowWrap: "anywhere" }}
        >
          {detail}
        </div>
      ) : null}
      {children}
    </div>
  );
};

const UpdateCycleTrace = ({ cycle }) => {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  if (!cycle) return null;

  const {
    branch_run_id: branchRunId,
    branch_name: branchName,
    executed_in: executedIn,
    sandbox_used: sandboxUsed,
    sandbox_elapsed_ms: sandboxElapsedMs,
    replay_size: replaySize,
    delta_fpr: deltaFpr,
    delta_fnr: deltaFnr,
    adversarial_passed: adversarialPassed,
    recommendation,
    artifact_uri: artifactUri,
    latency_ms: latencyMs,
    exa,
  } = cycle;

  const execLabel = executedIn
    ? executedIn.replace(/_/g, " ")
    : sandboxUsed
      ? "daytona sandbox"
      : "local python";
  const execMs = Number.isFinite(sandboxElapsedMs)
    ? sandboxElapsedMs
    : Number.isFinite(latencyMs)
      ? latencyMs
      : null;
  const execTone = executedIn === "daytona_sandbox" || sandboxUsed ? "verify" : "amber";

  const exaHit = exa && Array.isArray(exa.hits) && exa.hits.length ? exa.hits[0] : null;
  const exaTone = exa && exa.configured ? (exaHit ? "verify" : "amber") : "ink";
  const exaTitle = exaHit?.title || "no adversarial signal";
  const exaUrl = exaHit?.url || null;

  const promoted = recommendation === "PROMOTED" || recommendation === "promoted";
  const recTone = promoted ? "verify" : "ink";
  const recLabel = promoted ? "PROMOTED" : (recommendation || "ARCHIVED").toString().toUpperCase();

  const handleDownload = async () => {
    if (!branchRunId) return;
    setError("");
    setStatus("loading");
    try {
      const payload = await getAudit(branchRunId);
      if (!payload || payload.ok === false) {
        throw new Error(payload?.error || "Audit request failed");
      }
      const bundle = payload.bundle || payload;
      triggerDownload(branchRunId, bundle);
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (err) {
      setError(String(err?.message || err || "Download failed"));
      setStatus("error");
    }
  };

  return (
    <div
      style={{
        padding: "16px 18px",
        background:
          "linear-gradient(180deg, rgba(102,126,234,0.08) 0%, rgba(15,23,42,0.4) 100%)",
        border: "1px solid rgba(102,126,234,0.3)",
        borderRadius: "var(--radius-xl)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <div
            className="eyebrow"
            style={{ color: "#a5b4fc", letterSpacing: "0.14em" }}
          >
            Update cycle trace
          </div>
          <div className="mono" style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: 2, overflowWrap: "anywhere" }}>
            {branchRunId || "—"}
          </div>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 12px",
            borderRadius: 999,
            background: promoted ? "rgba(16,185,129,0.12)" : "rgba(148,163,184,0.12)",
            border: `1px solid ${promoted ? "rgba(16,185,129,0.5)" : "rgba(148,163,184,0.35)"}`,
            color: promoted ? "#10b981" : "#cbd5e1",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.05em",
          }}
        >
          {recLabel}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Step
          index={1}
          title="Branch created"
          subtitle={branchName || "candidate branch"}
          detail={branchRunId ? branchRunId.slice(0, 12) + "…" : "—"}
          tone="purple"
        />
        <Step
          index={2}
          title="Sandbox replay"
          subtitle={`${execLabel}${execMs != null ? ` · ${Math.round(execMs)}ms` : ""}`}
          detail={`${safeNum(replaySize, "0")} events replayed`}
          tone={execTone}
        />
        <Step
          index={3}
          title="Exa surfaced attack intel"
          subtitle={exaTitle}
          detail={exa?.query ? `query: ${exa.query}` : null}
          tone={exaTone}
        >
          {exaUrl ? (
            <a
              href={exaUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#4facfe",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                textDecoration: "underline",
                overflowWrap: "anywhere",
              }}
            >
              {exaUrl}
            </a>
          ) : null}
        </Step>
        <Step
          index={4}
          title={recLabel}
          subtitle={
            adversarialPassed === false
              ? "adversarial check failed"
              : promoted
                ? "deploy new policy"
                : "archive candidate"
          }
          detail={`Δfpr ${safeNum(deltaFpr)} · Δfnr ${safeNum(deltaFnr)}`}
          tone={recTone}
        />
      </div>

      {artifactUri ? (
        <div
          className="mono"
          style={{
            marginTop: 10,
            fontSize: "11px",
            color: "var(--text-tertiary)",
            overflowWrap: "anywhere",
          }}
        >
          artifact: {artifactUri}
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button
          className="btn primary"
          onClick={handleDownload}
          disabled={!branchRunId || status === "loading"}
        >
          {status === "loading"
            ? "Preparing bundle…"
            : status === "done"
              ? "Downloaded ✓"
              : "Download audit bundle →"}
        </button>
        {error ? (
          <span style={{ color: "var(--error)", fontSize: "12px" }}>{error}</span>
        ) : null}
      </div>
    </div>
  );
};

export default UpdateCycleTrace;
