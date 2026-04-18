// Deck tab — 3-minute hackathon pitch, evidence-board styled.
// 8 slides, one on screen at a time. Keyboard + button navigation inside the tab.

const DECK_SLIDES = [
  { id: "title", label: "01 Title" },
  { id: "decode", label: "02 Decode" },
  { id: "forcing", label: "03 Forcing function" },
  { id: "layers", label: "04 Four layers" },
  { id: "query", label: "05 The query" },
  { id: "loop", label: "06 The loop" },
  { id: "moat", label: "07 Moat & SKU" },
  { id: "close", label: "08 Close" },
];

const DeckTab = () => {
  const [i, setI] = useState(() => {
    const v = parseInt(localStorage.getItem("aml.deck.i") || "0", 10);
    return isNaN(v) ? 0 : Math.max(0, Math.min(DECK_SLIDES.length - 1, v));
  });
  useEffect(() => { localStorage.setItem("aml.deck.i", String(i)); }, [i]);

  const next = () => setI(v => Math.min(DECK_SLIDES.length - 1, v + 1));
  const prev = () => setI(v => Math.max(0, v - 1));

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div style={{minHeight:"100vh", background:"var(--paper-3)", padding:"20px 24px 24px"}}>
      {/* slide stage */}
      <div style={{
        width:"100%", aspectRatio:"16/9", maxHeight:"calc(100vh - 120px)",
        margin:"0 auto", background:"var(--paper)",
        border:"1px solid var(--ink)", position:"relative", overflow:"hidden"
      }} data-screen-label={DECK_SLIDES[i].label}>
        <Slide id={DECK_SLIDES[i].id}/>
      </div>

      {/* nav strip */}
      <div style={{display:"flex", alignItems:"center", gap:10, marginTop:12, flexWrap:"wrap"}}>
        <button className="btn" onClick={prev} disabled={i===0}>← Prev</button>
        <button className="btn primary" onClick={next} disabled={i===DECK_SLIDES.length-1}>Next →</button>
        <div style={{display:"flex", gap:4, flexWrap:"wrap", marginLeft:8}}>
          {DECK_SLIDES.map((s, idx) => (
            <button key={s.id} onClick={()=>setI(idx)} style={{
              cursor:"pointer",
              fontFamily:"var(--mono)", fontSize:"var(--t-1)", letterSpacing:"0.1em",
              textTransform:"uppercase",
              padding:"4px 8px",
              background: idx===i ? "var(--ink)" : "var(--paper)",
              color: idx===i ? "var(--paper)" : "var(--ink-3)",
              border: "1px solid " + (idx===i ? "var(--ink)" : "var(--rule)")
            }}>{s.label}</button>
          ))}
        </div>
        <div style={{marginLeft:"auto"}} className="eyebrow num">
          {String(i+1).padStart(2,"0")} / {String(DECK_SLIDES.length).padStart(2,"0")}
        </div>
      </div>
    </div>
  );
};

/* ─────────── slide registry ─────────── */
const Slide = ({ id }) => {
  const map = {
    title: SlideTitle, decode: SlideDecode, forcing: SlideForcing,
    layers: SlideLayers, query: SlideQuery, loop: SlideLoop,
    moat: SlideMoat, close: SlideClose
  };
  const C = map[id] || (() => null);
  return <div className="paper" style={{width:"100%", height:"100%", padding:"48px 60px", position:"relative"}}>
    <C/>
    <SlideChrome/>
  </div>;
};

const SlideChrome = () => (
  <>
    <div style={{
      position:"absolute", top:16, left:24, display:"flex", gap:8, alignItems:"center"
    }}>
      <div style={{width:8, height:8, background:"var(--ink)"}}/>
      <span className="eyebrow">Aubric AML · Authenticity Memory Layer</span>
    </div>
    <div style={{
      position:"absolute", top:16, right:24
    }} className="eyebrow">CONFIDENTIAL · TIDB × DAYTONA × EXA</div>
    <div style={{
      position:"absolute", bottom:16, left:24, right:24,
      display:"flex", justifyContent:"space-between"
    }}>
      <span className="eyebrow">ARTICLE 50 · T-107 DAYS</span>
      <span className="eyebrow">FILE · AML-2026-01</span>
    </div>
  </>
);

/* ─── 01 TITLE ─── */
const SlideTitle = () => (
  <div style={{display:"grid", gridTemplateRows:"1fr auto", height:"100%", paddingTop:24}}>
    <div style={{display:"flex", flexDirection:"column", justifyContent:"center", gap:18}}>
      <Eyebrow>A memory substrate for trust-and-safety agents</Eyebrow>
      <div className="serif" style={{
        fontSize:"var(--t-9)", lineHeight:0.95, letterSpacing:"-0.035em",
      }}>
        AML for AI.
      </div>
      <div className="serif" style={{
        fontSize:"var(--t-6)", lineHeight:1.2, color:"var(--ink-3)",
        maxWidth: 820, letterSpacing:"-0.01em"
      }}>
        The memory layer that lets a fraud-prevention agent
        remember who is real — and recognize everyone who isn&rsquo;t.
      </div>
    </div>
    <div style={{display:"flex", gap:20, alignItems:"flex-end", justifyContent:"space-between"}}>
      <div>
        <Eyebrow>Stack</Eyebrow>
        <div style={{display:"flex", gap:8, marginTop:6, flexWrap:"wrap"}}>
          <Tag tone="ghost">TiDB · HTAP + vector</Tag>
          <Tag tone="ghost">Daytona · sandbox</Tag>
          <Tag tone="ghost">Exa · OSINT</Tag>
          <Tag tone="ghost">MCP</Tag>
        </div>
      </div>
      <Stamp tone="alarm">EVIDENCE BOARD</Stamp>
    </div>
  </div>
);

/* ─── 02 DECODE ─── */
const SlideDecode = () => (
  <div style={{display:"flex", flexDirection:"column", height:"100%", justifyContent:"center", gap:18}}>
    <Eyebrow>The name</Eyebrow>
    <div className="serif" style={{fontSize:"var(--t-8)", lineHeight:1.05, letterSpacing:"-0.03em"}}>
      Aubric <span style={{color:"var(--ink-3)"}}>AML</span>
    </div>
    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:32, marginTop:18, alignItems:"start"}}>
      <DecodeCol label="A" word="Anti-Money Laundering" note="The register every FI already operates in."/>
      <DecodeCol label="A" word="Authenticity Memory Layer" note="Where we actually live."/>
    </div>
    <div className="serif" style={{fontSize:"var(--t-5)", color:"var(--ink-3)", maxWidth:900, marginTop:12, fontStyle:"italic"}}>
      Same three letters. One frame the buyer already understands —
      a second frame that names the substrate we built.
    </div>
  </div>
);

const DecodeCol = ({ label, word, note }) => (
  <div style={{borderLeft:"1px solid var(--ink)", paddingLeft:16}}>
    <div className="serif" style={{fontSize:"var(--t-8)", lineHeight:1, letterSpacing:"-0.04em"}}>{label}</div>
    <div style={{
      fontFamily:"var(--mono)", fontSize:"var(--t-5)", letterSpacing:"-0.005em",
      marginTop:6, textTransform:"uppercase"
    }}>{word}</div>
    <div style={{fontSize:"var(--t-4)", color:"var(--ink-3)", marginTop:10, fontFamily:"var(--serif)", fontStyle:"italic"}}>{note}</div>
  </div>
);

/* ─── 03 FORCING FUNCTION ─── */
const SlideForcing = () => (
  <div style={{display:"grid", gridTemplateColumns:"1.1fr 1fr", gap:40, height:"100%", alignItems:"center"}}>
    <div>
      <Eyebrow>The forcing function</Eyebrow>
      <div className="serif" style={{fontSize:"var(--t-7)", lineHeight:1.05, letterSpacing:"-0.025em", marginTop:8}}>
        EU AI Act · Article 50 enforces
        <span style={{color:"var(--alarm)"}}> Aug 2, 2026</span>.
      </div>
      <div className="serif" style={{fontSize:"var(--t-4)", color:"var(--ink-2)", marginTop:14, maxWidth:480, lineHeight:1.5}}>
        Mandates detection, disclosure and an audit-ready framework
        for deployers of synthetic-media systems. Financial institutions
        are deployers. They have ~3.5 months.
      </div>
      <div style={{marginTop:22}}><Stamp tone="alarm">T-107 DAYS</Stamp></div>
    </div>
    <div>
      <Eyebrow>Countdown</Eyebrow>
      <CountdownGrid/>
    </div>
  </div>
);

const CountdownGrid = () => {
  const days = 107;
  const cols = 14, rows = Math.ceil(days/cols);
  const cells = Array.from({length: rows*cols}, (_, i) => i < days);
  return (
    <div style={{
      display:"grid", gridTemplateColumns:`repeat(${cols}, 1fr)`, gap:3, marginTop:8
    }}>
      {cells.map((on, i) => (
        <div key={i} style={{
          aspectRatio:"1/1",
          background: on ? (i < 20 ? "var(--alarm)" : "var(--ink)") : "transparent",
          border: on ? "none" : "1px solid var(--rule)",
          opacity: on ? (0.45 + (i/days)*0.55) : 1
        }}/>
      ))}
    </div>
  );
};

/* ─── 04 FOUR LAYERS ─── */
const SlideLayers = () => (
  <div style={{display:"flex", flexDirection:"column", height:"100%", justifyContent:"center"}}>
    <Eyebrow>The memory</Eyebrow>
    <div className="serif" style={{fontSize:"var(--t-7)", letterSpacing:"-0.025em", marginTop:4}}>
      Four layers. One substrate.
    </div>
    <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginTop:28}}>
      {[
        {n:"01", tone:"var(--ink)",    k:"SHORT-TERM",  s:"active session",       q:"What are we looking at?"},
        {n:"02", tone:"var(--verify)", k:"SEMANTIC",    s:"fingerprints",         q:"Does this match you or an attack?"},
        {n:"03", tone:"var(--alarm)",  k:"EPISODIC",    s:"every decision ever",  q:"What did we see before?"},
        {n:"04", tone:"var(--amber)",  k:"PROCEDURAL",  s:"learned policy",       q:"What do we do about it?"}
      ].map(l => (
        <div key={l.n} style={{border:`1px solid ${l.tone}`, padding:"18px 18px 22px"}}>
          <div style={{color:l.tone, fontSize:"var(--t-1)", letterSpacing:"0.14em"}}>LAYER {l.n}</div>
          <div className="serif" style={{fontSize:"var(--t-6)", letterSpacing:"-0.02em", marginTop:6}}>{l.k}</div>
          <div className="eyebrow" style={{marginTop:2}}>{l.s}</div>
          <div style={{
            fontFamily:"var(--serif)", fontStyle:"italic", fontSize:"var(--t-4)",
            color:"var(--ink-2)", marginTop:14, lineHeight:1.35
          }}>&ldquo;{l.q}&rdquo;</div>
        </div>
      ))}
    </div>
  </div>
);

/* ─── 05 THE QUERY ─── */
const SlideQuery = () => (
  <div style={{height:"100%", display:"grid", gridTemplateRows:"auto 1fr auto", gap:14}}>
    <div>
      <Eyebrow>The query</Eyebrow>
      <div className="serif" style={{fontSize:"var(--t-6)", letterSpacing:"-0.02em", marginTop:4}}>
        Four layers. One statement. <span style={{color:"var(--ink-3)"}}>Sub-100ms.</span>
      </div>
    </div>
    <pre style={{
      margin:0, fontFamily:"var(--mono)", fontSize:13, lineHeight:1.5,
      background:"var(--paper-2)", border:"1px solid var(--ink)", padding:"14px 16px",
      overflow:"hidden"
    }}>
{`SELECT c.challenge_id, c.customer_id, c.modality,
`}<span style={{color:"var(--verify)"}}>{`  MIN(VEC_COSINE_DISTANCE(f_auth.embedding, c.current_embedding)) AS auth_distance,
  MIN(VEC_COSINE_DISTANCE(f_atk.embedding , c.current_embedding)) AS attack_distance,
`}</span><span style={{color:"var(--alarm)"}}>{`  COUNT(CASE WHEN e.verdict='flagged' AND e.ts > NOW()-INTERVAL 90 DAY THEN 1 END) AS recent_flags,
  AVG(e.confidence) FILTER (WHERE e.ts > NOW()-INTERVAL 30 DAY) AS trailing_confidence,
`}</span><span style={{color:"oklch(0.45 0.14 75)"}}>{`  p.policy_version, p.threshold_auth, p.threshold_attack, p.escalation_rule
`}</span>{`FROM active_challenges c
  LEFT JOIN authentic_fingerprints f_auth USING(customer_id, modality)
  LEFT JOIN attack_fingerprints    f_atk  USING(modality)
  LEFT JOIN episodic_events        e      USING(customer_id)
  LEFT JOIN procedural_policies    p      ON p.tenant_id=c.tenant_id AND p.is_active
WHERE c.challenge_id = ?;`}
    </pre>
    <div style={{display:"flex", gap:14, justifyContent:"space-between", alignItems:"center"}}>
      <div style={{display:"flex", gap:8}}>
        <Tag tone="verify">L2 · vector</Tag>
        <Tag tone="alarm">L3 · HTAP columnar</Tag>
        <Tag tone="amber">L4 · policy</Tag>
      </div>
      <div className="eyebrow">no separate vector db · no cross-system sync · one transaction</div>
    </div>
  </div>
);

/* ─── 06 THE LOOP ─── */
const SlideLoop = () => (
  <div style={{height:"100%", display:"flex", flexDirection:"column", justifyContent:"center"}}>
    <Eyebrow>The hero moment</Eyebrow>
    <div className="serif" style={{fontSize:"var(--t-7)", letterSpacing:"-0.025em", marginTop:4}}>
      How the memory stays honest.
    </div>
    <div style={{display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:10, marginTop:28}}>
      {[
        {n:"01", k:"DRIFT",     t:"TiFlash analytical scan surfaces a typed hypothesis.", tone:"var(--alarm)"},
        {n:"02", k:"BRANCH",    t:"TiDB copy-on-write + Daytona sandbox in parallel. <90ms.", tone:"var(--verify)"},
        {n:"03", k:"REPLAY",    t:"90 days of episodic events replayed on the branched state.", tone:"var(--ink)"},
        {n:"04", k:"GATE",      t:"Exa surfaces the generator, paper, or release on the web.", tone:"var(--amber)"},
        {n:"05", k:"PROMOTE",   t:"Winner merges. Loser archives — signed, Article 50 defense.", tone:"var(--verify)"}
      ].map(s => (
        <div key={s.n} style={{border:`1px solid ${s.tone}`, padding:12, minHeight:150, display:"flex", flexDirection:"column"}}>
          <div style={{fontSize:"var(--t-1)", letterSpacing:"0.14em", color:s.tone}}>STEP {s.n}</div>
          <div className="serif" style={{fontSize:"var(--t-5)", letterSpacing:"-0.01em", marginTop:4}}>{s.k}</div>
          <div style={{fontSize:"var(--t-3)", color:"var(--ink-2)", marginTop:10, lineHeight:1.45}}>{s.t}</div>
        </div>
      ))}
    </div>
    <div className="eyebrow" style={{marginTop:18, textAlign:"center"}}>
      production is never touched until step 05
    </div>
  </div>
);

/* ─── 07 MOAT & SKU ─── */
const SlideMoat = () => (
  <div style={{height:"100%", display:"grid", gridTemplateColumns:"1fr 1fr", gap:40, alignItems:"center"}}>
    <div>
      <Eyebrow>The moat</Eyebrow>
      <div className="serif" style={{fontSize:"var(--t-6)", letterSpacing:"-0.02em", marginTop:8, lineHeight:1.15}}>
        Per-customer fingerprint density <span style={{color:"var(--ink-3)"}}>compounds.</span>
      </div>
      <div style={{fontSize:"var(--t-4)", color:"var(--ink-2)", marginTop:14, lineHeight:1.5, fontFamily:"var(--serif)"}}>
        Reality Defender, Pindrop and GetReal ship classifiers.
        We ship memory. Incumbents can&rsquo;t replicate it without a
        tenant&rsquo;s historical authenticity chain.
      </div>
    </div>
    <div>
      <Eyebrow>SKU positioning</Eyebrow>
      <div style={{display:"grid", gridTemplateColumns:"auto 1fr", gap:"10px 16px", marginTop:10, alignItems:"center"}}>
        <Tag tone="ghost">today</Tag>
        <div style={{fontFamily:"var(--serif)"}}>Aubric · detection-as-a-service · API-priced</div>
        <Tag tone="solid">AML</Tag>
        <div style={{fontFamily:"var(--serif)"}}>The substrate that makes detection <em>agentic</em> · volume + seat priced</div>
        <Tag tone="verify">VPC / BYOC</Tag>
        <div style={{fontFamily:"var(--serif)"}}>Non-negotiable for Tier-1 FIs.</div>
      </div>
    </div>
  </div>
);

/* ─── 08 CLOSE ─── */
const SlideClose = () => (
  <div style={{height:"100%", display:"flex", flexDirection:"column", justifyContent:"center"}}>
    <Eyebrow>The close</Eyebrow>
    <div className="serif" style={{fontSize:"var(--t-8)", letterSpacing:"-0.03em", lineHeight:1, marginTop:10}}>
      Every archived branch is
      <br/>
      <span style={{color:"var(--verify)"}}>a compliance artifact.</span>
    </div>
    <div className="serif" style={{fontSize:"var(--t-5)", color:"var(--ink-2)", marginTop:22, maxWidth:900, lineHeight:1.35}}>
      Aubric AML is not a detector bolted onto a bank. It is the institutional memory
      of every authenticity decision it has ever made &mdash; and the mechanism by
      which that memory gets smarter without ever touching production.
    </div>
    <div style={{display:"flex", gap:12, marginTop:30}}>
      <Stamp tone="verify">ACCEPT</Stamp>
      <Stamp>EVIDENCE ATTACHED</Stamp>
      <Stamp tone="alarm">T-107 DAYS</Stamp>
    </div>
  </div>
);

window.DeckTab = DeckTab;
