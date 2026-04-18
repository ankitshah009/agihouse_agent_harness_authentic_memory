// Landing tab — Product overview dashboard

const LandingTab = () => {
  return (
    <div className="paper" style={{minHeight:"100vh", padding:"32px"}}>
      <Eyebrow>Product Overview</Eyebrow>
      
      <div style={{marginTop:24, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:20}}>
        <FeatureCard
          title="Authenticity Memory"
          description="Persistent storage for voice, face, and document fingerprints across all customer interactions"
          icon="🧠"
        />
        <FeatureCard
          title="Vector Search"
          description="Real-time similarity matching against authentic baselines and known attack patterns"
          icon="🔍"
        />
        <FeatureCard
          title="Decision Replay"
          description="Immutable log of every authenticity decision with full audit trail"
          icon="📝"
        />
        <FeatureCard
          title="Policy Versioning"
          description="Branchable policy updates with sandbox testing before production deployment"
          icon="🔄"
        />
      </div>

      <Rule style={{margin:"40px 0"}}/>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:32}}>
        <div>
          <Eyebrow>Memory Layers</Eyebrow>
          <div style={{marginTop:12, display:"flex", flexDirection:"column", gap:12}}>
            <LayerItem number="01" name="Short-term" desc="Active challenge sessions" />
            <LayerItem number="02" name="Semantic" desc="Vector fingerprints for similarity search" />
            <LayerItem number="03" name="Episodic" desc="Complete decision history log" />
            <LayerItem number="04" name="Procedural" desc="Versioned policy rules" />
          </div>
        </div>
        <div>
          <Eyebrow>System Status</Eyebrow>
          <div style={{marginTop:12, padding:16, border:"1px solid var(--ink)"}}>
            <StatusItem label="Backend" value="Connected" status="ok" />
            <StatusItem label="Database" value="SQLite" status="ok" />
            <StatusItem label="MCP Server" value="Ready" status="ok" />
            <StatusItem label="Vector Index" value="Active" status="ok" />
          </div>
        </div>
      </div>
    </div>
  );
};

const FeatureCard = ({ title, description, icon }) => (
  <div style={{
    padding:20, border:"1px solid var(--ink)",
    background:"var(--paper)"
  }}>
    <div style={{fontSize:32, marginBottom:12}}>{icon}</div>
    <div style={{fontFamily:"var(--mono)", fontSize:"var(--t-2)", letterSpacing:"0.08em", marginBottom:8}}>
      {title}
    </div>
    <div style={{fontSize:"var(--t-3)", color:"var(--ink-2)", lineHeight:1.4}}>
      {description}
    </div>
  </div>
);

const LayerItem = ({ number, name, desc }) => (
  <div style={{display:"flex", gap:12, alignItems:"start"}}>
    <div style={{
      minWidth:32, height:32, background:"var(--ink)", color:"var(--paper)",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"var(--mono)", fontSize:"var(--t-2)"
    }}>
      {number}
    </div>
    <div>
      <div style={{fontFamily:"var(--mono)", fontSize:"var(--t-2)", letterSpacing:"0.06em"}}>
        {name}
      </div>
      <div style={{fontSize:"var(--t-3)", color:"var(--ink-3)", marginTop:2}}>
        {desc}
      </div>
    </div>
  </div>
);

const StatusItem = ({ label, value, status }) => (
  <div style={{display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid var(--rule)"}}>
    <span style={{fontFamily:"var(--mono)", fontSize:"var(--t-2)"}}>{label}</span>
    <div style={{display:"flex", alignItems:"center", gap:8}}>
      <span style={{fontFamily:"var(--mono)", fontSize:"var(--t-2)"}}>{value}</span>
      <div style={{
        width:8, height:8, borderRadius:"50%",
        background: status === "ok" ? "var(--verify)" : "var(--alarm)"
      }}/>
    </div>
  </div>
);

window.LandingTab = LandingTab;
