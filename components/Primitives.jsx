import { useMemo } from "react";

const Eyebrow = ({ children, style }) => <div className="eyebrow" style={style}>{children}</div>;

const Rule = ({ dashed, dotted, style }) => {
  if (dashed) return <hr className="hr-dash" style={style} />;
  if (dotted) return <hr className="rule-dot" style={style} />;
  return <div className="hr" style={style} />;
};

const Dot = ({ tone, pulse }) => (
  <span className={`dot ${tone || ""} ${pulse ? "pulse" : ""}`} />
);

const Tag = ({ tone, children, style }) => (
  <span className={`tag ${tone || ""}`} style={style}>{children}</span>
);

const BackendHook = ({ name }) => <span className="backend-hook">{name}</span>;

const Xhair = ({ children, style, className }) => (
  <div className={`xhair ${className || ""}`} style={style}>
    <span className="xh-tr" />
    <span className="xh-br" />
    {children}
  </div>
);

const Card = ({ title, right, children, inset, style, bodyStyle }) => (
  <div className={`card ${inset ? "inset" : ""}`} style={style}>
    {title && (
      <div className="head">
        <span>{title}</span>
        {right && <span style={{ textTransform: "none", letterSpacing: "0.04em", opacity: 0.85 }}>{right}</span>}
      </div>
    )}
    <div className="body" style={bodyStyle}>{children}</div>
  </div>
);

const KV = ({ rows }) => (
  <dl className="kv">
    {rows.map(([k, v], i) => (
      <div key={`${k}-${i}`}>
        <dt>{k}</dt><dd>{v}</dd>
      </div>
    ))}
  </dl>
);

const SigLine = ({ label, width = 180 }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <div style={{
      width,
      height: 18,
      borderBottom: "1px solid var(--ink)",
      position: "relative",
    }}>
      <svg width={width} height={18} style={{ position: "absolute", left: 0, top: 0, opacity: 0.6 }}>
        <path
          d={`M4 13 q ${width * 0.15} -8 ${width * 0.25} -2 t ${width * 0.2} 1 t ${width * 0.18} -3 t ${width * 0.2} 2`}
          stroke="var(--ink)"
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
    <div className="eyebrow">{label}</div>
  </div>
);

const Ticker = ({ items }) => {
  const content = items.concat(items);
  return (
    <div className="ticker">
      <div>
        {content.map((it, i) => (
          <span key={`${it.label}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className={`dot ${it.tone || ""}`} style={{ width: 6, height: 6 }} />
            {it.label}
          </span>
        ))}
      </div>
    </div>
  );
};

const Spark = ({ data, width = 120, height = 28, tone = "var(--ink)" }) => {
  if (!data || !data.length) return <svg width={width} height={height} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (width - 2) + 1;
      const y = height - 2 - ((v - min) / rng) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={tone} strokeWidth="1.2" />
    </svg>
  );
};

const Wave = ({ width = 320, height = 48, seed = 1, tone = "var(--ink)", attack = false }) => {
  const bars = 64;
  const arr = useMemo(() => {
    const out = [];
    let s = seed;
    for (let i = 0; i < bars; i += 1) {
      s = (s * 9301 + 49297) % 233280;
      const base = Math.abs(Math.sin(i * 0.21 + seed)) * 0.5 + (s / 233280) * 0.5;
      const env = Math.sin((i / bars) * Math.PI);
      let v = base * env;
      if (attack) {
        if (i % 7 === 0) v = Math.min(1, v * 1.6);
        if (i > 30 && i < 40) v = v * 0.3;
      }
      out.push(v);
    }
    return out;
  }, [seed, attack]);
  const bw = (width - bars) / bars;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {arr.map((v, i) => {
        const h = v * (height - 4) + 2;
        const x = i * (bw + 1);
        const y = (height - h) / 2;
        return <rect key={`${seed}-${i}`} x={x} y={y} width={bw} height={h} fill={tone} />;
      })}
    </svg>
  );
};

export {
  Eyebrow,
  Rule,
  Dot,
  Tag,
  BackendHook,
  Xhair,
  Card,
  KV,
  SigLine,
  Ticker,
  Spark,
  Wave,
};

