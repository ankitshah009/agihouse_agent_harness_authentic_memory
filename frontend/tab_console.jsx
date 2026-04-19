// Console tab — live incident runner and evidence board.
//
// End-to-end flow:
//   1) Seed a scenario (or reuse already-open challenges)
//   2) Step through each phase
//   3) Run full timeline replay/update cycle
//   4) Pull query-layer state + episodic evidence + compliance bundle.

const ConsoleTab = () => {
  const [tenantId, setTenantId] = useState("");
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState("dating_takeover");
  const [allChallenges, setAllChallenges] = useState([]);
  const [openChallenges, setOpenChallenges] = useState([]);
  const [currentChallenge, setCurrentChallenge] = useState(null);
  const [selectedChallengeId, setSelectedChallengeId] = useState("");
  const [queryState, setQueryState] = useState(null);
  const [challengeEpisodes, setChallengeEpisodes] = useState([]);
  const [runAllSummary, setRunAllSummary] = useState(null);
  const [lastStep, setLastStep] = useState(null);
  const [auditBundle, setAuditBundle] = useState(null);
  const [runUpdateLoop, setRunUpdateLoop] = useState(true);
  const [runDaytonaSmoke, setRunDaytonaSmoke] = useState(false);
  const [daytonaStatus, setDaytonaStatus] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("Ready.");
  const [error, setError] = useState("");

  const scenario = scenarios.find((s) => s.id === selectedScenario);
  const scenarioPhases = scenario?.phases || [];

  const withStatus = (payload, action) => {
    if (!payload || payload.ok === false) {
      throw new Error(payload?.error || `${action} failed`);
    }
    return payload;
  };

  const refresh = async (opts = {}) => {
    setIsBusy(true);
    setError("");

    try {
      const [sc, all, open, current] = await Promise.all([
        AML_API.listScenarios(),
        AML_API.getChallenges(),
        AML_API.getChallenges({ status: "open" }),
        AML_API.getCurrentChallenge(),
      ]);

      const scenariosPayload = withStatus(sc, "listScenarios");
      const allPayload = withStatus(all, "getChallenges");
      const openPayload = withStatus(open, "getChallenges");
      const currentPayload = current ? withStatus(current, "getCurrentChallenge") : null;

      const scenarioRows = scenariosPayload.scenarios || [];
      const allRows = allPayload.challenges || [];
      const openRows = openPayload.challenges || [];

      setScenarios(scenarioRows);
      setAllChallenges(allRows);
      setOpenChallenges(openRows);
      if (!selectedScenario && scenarioRows.length) setSelectedScenario(scenarioRows[0].id);

      if (!tenantId) {
        setTenantId(currentPayload?.tenant_id || allPayload.tenant_id || scenariosPayload.tenant_id || "");
      }

      const dSt = await AML_API.getDaytonaStatus();
      if (dSt?.daytona) setDaytonaStatus(dSt.daytona);

      if (opts.keepCurrent) {
        await refreshChallengeView(
          selectedChallengeId || (currentPayload?.challenge ? currentPayload.challenge.challenge_id : "")
        );
      } else if (currentPayload?.challenge) {
        setCurrentChallenge(currentPayload.challenge);
        setSelectedChallengeId(currentPayload.challenge.challenge_id);
        await refreshChallengeView(currentPayload.challenge.challenge_id, true);
      } else {
        setCurrentChallenge(null);
        setSelectedChallengeId("");
        setQueryState(null);
        setChallengeEpisodes([]);
      }

      if (!opts.silent && currentPayload?.challenge === null && openRows.length === 0 && allRows.length > 0) {
        setMessage("No active open challenge. Pick one below or run all.");
      } else if (!opts.silent) {
        setMessage("State refreshed.");
      }
    } catch (err) {
      if (err?.message === "No challenges found" || err?.message === "No current challenge found" || err?.message === "No open challenge found") {
        setMessage("No active open challenge. Seed scenario or run all to start.");
      } else {
        setError(err ? String(err) : "Refresh failed");
      }
    } finally {
        setIsBusy(false);
    }
  };

  const refreshChallengeView = async (challengeId, silent = false) => {
    if (!challengeId) return;
    try {
      const [queryPayload, episodePayload, detailPayload] = await Promise.all([
        AML_API.runQuery(challengeId),
        AML_API.getEpisodes(challengeId),
        AML_API.getChallenge(challengeId),
      ]);
      setQueryState(withStatus(queryPayload, "runQuery")?.query);
      setChallengeEpisodes(withStatus(episodePayload, "getEpisodes")?.episodes || []);
      setCurrentChallenge(withStatus(detailPayload, "getChallenge")?.challenge || null);
      setSelectedChallengeId(challengeId);
    } catch (err) {
      if (!silent) setError(String(err || "Failed to refresh challenge"));
    }
  };

  const handleResetDemo = async () => {
    setIsBusy(true);
    setError("");
    try {
      const out = withStatus(await AML_API.resetDemo({ scenario_id: selectedScenario }), "resetDemo");
      setMessage(`Seeded scenario: ${out.scenario?.scenario_id || selectedScenario}`);
      setAllChallenges(out.challenges || []);
      await refresh({ silent: true });
    } catch (err) {
      setError(String(err || "Reset failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleRunNext = async (challengeId) => {
    if (!challengeId) return;
    setIsBusy(true);
    setError("");
    try {
      const out = withStatus(await AML_API.runScenarioStep(challengeId), "runScenarioStep");
      setLastStep(out.step);
      setMessage(`Ran phase ${out.step?.phase?.phase || "unknown"} (${out.step?.challenge?.phase || out.step?.challenge?.challenge_id || challengeId}).`);

      await refresh({ keepCurrent: false, silent: true });
      await refreshChallengeView(challengeId, true);
    } catch (err) {
      setError(String(err || "Step run failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleRunAll = async () => {
    setIsBusy(true);
    setError("");
    setAuditBundle(null);
    try {
      const out = withStatus(
        await AML_API.runAllScenarios({
          scenario_id: selectedScenario,
          run_update_cycle: runUpdateLoop,
          window_days: 90,
          reset: openChallenges.length === 0,
          daytona_smoke: runDaytonaSmoke,
        }),
        "runAllScenarios"
      );
      setRunAllSummary(out);
      const d = out.daytona;
      const dmsg = d && !d.skipped ? (d.ok ? " Daytona sandbox OK." : " Daytona sandbox reported an error.") : "";
      setMessage(`Run-all complete. ${out.steps?.length || 0} phases processed.${dmsg}`);
      await refresh({ silent: true });
      if (out?.update_cycle?.branch_run_id) {
        await handleLoadAudit(out.update_cycle.branch_run_id, { suppressMsg: true });
      }
    } catch (err) {
      setError(String(err || "Run-all failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleLoadAudit = async (branchRunId, opts = {}) => {
    if (!branchRunId) return;
    if (!opts.suppressMsg) setIsBusy(true);
    setError("");
    try {
      const payload = withStatus(await AML_API.getAudit(branchRunId), "getAudit");
      setAuditBundle(payload);
      if (!opts.suppressMsg) setMessage(`Loaded audit bundle ${branchRunId}.`);
    } catch (err) {
      if (!opts.suppressMsg) setError(String(err || "Failed to load audit"));
    } finally {
      if (!opts.suppressMsg) setIsBusy(false);
    }
  };

  const nextPhase = scenarioPhases.find((phase) => {
    const found = allChallenges.find((c) => c.challenge_id === phase.challenge_id);
    return found && found.status === "open";
  });

  const selectedLabel = currentChallenge
    ? ((currentChallenge.raw_features || {}).label || currentChallenge.challenge_id)
    : "No active challenge";

  const statusFor = (challenge) => {
    if (challenge?.status === "closed") return <Tag tone="ghost">CLOSED</Tag>;
    if (challenge?.status === "open") return <Tag tone="verify">OPEN</Tag>;
    return <Tag tone="amber">UNKNOWN</Tag>;
  };

  const latestEpisode = challengeEpisodes.length
    ? challengeEpisodes[0]
    : null;

  const decisionPill = (value) => {
    if (!value) return <span style={{ color: "var(--ink-3)" }}>—</span>;
    const tone = value === "deny" ? "alarm" : value === "review" ? "amber" : "verify";
    return <Tag tone={tone}>{value.toUpperCase()}</Tag>;
  };

  const safe = (value, fallback = "—") => {
    if (value === undefined || value === null) return fallback;
    if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(4) : fallback;
    return String(value);
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (allChallenges.length === 0) return;
    const candidate = allChallenges.find((c) => c.challenge_id === selectedChallengeId);
    if (!candidate) return;
    refreshChallengeView(candidate.challenge_id, true);
  }, [selectedChallengeId]);

  useEffect(() => {
    if (!openChallenges.length || !selectedScenario) return;
    const nextFromPlan = scenarioPhases.find(
      (p) => !allChallenges.some((c) => c.challenge_id === p.challenge_id && c.status !== "open")
    );
    if (!nextFromPlan) return;
    const next = allChallenges.find((c) => c.challenge_id === nextFromPlan.challenge_id && c.status === "open");
    if (next && !selectedChallengeId) setSelectedChallengeId(next.challenge_id);
  }, [allChallenges, selectedScenario]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper-3)", padding: "24px 28px 64px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 22, alignItems: "start" }}>
        <Xhair>
          <div style={{ background: "var(--paper)", padding: "18px 18px 20px", borderBottom: "1px solid var(--rule)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <Eyebrow>Console · live incident memory flow</Eyebrow>
                <div className="serif" style={{ fontSize: "var(--t-5)", marginTop: 4 }}>
                  1-tap end-to-end scenario runner
                </div>
              </div>
              <Tag tone="verify">tenant {tenantId || "—"}</Tag>
            </div>
            <div style={{ marginTop: 12, color: "var(--ink-3)", fontSize: "var(--t-2)", display: "grid", gap: 6 }}>
              <span>Tenant: {tenantId || "auto-detected from API"}</span>
              <span>Scenario: {scenario ? scenario.name : "—"}</span>
              <span>Phases: {scenarioPhases.length ? scenarioPhases.length : 0}</span>
            </div>
          </div>
          <div style={{ padding: 18 }}>
            {error ? (
              <div style={{ marginBottom: 10, color: "var(--alarm)", fontSize: "var(--t-2)", border: "1px solid var(--alarm)", padding: "8px 10px" }}>
                {error}
              </div>
            ) : null}
            <div style={{ marginBottom: 12, color: "var(--ink-2)" }}>{message}</div>

            <div style={{ display: "grid", gap: 10 }}>
              <label className="eyebrow">Scenario pack</label>
              <select
                value={selectedScenario}
                onChange={(e) => setSelectedScenario(e.target.value)}
                style={{ width: "100%", height: 36, padding: "0 10px", border: "1px solid var(--rule)", background: "var(--paper)" }}
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, alignItems: "center" }}>
                <button className="btn" onClick={handleResetDemo} disabled={isBusy}>
                  Seed scenario
                </button>
                <button className="btn" onClick={handleRunAll} disabled={isBusy}>
                  Run all phases
                </button>
                <button className="btn" onClick={() => refresh({ silent: true })} disabled={isBusy}>
                  Refresh
                </button>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <label className="eyebrow" style={{ marginRight: 6 }}>Update cycle</label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={runUpdateLoop} onChange={(e) => setRunUpdateLoop(e.target.checked)} />
                  <span style={{ fontSize: "var(--t-2)", color: "var(--ink-2)" }}>run 90-day replay + audit after run-all</span>
                </label>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: "var(--t-2)", color: "var(--ink-3)" }}>
                  Daytona:{" "}
                  {daytonaStatus?.configured
                    ? "API key configured (sandbox smoke available)."
                    : "not configured — set DAYTONA_API_KEY to enable."}
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={runDaytonaSmoke}
                    onChange={(e) => setRunDaytonaSmoke(e.target.checked)}
                    disabled={!daytonaStatus?.configured}
                  />
                  <span style={{ fontSize: "var(--t-2)", color: "var(--ink-2)" }}>
                    run Hello World in a Daytona sandbox after run-all (isolated code execution)
                  </span>
                </label>
              </div>

              <Rule dotted />

              <div>
                <label className="eyebrow">Phase controls</label>
                <div style={{ marginTop: 8 }}>
                  <div style={{ color: "var(--ink-3)", fontSize: "var(--t-3)" }}>
                    Plan: {
                      scenarioPhases.length
                        ? scenarioPhases.map((p) => p.label).join(" → ")
                        : "No scenario loaded."
                    }
                  </div>
                  <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                    {scenarioPhases.length ? scenarioPhases.map((phase) => {
                      const row = allChallenges.find((c) => c.challenge_id === phase.challenge_id);
                      const isOpen = row && row.status === "open";
                      const isDone = row && row.status === "closed";
                      return (
                        <div key={phase.challenge_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--rule)", padding: "8px 10px", gap: 10, background: isDone ? "var(--paper-2)" : "var(--paper)" }}>
                          <div>
                            <div style={{ fontFamily: "var(--serif)", fontSize: "var(--t-3)" }}>{phase.label}</div>
                            <div className="eyebrow" style={{ marginTop: 2 }}>
                              {phase.phase} · {phase.challenge_id} · {phase.notes}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {isDone ? <Tag tone="verify">COMPLETED</Tag> : isOpen ? <Tag tone="alarm">OPEN</Tag> : <Tag tone="ghost">UPCOMING</Tag>}
                            <button className="btn" onClick={() => handleRunNext(phase.challenge_id)} disabled={isBusy || !isOpen}>
                              Run this step
                            </button>
                          </div>
                        </div>
                      );
                    }) : <span style={{ color: "var(--ink-3)", fontSize: "var(--t-3)" }}>No phases available.</span>}
                  </div>
                  {nextPhase ? (
                    <div style={{ marginTop: 10 }}>
                      <button
                        className="btn primary"
                        onClick={() => handleRunNext(nextPhase.challenge_id)}
                        disabled={isBusy}
                        title="Run next open phase from current plan"
                      >
                        Run next phase
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </Xhair>

        <div style={{ display: "grid", gap: 16 }}>
          <Xhair>
            <Card title="Current challenge / scenario card" right={statusFor(currentChallenge)}>
              <div style={{ padding: 8 }}>
                <div className="serif" style={{ fontSize: "var(--t-5)", lineHeight: 1.05 }}>{selectedLabel}</div>
                <div style={{ marginTop: 6, color: "var(--ink-2)", display: "grid", gap: 4 }}>
                  <span>Challenge ID: {currentChallenge?.challenge_id || "—"}</span>
                  <span>Customer: {currentChallenge?.customer_id || "—"}</span>
                  <span>Modality: {currentChallenge?.modality || "—"} · Asset {currentChallenge?.asset_id || "—"}</span>
                  <span>Scenario: {(currentChallenge?.raw_features || {}).scenario_id || selectedScenario || "—"} · {(currentChallenge?.raw_features || {}).phase || "—"}</span>
                </div>

                <Rule style={{ margin: "12px 0" }} />

                {queryState ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <div className="eyebrow">Four-layer policy query</div>
                      <KV rows={[
                        ["tenant_id", queryState.tenant_id],
                        ["policy_version", queryState.policy?.policy_version],
                        ["threshold_auth", safe(queryState.policy?.threshold_auth)],
                        ["threshold_attack", safe(queryState.policy?.threshold_attack)],
                        ["auth_distance", safe(queryState.scores?.auth_distance)],
                        ["attack_distance", safe(queryState.scores?.attack_distance)],
                        ["recent_flags_90d", safe(queryState.scores?.recent_flags_90d)],
                        ["trailing_conf", safe(queryState.scores?.trailing_confidence)],
                      ]}/>
                    </div>
                    <div>
                      <div className="eyebrow">Decision context</div>
                      <div style={{ marginTop: 4, display: "grid", gap: 8 }}>
                        <div>
                          Decision: {decisionPill(queryState.decision)}
                        </div>
                        <div style={{ color: "var(--ink-2)", fontSize: "var(--t-3)" }}>{queryState.reason || "No reason recorded."}</div>
                        <div style={{ marginTop: 6 }}>
                          <button className="btn" onClick={() => refreshChallengeView(currentChallenge?.challenge_id, false)} disabled={isBusy || !currentChallenge}>
                            Refresh query + episodes
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: "var(--ink-3)", fontSize: "var(--t-3)" }}>
                    No query run yet. Run a phase to see live layer scores.
                  </div>
                )}
              </div>
            </Card>
          </Xhair>

          <Xhair>
            <Card title="Episode evidence" right={latestEpisode ? latestEpisode.ts : "—"}>
              <div style={{ padding: 12 }}>
                {latestEpisode ? (
                  <KV rows={[
                    ["Last verdict", latestEpisode.verdict || "—"],
                    ["Confidence", safe(latestEpisode.confidence)],
                    ["Authenticity", safe(latestEpisode.authenticity_score)],
                    ["Ground truth", latestEpisode.ground_truth || "—"],
                    ["Human outcome", latestEpisode.human_outcome || "—"],
                    ["Auth distance", safe(latestEpisode.auth_distance)],
                    ["Attack distance", safe(latestEpisode.attack_distance)],
                  ]}/>
                ) : (
                  <div className="eyebrow">No episodic output yet.</div>
                )}
                <div style={{ marginTop: 10, maxHeight: 130, overflow: "auto", borderTop: "1px solid var(--rule)", paddingTop: 10 }}>
                  {!challengeEpisodes.length ? (
                    <div style={{ color: "var(--ink-3)", fontSize: "var(--t-2)" }}>No events for this challenge.</div>
                  ) : (
                    challengeEpisodes.map((row, idx) => (
                      <div key={`${row.event_id}-${idx}`} style={{
                        display: "grid",
                        gridTemplateColumns: "80px 120px 1fr 1fr",
                        gap: 8,
                        borderBottom: "1px solid var(--paper-2)",
                        padding: "6px 0",
                        fontSize: "var(--t-2)",
                      }}>
                        <span className="num" style={{ color: "var(--ink-3)" }}>{row.ts ? row.ts.slice(0, 19) : "—"}</span>
                        <span>{row.verdict || "—"}</span>
                        <span>{row.human_outcome || "—"}</span>
                        <span style={{ color: "var(--ink-2)" }}>{row.ground_truth || "—"}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>
          </Xhair>
        </div>
      </div>

      <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
        <Xhair>
          <Card title="Last action log" right={<BackendHook name="backend + db + policies" />}>
            <div style={{ padding: 12 }}>
              <div className="eyebrow">Decision transcript</div>
              <div style={{ marginTop: 10, borderTop: "1px solid var(--rule)" }}>
                {!lastStep ? (
                  <div style={{ color: "var(--ink-3)", fontSize: "var(--t-3)", paddingTop: 12 }}>No per-step action yet.</div>
                ) : (
                  <div style={{ paddingTop: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, fontSize: "var(--t-3)" }}>
                      <div>challenge</div>
                      <div className="num">{lastStep.challenge?.challenge_id}</div>
                      <div>decision</div>
                      <div>{decisionPill(lastStep.decision?.decision)}</div>
                      <div>scenario / phase</div>
                      <div>{lastStep.phase?.scenario_id || "—"} / {lastStep.phase?.phase || "—"}</div>
                      <div>query_ms</div>
                      <div>{safe(lastStep.decision?.query_ms)}ms</div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <button
                        className="btn"
                        onClick={() => refreshChallengeView(lastStep.challenge?.challenge_id, true)}
                        disabled={isBusy || !lastStep?.challenge?.challenge_id}
                      >
                        Open this challenge
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </Xhair>

        {runAllSummary ? (
          <Xhair>
            <Card title="Run-all summary" right={runAllSummary.scenario_id || "update cycle"}>
              <div style={{ padding: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <KV rows={[
                      ["Tenant", runAllSummary.tenant_id || "—"],
                      ["Remaining open", String(runAllSummary.remaining_open || 0)],
                      ["Phases processed", String((runAllSummary.steps || []).length)],
                      ["Recommendation", runAllSummary.update_cycle ? runAllSummary.update_cycle.recommendation : "n/a"],
                      ["dFPR", runAllSummary.update_cycle ? safe(runAllSummary.update_cycle.delta_fpr) : "n/a"],
                      ["dFNR", runAllSummary.update_cycle ? safe(runAllSummary.update_cycle.delta_fnr) : "n/a"],
                    ]}/>
                  </div>
                  <div>
                    {runAllSummary.update_cycle ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <div className="eyebrow">Branch artifact</div>
                        <div style={{ fontSize: "var(--t-2)", color: "var(--ink-2)" }}>
                          {runAllSummary.update_cycle.branch_run_id}
                        </div>
                        <div style={{ color: "var(--ink-2)" }}>
                          Replay size: {safe(runAllSummary.update_cycle.replay_size)} · Latency: {safe(runAllSummary.update_cycle.latency_ms, "—")}ms
                        </div>
                        <button className="btn" onClick={() => handleLoadAudit(runAllSummary.update_cycle.branch_run_id)} disabled={isBusy}>
                          Load audit bundle
                        </button>
                      </div>
                    ) : (
                      <div style={{ color: "var(--ink-3)", fontSize: "var(--t-3)" }}>Update cycle disabled for this run.</div>
                    )}
                  </div>
                </div>

                {runAllSummary.daytona ? (
                  <div style={{ marginTop: 12, borderTop: "1px solid var(--rule)", paddingTop: 12 }}>
                    <div className="eyebrow">Daytona sandbox (isolated code run)</div>
                    {runAllSummary.daytona.skipped ? (
                      <div style={{ marginTop: 8, color: "var(--ink-3)", fontSize: "var(--t-3)" }}>
                        {runAllSummary.daytona.error || "Skipped — set DAYTONA_API_KEY."}
                      </div>
                    ) : (
                      <div style={{ marginTop: 8 }}>
                        <KV rows={[
                          ["ok", String(runAllSummary.daytona.ok)],
                          ["exit_code", runAllSummary.daytona.exit_code != null ? String(runAllSummary.daytona.exit_code) : "—"],
                          ["stdout", runAllSummary.daytona.result || "—"],
                          ["error", runAllSummary.daytona.error || "—"],
                        ]}/>
                      </div>
                    )}
                  </div>
                ) : null}

                {auditBundle ? (
                  <div style={{ marginTop: 12, borderTop: "1px solid var(--rule)", paddingTop: 12 }}>
                    <div className="eyebrow">Audit bundle ({auditBundle.format || "json"})</div>
                    <div style={{ marginTop: 8 }}>
                      {auditBundle.path ? <div>Path: {auditBundle.path}</div> : null}
                      <pre style={{
                        margin: "8px 0 0", whiteSpace: "pre-wrap", background: "var(--paper-2)", border: "1px solid var(--rule)",
                        padding: "10px 12px", fontSize: "11px", maxHeight: 170, overflow: "auto"
                      }}>
                        {JSON.stringify(auditBundle, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          </Xhair>
        ) : null}
      </div>
    </div>
  );
};

Object.assign(window, { ConsoleTab });
