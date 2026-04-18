// Architecture tab — the hero. 4-layer stack + animated update-loop walkthrough.

const ArchTab = () => {
  const [step, setStep] = useState(0);   // 0..5  (0 = idle, 1..5 = update-loop steps)
  const [playing, setPlaying] = useState(false);

  // Auto-advance when playing
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      setStep(s => {
        if (s >= 5) { setPlaying(false); return 5; }
        return s + 1;
      });
    }, 1800);
    return () => clearTimeout(t);
  }, [step, playing]);

  const play = () => { setStep(1); setPlaying(true); };
  const reset = () => { setStep(0); setPlaying(false); };

  return (
    <div className="paper" style={{minHeight:"100vh", padding:"24px 32px 80px"}}>
      {/* header */}
      <div style={{display:"grid", gridTemplateColumns:"1fr auto", alignItems:"end", gap:24}}>
        <div>
          <Eyebrow>Architecture / Substrate</Eyebrow>
          <div className="serif" style={{fontSize:"var(--t-7)", lineHeight:1.05, letterSpacing:"-0.02em", marginTop:6}}>
            Four layers of memory.<br/>
            <span style={{color:"var(--ink-3)"}}>One query on the hot path. One branched loop for everything that learns.</span>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <Eyebrow>Data plane</Eyebrow>
          <div style={{display:"flex", gap:6, justifyContent:"flex-end", marginTop:6, flexWrap:"wrap"}}>
            <Tag tone="ghost">TiDB · vector + HTAP</Tag>
            <Tag tone="ghost">Daytona · sandboxed compute</Tag>
            <Tag tone="ghost">Exa · adversarial OSINT</Tag>
            <Tag tone="ghost">MCP · agent surface</Tag>
          </div>
        </div>
      </div>

      <Rule dotted style={{margin:"20px 0"}}/>

      {/* ─── 4-LAYER STACK ─────────────────────────────────────────── */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:14, marginBottom:28}}>
        <LayerCard n="01" tone="ink" label="SHORT-TERM" sub="active session"
          desc="The current challenge row. Transactional, hot-path."
          tech={["active_challenges", "tikv · row-store", "txn <1ms"]}
          purpose="What we're looking at right now."/>
        <LayerCard n="02" tone="verify" label="SEMANTIC" sub="authenticity fingerprints"
          desc="Customer truth baselines + adversarial negative corpus."
          tech={["authentic_fingerprints", "attack_fingerprints", "VECTOR · HNSW · cosine"]}
          purpose="How close is this sample to any version of you — or to any known attack?"/>
        <LayerCard n="03" tone="alarm" label="EPISODIC" sub="every decision ever"
          desc="Immutable event log of every authenticity verdict, outcome and override."
          tech={["episodic_events", "row → columnar replicate", "tiflash · analytic"]}
          purpose="Was this customer flagged in the last 90 days? Did the human overturn it?"/>
        <LayerCard n="04" tone="amber" label="PROCEDURAL" sub="learned policy"
          desc="Per-customer, per-tenant, per-attack-vector rules. Fully versioned."
          tech={["procedural_policies", "policy_versions", "sql · branchable"]}
          purpose="What do we do about it? Derived — never hand-typed."/>
      </div>

      {/* ─── UPDATE LOOP ─────────────────────────────────────────── */}
      <Xhair>
        <div style={{border:"1px solid var(--ink)", background:"var(--paper)", padding:"20px 24px 28px"}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr auto", alignItems:"start", gap:16, marginBottom:14}}>
            <div>
              <Eyebrow>The update loop · triggered nightly or when drift exceeds threshold</Eyebrow>
              <div className="serif" style={{fontSize:"var(--t-6)", letterSpacing:"-0.015em", marginTop:4}}>
                How authenticity state stays honest.
              </div>
            </div>
            <div style={{display:"flex", gap:8}}>
              <button className="btn" onClick={reset}>Reset</button>
              <button className="btn primary" onClick={play}>{playing ? "Running…" : "Play walkthrough"}</button>
            </div>
          </div>

          {/* canvas */}
          <UpdateLoopCanvas step={step}/>

          {/* step explainer strip */}
          <div style={{display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:10, marginTop:20}}>
            {LOOP_STEPS.map((s, i) => (
              <StepBlock key={i} n={i+1} active={step >= i+1} current={step === i+1} {...s}
                onClick={()=>{ setStep(i+1); setPlaying(false); }}/>
            ))}
          </div>
        </div>
      </Xhair>

      {/* ─── WHY THIS IS HARD ─────────────────────────────────────── */}
      <div style={{marginTop:32, display:"grid", gridTemplateColumns:"1fr 1.4fr", gap:24, alignItems:"start"}}>
        <div>
          <Eyebrow>Why this is the hard problem</Eyebrow>
          <div className="serif" style={{fontSize:"var(--t-5)", lineHeight:1.25, marginTop:6, color:"var(--ink-2)"}}>
            A static classifier trained once is table stakes. Keeping a billion
            customers&rsquo; authenticity state correctly updated, continuously,
            without touching prod and without leaking biometrics — that is the
            engineering problem incumbents haven&rsquo;t solved.
          </div>
        </div>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
          {DRIFT_PRESSURES.map(d => (
            <div key={d.title} style={{
              border:"1px solid var(--rule)", background:"var(--paper)", padding:"12px 14px"
            }}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6}}>
                <Eyebrow>{d.title}</Eyebrow>
                <Tag tone={d.tone}>{d.failure}</Tag>
              </div>
              <div style={{fontSize:"var(--t-3)", color:"var(--ink-2)"}}>{d.what}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ───────────────────────── Layer cards ───────────────────────── */
const LayerCard = ({ n, tone, label, sub, desc, tech, purpose }) => {
  const toneVar = {
    ink: "var(--ink)", verify: "var(--verify)", alarm: "var(--alarm)", amber: "var(--amber)"
  }[tone];
  return (
    <div style={{
      border: `1px solid ${toneVar}`,
      background: "var(--paper)",
      padding: 0,
      position: "relative",
      display:"flex", flexDirection:"column"
    }}>
      <div style={{
        background: toneVar, color: "var(--paper)",
        padding: "8px 12px",
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div>
          <div style={{fontSize:"var(--t-1)", letterSpacing:"0.12em", opacity:0.85}}>LAYER {n}</div>
          <div style={{fontSize:"var(--t-4)", letterSpacing:"0.08em", textTransform:"uppercase", marginTop:1}}>{label}</div>
        </div>
        <div style={{fontSize:"var(--t-1)", letterSpacing:"0.1em", textTransform:"uppercase", opacity:0.85, textAlign:"right"}}>{sub}</div>
      </div>
      <div style={{padding:14, flex:1, display:"flex", flexDirection:"column", gap:10}}>
        <div style={{fontSize:"var(--t-3)", color:"var(--ink-2)"}}>{desc}</div>
        <div style={{
          fontStyle:"italic", fontFamily:"var(--serif)", fontSize:"var(--t-3)",
          color: toneVar, lineHeight: 1.4, paddingLeft: 10, borderLeft: `2px solid ${toneVar}`
        }}>&ldquo;{purpose}&rdquo;</div>
        <div style={{display:"flex", flexWrap:"wrap", gap:4, marginTop:"auto"}}>
          {tech.map(t => <span key={t} style={{
            fontSize:"var(--t-1)", letterSpacing:"0.06em", padding:"2px 6px",
            border:"1px solid var(--rule)", color:"var(--ink-3)"
          }}>{t}</span>)}
        </div>
      </div>
    </div>
  );
};

/* ───────────────────────── Update-loop canvas ───────────────────────── */

const LOOP_STEPS = [
  { title: "Drift signal",
    actor: "TiFlash · episodic scan",
    body: "Analytical scan surfaces a false-positive cohort, a tight unseen-attack cluster, or policy decay. A typed hypothesis is issued."
  },
  { title: "Branch · sandbox",
    actor: "TiDB branch × Daytona",
    body: "Millisecond copy-on-write memory branch. Stateful sandbox starts in <90ms. State and logic, isolated in parallel."
  },
  { title: "Replay",
    actor: "Sandbox · 90d episodic",
    body: "Candidate policy runs over every challenge in the last 90 days on the branched state. Decision deltas are recorded."
  },
  { title: "Adversarial gate",
    actor: "Exa · OSINT",
    body: "Exa /deep + findSimilar pull the generator, paper, or release the cluster came from. Websets monitors for the next wave."
  },
  { title: "Promote · archive",
    actor: "TiDB merge · audit ledger",
    body: "Winner merges to trunk. Loser archives, signed. Every archived branch is Article 50 defense — evidence of what we tested and rejected."
  }
];

const StepBlock = ({ n, title, actor, body, active, current, onClick }) => (
  <button onClick={onClick} style={{
    textAlign:"left", cursor:"pointer",
    background: current ? "var(--ink)" : (active ? "var(--paper)" : "var(--paper-2)"),
    color: current ? "var(--paper)" : "var(--ink)",
    border: current ? "1px solid var(--ink)" : "1px solid var(--rule)",
    padding: "10px 12px", fontFamily:"var(--mono)",
    opacity: active ? 1 : 0.55,
    transition: "all 0.2s"
  }}>
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4}}>
      <span className="eyebrow" style={{color: current ? "var(--paper)" : "var(--ink-3)"}}>{String(n).padStart(2,"0")}</span>
      <span className="eyebrow" style={{color: current ? "var(--paper)" : "var(--ink-3)"}}>{actor}</span>
    </div>
    <div style={{fontSize:"var(--t-4)", fontFamily:"var(--serif)", marginBottom:4}}>{title}</div>
    <div style={{fontSize:"var(--t-2)", color: current ? "var(--paper)" : "var(--ink-3)", lineHeight:1.45}}>{body}</div>
  </button>
);

// The main animated canvas. SVG-driven.
const UpdateLoopCanvas = ({ step }) => {
  const W = 1200, H = 340;

  // Positions (anchors)
  const trunk  = { x: 100,  y: H/2,   label: "TRUNK · production memory" };
  const branch = { x: 360,  y: 90,    label: "BRANCH-N · tidb copy-on-write" };
  const sand   = { x: 360,  y: H-90,  label: "SANDBOX · daytona" };
  const replay = { x: 620,  y: H/2,   label: "REPLAY · 90d episodic" };
  const exa    = { x: 870,  y: 90,    label: "EXA · OSINT" };
  const gate   = { x: 870,  y: H-90,  label: "ADVERSARIAL GATE" };
  const merge  = { x: 1110, y: H/2,   label: "PROMOTE / ARCHIVE" };

  const active = (k) => k <= step;
  const current = (k) => k === step;

  return (
    <div style={{
      position:"relative", width:"100%",
      background:"var(--paper-2)",
      border:"1px solid var(--rule)",
    }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{display:"block", width:"100%", height:"auto"}} className="film">
        {/* quadrille bg inside svg */}
        <defs>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(30,20,10,0.06)" strokeWidth="1"/>
          </pattern>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--ink)"/>
          </marker>
          <marker id="arr-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--alarm)"/>
          </marker>
        </defs>
        <rect width={W} height={H} fill="url(#grid)"/>

        {/* static trunk line */}
        <line x1={trunk.x} y1={trunk.y} x2={merge.x} y2={merge.y} stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="4 4"/>

        {/* edges — drawn with opacity by step */}
        <Edge from={trunk} to={branch} on={active(2)} pulse={current(2)}/>
        <Edge from={trunk} to={sand}   on={active(2)} pulse={current(2)}/>
        <Edge from={branch} to={replay} on={active(3)} pulse={current(3)}/>
        <Edge from={sand}   to={replay} on={active(3)} pulse={current(3)}/>
        <Edge from={exa}    to={gate}   on={active(4)} pulse={current(4)}/>
        <Edge from={replay} to={gate}   on={active(4)} pulse={current(4)}/>
        <Edge from={gate}   to={merge}  on={active(5)} pulse={current(5)} tone={step===5 ? "var(--verify)" : "var(--ink)"}/>

        {/* nodes */}
        <Node p={trunk}  active={active(1)} current={current(1)} alt="Drift detected here"/>
        <Node p={branch} active={active(2)} current={current(2)}/>
        <Node p={sand}   active={active(2)} current={current(2)}/>
        <Node p={replay} active={active(3)} current={current(3)} wide/>
        <Node p={exa}    active={active(4)} current={current(4)}/>
        <Node p={gate}   active={active(4)} current={current(4)}/>
        <Node p={merge}  active={active(5)} current={current(5)} verdict={step===5}/>

        {/* step-1 annotation: drift signal on trunk */}
        {step >= 1 && (
          <g>
            <circle cx={trunk.x} cy={trunk.y} r="22" fill="none" stroke="var(--alarm)" strokeWidth="1.2">
              {current(1) && <animate attributeName="r" values="22;34;22" dur="1.4s" repeatCount="indefinite"/>}
            </circle>
            <text x={trunk.x} y={trunk.y+52} textAnchor="middle" fontSize="10" fontFamily="var(--mono)"
              letterSpacing="1.5" fill="var(--alarm)" style={{textTransform:"uppercase"}}>
              FP-RATE ↑ · cohort C-8821
            </text>
          </g>
        )}

        {/* step-5 verdict stamp over merge */}
        {step >= 5 && (
          <g transform={`translate(${merge.x}, ${merge.y-58}) rotate(-3)`}>
            <rect x={-52} y={-12} width="104" height="22" fill="none" stroke="var(--verify)" strokeWidth="2"/>
            <text x="0" y="4" textAnchor="middle" fontSize="11" fontFamily="var(--mono)" fill="var(--verify)"
              letterSpacing="2">PROMOTED</text>
          </g>
        )}
      </svg>

      {/* step caption overlay */}
      <div style={{
        position:"absolute", left:0, right:0, bottom:0,
        padding:"8px 14px", borderTop:"1px solid var(--rule)",
        background:"var(--paper)", display:"flex", justifyContent:"space-between", alignItems:"center"
      }}>
        <div style={{display:"flex", gap:12, alignItems:"center"}}>
          <Eyebrow>step {step}/5</Eyebrow>
          <span style={{fontSize:"var(--t-3)"}}>
            {step === 0 ? "Idle · press play to walk through the loop."
             : LOOP_STEPS[step-1].title + " — " + LOOP_STEPS[step-1].actor}
          </span>
        </div>
        <Eyebrow>no production side-effect until step 05</Eyebrow>
      </div>
    </div>
  );
};

const Edge = ({ from, to, on, pulse, tone }) => {
  const color = tone || "var(--ink)";
  const arr = color === "var(--alarm)" ? "url(#arr-red)" : "url(#arr)";
  return (
    <line
      x1={from.x} y1={from.y} x2={to.x} y2={to.y}
      stroke={color} strokeWidth={pulse ? 2 : 1.1}
      strokeOpacity={on ? 1 : 0.15}
      markerEnd={on ? arr : undefined}
      strokeDasharray={pulse ? "6 4" : undefined}
    >
      {pulse && <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="0.9s" repeatCount="indefinite"/>}
    </line>
  );
};

const Node = ({ p, active, current, wide, verdict }) => {
  const w = wide ? 130 : 104;
  const h = 54;
  return (
    <g transform={`translate(${p.x - w/2}, ${p.y - h/2})`} opacity={active ? 1 : 0.28}>
      <rect width={w} height={h} fill={current ? "var(--ink)" : "var(--paper)"} stroke="var(--ink)" strokeWidth={current ? 2 : 1}/>
      <text x={w/2} y={20} textAnchor="middle" fontSize="9" letterSpacing="1.3" fontFamily="var(--mono)"
        fill={current ? "var(--paper)" : "var(--ink-3)"} style={{textTransform:"uppercase"}}>
        {p.label.split(" · ")[0]}
      </text>
      <text x={w/2} y={36} textAnchor="middle" fontSize="9" fontFamily="var(--mono)"
        fill={current ? "var(--paper)" : "var(--ink)"}>
        {p.label.split(" · ")[1] || ""}
      </text>
      {/* corner crosshairs */}
      {[[0,0],[w,0],[0,h],[w,h]].map(([cx,cy], i) => (
        <g key={i} stroke={current ? "var(--paper)" : "var(--ink)"} strokeWidth="1">
          <line x1={cx-4} y1={cy} x2={cx+4} y2={cy}/>
          <line x1={cx} y1={cy-4} x2={cx} y2={cy+4}/>
        </g>
      ))}
    </g>
  );
};

const DRIFT_PRESSURES = [
  { title: "Natural drift", what: "Voice ages. Faces change. Devices rotate. Writing evolves.", failure: "false positives", tone: "amber" },
  { title: "Adversarial drift", what: "A new deepfake generator releases every few weeks. Attackers probe and learn.", failure: "false negatives", tone: "alarm" },
  { title: "Distributional drift", what: "Fraud rings shift targets. Attack economics shift by geography and season.", failure: "miscalibration", tone: "amber" },
  { title: "Regulatory drift", what: "Article 50 enforcement Aug 2, 2026. Future amendments will require provenance.", failure: "penalty · global turnover", tone: "alarm" },
  { title: "Cross-modal seams", what: "Voice baseline updated, face baseline stale. Seam attacks exploit the lag.", failure: "modality-seam attack", tone: "alarm" },
  { title: "Privacy constraint", what: "Can&rsquo;t ship raw biometrics anywhere, not even for model updates.", failure: "slow · unsafe updates", tone: "amber" },
];

window.ArchTab = ArchTab;
