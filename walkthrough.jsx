// Milora Tech — product walkthrough. 1920×1080, keyed to OM_SCENES cues.
const C = {
  navy: '#0B1B33', navyLight: '#162848', navyMid: '#1E3A5F', accent: '#00C9A7', accentDeep: '#007A65',
  gold: '#F0A500', page: '#F0F4FA', card: '#FFFFFF', border: 'rgba(11,27,51,0.10)', borderStrong: 'rgba(11,27,51,0.18)',
  text: '#0B1B33', text2: '#4A5568', muted: '#8A9AB5', rowAlt: 'rgba(11,27,51,0.025)',
};
const F = { body: "'Inter', sans-serif", display: "'Syne', sans-serif" };
const MOTION = { enter: Easing.easeOutCubic, move: Easing.easeInOutCubic, pop: Easing.easeOutBack };
const tw = (T, from, to, start, end, ease = MOTION.move) => animate({ from, to, start, end, ease })(T);
const money = (n, d = 2) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const LOGO = (window.__resources && window.__resources.miloraLogo) || 'assets/milora-logo.png';

// Real figures from the Macy's SS25 PO in the dashboard.
const UNITS = 1240;
const IMPORT_ROWS = [
  { label: 'Factory Invoice (EXW)', v: 27096, src: 'Commercial Invoice' },
  { label: 'Air Freight · 1,915 kg @ $6.50', v: 12447.5, src: 'Freight Invoice' },
  { label: 'Customs Duty', v: 5900.54, src: 'CBP 7501' },
  { label: 'Merchandise Processing Fee', v: 93.86, src: 'CBP 7501' },
  { label: 'Customs Clearance', v: 125, src: 'Freight Invoice' },
  { label: 'Handling Fee', v: 175, src: 'Freight Invoice' },
  { label: 'Airline Terminal Fee', v: 240, src: 'Freight Invoice' },
  { label: 'Deconsolidation Transfer', v: 421.3, src: 'Freight Invoice' },
  { label: 'Delivery to Fulfillment (STL)', v: 895, src: 'Freight Invoice' },
];
const IMPORT_TOTAL = IMPORT_ROWS.reduce((a, r) => a + r.v, 0);
const OPS = 450 * 2 + 3.5 * UNITS + 1.8 * UNITS + 0.5 * UNITS + IMPORT_TOTAL * 0.005;
const OVERHEAD = (IMPORT_TOTAL + OPS) * 0.05;
const TOTAL = IMPORT_TOTAL + OPS + OVERHEAD;
const CPP = TOTAL / UNITS;
const BARS = [
  { label: 'Factory cost', v: 27096 / UNITS, color: C.navyMid },
  { label: 'Air freight', v: 12447.5 / UNITS, color: '#3A6DB5' },
  { label: 'Duty & MPF', v: (5900.54 + 93.86) / UNITS, color: C.gold },
  { label: 'Clearance & delivery', v: (125 + 175 + 240 + 421.3 + 895) / UNITS, color: '#7850C8' },
  { label: 'Fulfillment & ops', v: OPS / UNITS, color: C.accent },
  { label: 'Overhead (5%)', v: OVERHEAD / UNITS, color: C.muted },
];
const DOCS = [
  { name: 'Commercial Invoice', ref: 'Inv# Joes20250212', x: 290, y: 520, r: -8 },
  { name: 'Packing List', ref: '86 cartons · 1,240 pairs', x: 640, y: 480, r: 5 },
  { name: 'Air Waybill', ref: 'MAWB 297-65064941', x: 990, y: 520, r: -3 },
  { name: 'Arrival Notice', ref: 'ORD · Feb 17, 2025', x: 1340, y: 490, r: 6 },
  { name: 'Customs Bond', ref: 'CBP Form 301', x: 1650, y: 550, r: -5 },
  { name: 'CBP Entry Summary', ref: 'CF 7501 · 87E-0020129-5', x: 760, y: 850, r: 4 },
  { name: 'Freight Invoice', ref: 'INV25000418', x: 1180, y: 870, r: -6 },
];

function Paper({ name, docRef: r, style }) {
  return (
    <div style={{ position: 'absolute', width: 260, height: 330, background: '#FBFCFE', borderRadius: 6, boxShadow: '0 24px 60px rgba(0,0,0,0.35)', padding: 26, boxSizing: 'border-box', fontFamily: F.body, ...style }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.accentDeep, textTransform: 'uppercase' }}>Document</div>
      <div style={{ fontSize: 21, fontWeight: 700, color: C.text, marginTop: 8, lineHeight: 1.15 }}>{name}</div>
      <div style={{ fontSize: 13, color: C.text2, marginTop: 8, fontFamily: "'Courier New', monospace" }}>{r}</div>
      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[100, 82, 92, 60, 88, 74, 95].map((w, i) => <div key={i} style={{ height: 7, width: w + '%', background: 'rgba(11,27,51,0.09)', borderRadius: 2 }} />)}
      </div>
    </div>
  );
}

function Cursor({ x, y, press = 0, opacity = 1, size = 1 }) {
  const s = size * (1 - press * 0.15);
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity, transform: `scale(${s})`, transformOrigin: '0 0', pointerEvents: 'none', zIndex: 50 }}>
      <div style={{ position: 'absolute', left: -18, top: -18, width: 36, height: 36, borderRadius: 18, background: C.accent, opacity: press * 0.35 }} />
      <svg width="30" height="38" viewBox="0 0 30 38" style={{ display: 'block', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))' }}>
        <path d="M2 2 L2 31 L9.5 24 L14.5 35 L19.5 33 L14.5 22 L25 22 Z" fill="#fff" stroke={C.navy} strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ── Scene 1–2: loose documents → upload card ─────────────────────────────
function DocsAndUpload({ T, CUES }) {
  const U = CUES.Upload, P = CUES.Parse;
  const headO = tw(T, 0, 1, 0.7, 1.4, MOTION.enter) * tw(T, 1, 0, U - 0.4, U + 0.2);
  const headY = tw(T, 30, 0, 0.7, 1.6, MOTION.enter);
  const cardIn = tw(T, 0, 1, U, U + 0.7, MOTION.pop);
  const cardOut = tw(T, 0, 1, P - 0.25, P + 0.45);
  const cardO = tw(T, 0, 1, U, U + 0.4) * (1 - cardOut);
  const cardS = (0.92 + 0.08 * cardIn) * (1 + 0.05 * cardOut);
  const landAt = (i) => U + 0.45 + i * 0.22 + 0.7;
  const allIn = landAt(DOCS.length - 1);
  const click = U + 3.85;
  const press = tw(T, 0, 1, click - 0.12, click) * tw(T, 1, 0, click + 0.05, click + 0.25);
  const cx = tw(T, 1560, 1222, U + 2.6, click - 0.15);
  const cy = tw(T, 960, 762, U + 2.6, click - 0.15);
  const curO = tw(T, 0, 1, U + 2.5, U + 2.8) * tw(T, 1, 0, P - 0.3, P);
  const btnReady = tw(T, 0, 1, allIn, allIn + 0.3);
  const processing = T > click;
  return (
    <React.Fragment>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 120, textAlign: 'center', opacity: headO, transform: `translateY(${headY}px)`, fontFamily: F.display, color: '#fff' }}>
        <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05 }}>7 documents. 12 SKUs.</div>
        <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05, color: C.accent }}>One wholesale price to get right.</div>
      </div>
      {/* upload card */}
      <div style={{ position: 'absolute', left: 470, top: 210, width: 980, height: 620, background: C.card, borderRadius: 18, boxShadow: '0 40px 120px rgba(0,0,0,0.45)', opacity: cardO, transform: `scale(${cardS})`, fontFamily: F.body, padding: '34px 40px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <div style={{ width: 54, height: 54, borderRadius: 12, background: 'rgba(0,201,167,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accentDeep, fontSize: 28, fontWeight: 700 }}>↑</div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, color: C.text }}>Upload Purchase Order &amp; Documents</div>
            <div style={{ fontSize: 15, color: C.text2, marginTop: 4 }}>Macy's · Spring/Summer 2025</div>
          </div>
        </div>
        <div style={{ marginTop: 26, height: 140, borderRadius: 12, border: `2px dashed ${T > U + 0.4 && T < allIn ? C.accent : C.borderStrong}`, background: T > U + 0.4 && T < allIn ? 'rgba(0,201,167,0.06)' : C.rowAlt, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.text }}>Drag &amp; drop files here</div>
          <div style={{ fontSize: 14, color: C.muted }}>Commercial invoice, packing list, air waybill, CBP 7501, freight invoice…</div>
        </div>
        <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
          {DOCS.map((d, i) => {
            const o = tw(T, 0, 1, landAt(i) - 0.1, landAt(i) + 0.25, MOTION.enter);
            return (
              <div key={i} style={{ opacity: o, transform: `translateY(${(1 - o) * 10}px)`, display: 'flex', alignItems: 'center', gap: 12, height: 40, padding: '0 14px', borderRadius: 8, background: C.rowAlt, border: `1px solid ${C.border}` }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, background: C.accent, color: C.navy, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{d.name}</div>
                <div style={{ marginLeft: 'auto', fontSize: 12, color: C.muted }}>PDF</div>
              </div>
            );
          })}
        </div>
        <div style={{ position: 'absolute', left: 40, right: 40, bottom: 34, display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 14, color: C.muted }}>{Math.round(tw(T, 0, 7, U + 0.9, allIn, Easing.linear))} of 7 documents added</div>
          <div style={{ marginLeft: 'auto', height: 52, padding: '0 28px', borderRadius: 10, background: C.accent, color: C.navy, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', opacity: 0.45 + 0.55 * btnReady, transform: `scale(${1 - press * 0.05})` }}>
            {processing ? 'Processing…' : 'Process documents'}
          </div>
        </div>
      </div>
      {/* flying documents */}
      {DOCS.map((d, i) => {
        const appear = tw(T, 0, 1, 0.15 + i * 0.16, 0.75 + i * 0.16, MOTION.pop);
        const fs = U + 0.45 + i * 0.22;
        const fly = tw(T, 0, 1, fs, fs + 0.7);
        const drift = Math.sin(T * 0.9 + i) * 8;
        const x = d.x + (960 - d.x) * fly;
        const y = d.y + drift * (1 - fly) + (415 - d.y) * fly;
        const s = (0.8 + 0.2 * appear) * (1 - 0.85 * fly);
        const r = d.r * (1 - fly) + Math.sin(T * 0.6 + i) * 1.2 * (1 - fly);
        const o = Math.min(1, appear * 1.4) * tw(T, 1, 0, fs + 0.5, fs + 0.7);
        return <Paper key={i} name={d.name} docRef={d.ref} style={{ left: x - 130, top: y - 165, opacity: o, transform: `scale(${s}) rotate(${r}deg)` }} />;
      })}
      <Cursor x={cx} y={cy} press={press} opacity={curO} />
    </React.Fragment>
  );
}

// ── Dashboard world (1920×1080) ──────────────────────────────────────────
function Card({ x, y, w, h, title, children, style }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', ...style }}>
      <div style={{ height: 54, padding: '0 22px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: C.accent }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: 0.7 }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function Dashboard({ T, CUES }) {
  const P = CUES.Parse, PR = CUES.Price, A = CUES.Adjust, B = CUES.Breakdown;
  const rowAt = (i) => P + 0.75 + i * 0.36;
  const subtotalO = tw(T, 0, 1, rowAt(8) + 0.5, rowAt(8) + 0.9, MOTION.enter);
  const margin = tw(T, 35, 40, A + 1.45, A + 3.25);
  const sell = CPP / (1 - margin / 100);
  const profit = sell * UNITS - TOTAL;
  const count = (i) => tw(T, 0, 1, PR + 0.55 + i * 0.35, PR + 1.6 + i * 0.35, MOTION.enter);
  const metrics = [
    { label: 'Total Landed Cost', v: money(TOTAL * count(0), 0), sub: 'All import + ops costs' },
    { label: 'Cost per Pair', v: money(CPP * count(1)), sub: 'Fully loaded' },
    { label: 'Recommended Sell Price / Pair', v: money(sell * count(2)), sub: "To Macy's (wholesale)", accent: true },
    { label: 'Gross Profit', v: money(profit * count(3), 0), sub: margin.toFixed(1) + '% gross margin', gold: true },
  ];
  const pulse = tw(T, 0, 1, A + 1.4, A + 1.7) * tw(T, 1, 0, A + 3.3, A + 3.9);
  const delta = tw(T, 0, 1, A + 3.3, A + 3.7, MOTION.pop);
  // slider
  const trackX = 64, trackW = 472, trackY = 896;
  const thumbX = trackX + trackW * (margin - 10) / 50;
  const curX = interpolate([A + 0.3, A + 1.2, A + 1.45, A + 3.25, A + 4.2], [760, thumbX - 4, 299 - 4, 346 - 4, 420])(T);
  const curY = interpolate([A + 0.3, A + 1.2, A + 3.25, A + 4.2], [1010, trackY - 2, trackY - 2, 960], MOTION.move)(T);
  const curPress = tw(T, 0, 1, A + 1.25, A + 1.4) * tw(T, 1, 0, A + 3.25, A + 3.4);
  const curO = tw(T, 0, 1, A + 0.25, A + 0.55) * tw(T, 1, 0, A + 4.1, A + 4.5);
  const trackFill = (margin - 10) / 50;
  let cum = 0;
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.page, fontFamily: F.body, color: C.text }}>
      {/* header */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 84, background: C.navyLight, display: 'flex', alignItems: 'center', gap: 18, padding: '0 40px' }}>
        <img src={LOGO} style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />
        <div>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 21, color: '#fff' }}>Milora Tech</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Pricing Intelligence Platform</div>
        </div>
        <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.15)', margin: '0 8px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '7px 13px' }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: C.accent, fontSize: 10, fontWeight: 700, color: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>SC</div>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>Shoe Company</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 20, padding: '6px 14px' }}>Spring/Summer 2025</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.accent, background: 'rgba(0,201,167,0.15)', border: '1px solid rgba(0,201,167,0.3)', borderRadius: 20, padding: '6px 14px' }}>PO → Macy's</div>
        </div>
      </div>
      {/* tabs */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 84, height: 54, background: C.card, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'stretch', padding: '0 40px' }}>
        {['Price Calculator', 'Cost Breakdown', 'Per-SKU Analysis', 'Import Documents'].map((t, i) => (
          <div key={t} style={{ padding: '0 22px', display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 500, color: i === 0 ? C.accentDeep : C.text2, borderBottom: `2px solid ${i === 0 ? C.accent : 'transparent'}` }}>{t}</div>
        ))}
      </div>
      {/* import costs */}
      <Card x={40} y={160} w={520} h={580} title="Import Costs (from documents)">
        {IMPORT_ROWS.map((r, i) => {
          const p = tw(T, 0, 1, rowAt(i), rowAt(i) + 0.55, MOTION.enter);
          const flash = tw(T, 0, 1, rowAt(i), rowAt(i) + 0.15) * tw(T, 1, 0, rowAt(i) + 0.6, rowAt(i) + 1.3);
          const chipO = tw(T, 0, 1, rowAt(i) - 0.05, rowAt(i) + 0.25, MOTION.enter);
          return (
            <div key={i} style={{ height: 50, padding: '0 22px', display: 'flex', alignItems: 'center', gap: 10, background: `rgba(0,201,167,${0.1 * flash})` }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: C.text2, fontWeight: 500, whiteSpace: 'nowrap' }}>{r.label}</div>
                <div style={{ fontSize: 11, color: C.accentDeep, fontWeight: 600, opacity: chipO }}>from {r.src}</div>
              </div>
              <div style={{ marginLeft: 'auto', width: 150, height: 34, borderRadius: 8, border: `1px solid ${flash > 0.05 ? C.accent : C.borderStrong}`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 12px', fontSize: 15, fontWeight: 600, color: p > 0 ? C.text : C.muted, fontVariantNumeric: 'tabular-nums' }}>
                {p > 0 ? money(r.v * p) : '—'}
              </div>
            </div>
          );
        })}
        <div style={{ height: 52, margin: '6px 0 0', padding: '0 22px', display: 'flex', alignItems: 'center', background: 'rgba(0,201,167,0.08)', opacity: 0.35 + 0.65 * subtotalO }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Import total</div>
          <div style={{ marginLeft: 'auto', fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{subtotalO > 0 ? money(IMPORT_TOTAL * subtotalO) : '—'}</div>
        </div>
      </Card>
      {/* margin */}
      <Card x={40} y={764} w={520} h={276} title="Target Margin & Pricing">
        <div style={{ padding: '18px 24px 0', display: 'flex', fontSize: 15, color: C.text2, fontWeight: 500 }}>
          Desired profit margin<span style={{ marginLeft: 'auto', color: C.accentDeep, fontWeight: 700, fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>{margin.toFixed(1)}%</span>
        </div>
        <div style={{ position: 'absolute', left: trackX - 40, top: trackY - 764 - 3, width: trackW, height: 6, borderRadius: 3, background: 'rgba(11,27,51,0.10)' }}>
          <div style={{ width: trackFill * 100 + '%', height: '100%', borderRadius: 3, background: C.accent }} />
          <div style={{ position: 'absolute', left: trackFill * trackW - 11, top: -8, width: 22, height: 22, borderRadius: 11, background: '#fff', border: `3px solid ${C.accent}`, boxSizing: 'border-box', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }} />
        </div>
        <div style={{ position: 'absolute', left: 24, right: 24, top: 170, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, color: C.text2 }}>
          <div style={{ display: 'flex' }}>Total units in order<span style={{ marginLeft: 'auto', color: C.text, fontWeight: 600 }}>1,240 pairs</span></div>
          <div style={{ display: 'flex' }}>Pricing method<span style={{ marginLeft: 'auto', color: C.text, fontWeight: 600 }}>Blended average (all SKUs)</span></div>
        </div>
      </Card>
      {/* metrics */}
      {metrics.map((m, i) => {
        const big = m.accent ? 1 + 0.06 * pulse : 1;
        return (
          <div key={i} style={{ position: 'absolute', left: 600 + i * 325, top: 160, width: 305, height: 150, boxSizing: 'border-box', borderRadius: 12, padding: '20px 22px', background: m.accent ? 'rgba(0,201,167,0.08)' : m.gold ? 'rgba(240,165,0,0.12)' : C.card, border: `1px solid ${m.accent ? (pulse > 0.05 ? C.accent : 'rgba(0,201,167,0.3)') : m.gold ? 'rgba(240,165,0,0.3)' : C.border}` }}>
            <div style={{ fontSize: 13, color: C.text2, fontWeight: 500 }}>{m.label}</div>
            <div style={{ fontSize: 40, fontWeight: 700, marginTop: 8, lineHeight: 1.05, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums', color: m.accent ? C.accentDeep : m.gold ? '#9A6A00' : C.text, transform: `scale(${big})`, transformOrigin: 'left center' }}>
              {count(i) > 0 ? m.v : '—'}
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>{m.sub}</div>
            {m.accent && (
              <div style={{ position: 'absolute', right: 16, top: 16, opacity: delta, transform: `scale(${0.6 + 0.4 * delta})`, fontSize: 13, fontWeight: 700, color: C.navy, background: C.accent, borderRadius: 20, padding: '4px 10px' }}>
                +{money(sell - CPP / 0.65)}
              </div>
            )}
          </div>
        );
      })}
      {/* cost structure */}
      <Card x={600} y={340} w={1280} h={700} title="Cost structure — per pair (USD)">
        <div style={{ padding: '26px 36px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {BARS.concat([{ label: 'Total cost per pair', v: CPP, color: C.accentDeep, total: true }]).map((b, i) => {
            const g = tw(T, 0, 1, B + 0.5 + i * 0.32, B + 1.2 + i * 0.32, MOTION.enter);
            const left = b.total ? 0 : cum / CPP;
            if (!b.total) cum += b.v;
            const w = b.v / CPP;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20, height: 56, borderTop: b.total ? `1px dashed ${C.borderStrong}` : 'none', paddingTop: b.total ? 14 : 0 }}>
                <div style={{ width: 230, textAlign: 'right', fontSize: 16, color: b.total ? C.text : C.text2, fontWeight: b.total ? 700 : 500 }}>{b.label}</div>
                <div style={{ flex: 1, height: 38, background: C.rowAlt, borderRadius: 6, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: left * 100 + '%', top: 0, bottom: 0, width: w * g * 100 + '%', background: b.color, borderRadius: 6 }} />
                </div>
                <div style={{ width: 110, textAlign: 'right', fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', opacity: g }}>{money(b.v)}</div>
              </div>
            );
          })}
        </div>
      </Card>
      <Cursor x={curX} y={curY} press={curPress} opacity={curO} size={0.8} />
    </div>
  );
}

function CloseCard({ T, CUES, end }) {
  const K = CUES.Close;
  const a = tw(T, 0, 1, K + 1.1, K + 1.8, MOTION.pop);
  const b = tw(T, 0, 1, K + 1.5, K + 2.2, MOTION.enter);
  const out = tw(T, 1, 0, end - 0.55, end - 0.05);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34, opacity: out, fontFamily: F.display, color: '#fff' }}>
      <img src={LOGO} style={{ width: 120, height: 120, borderRadius: 26, objectFit: 'cover', opacity: a, transform: `scale(${0.7 + 0.3 * a})`, boxShadow: '0 0 0 1px rgba(255,255,255,0.08)' }} />
      <div style={{ fontSize: 104, fontWeight: 800, letterSpacing: -2, lineHeight: 1, whiteSpace: 'nowrap', opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>
        From Weeks to <span style={{ color: C.accent }}>Minutes</span>
      </div>
      <div style={{ fontFamily: F.body, fontSize: 30, color: 'rgba(255,255,255,0.7)', opacity: b, transform: `translateY(${(1 - b) * 16}px)` }}>Milora Tech · Pricing intelligence for footwear &amp; apparel brands</div>
    </div>
  );
}

function Piece({ captions }) {
  const { T, CUES, time, authoredTotal } = useComposition();
  const P = CUES.Parse, PR = CUES.Price, A = CUES.Adjust, B = CUES.Breakdown, K = CUES.Close;
  const cam = (vals) => interpolate([P - 0.3, P + 0.7, PR - 0.2, PR + 0.8, PR + 3.5, PR + 4.6, A + 0.1, A + 1.0, B - 0.2, B + 0.8, K, K + 1.3], vals, MOTION.move)(T);
  const cx = cam([770, 600, 600, 1240, 1240, 1402, 1402, 900, 900, 1240, 1240, 960]);
  const cy = cam([460, 470, 590, 360, 360, 270, 270, 495, 495, 690, 690, 540]);
  const s = cam([1.25, 1.6, 1.62, 1.5, 1.52, 2.0, 2.0, 1.1, 1.1, 1.45, 1.47, 0.78]);
  const worldO = tw(T, 0, 1, P - 0.3, P + 0.35) * tw(T, 1, 0, K + 0.9, K + 1.5);
  const navyO = 1 - tw(T, 0, 1, P - 0.1, P + 0.5) + tw(T, 0, 1, K + 0.5, K + 1.3);
  const cap = (text) => <span style={{ display: 'inline-block', background: 'rgba(11,27,51,0.92)', color: '#fff', padding: '16px 30px', borderRadius: 40, fontFamily: F.body, fontSize: 30, fontWeight: 500, textShadow: 'none', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>{text}</span>;
  return (
    <div data-screen-label={`t=${Math.floor(time)}s`} style={{ position: 'absolute', inset: 0, background: C.navy, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: worldO }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: `translate(960px,540px) scale(${s}) translate(${-cx}px,${-cy}px)`, borderRadius: s < 1 ? 16 : 0, overflow: 'hidden', boxShadow: s < 1 ? '0 40px 120px rgba(0,0,0,0.5)' : 'none' }}>
          <Dashboard T={T} CUES={CUES} />
        </div>
      </div>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 40%, ${C.navyLight} 0%, ${C.navy} 70%)`, opacity: Math.max(0, Math.min(1, navyO)), pointerEvents: 'none' }} />
      <DocsAndUpload T={T} CUES={CUES} />
      <CloseCard T={T} CUES={CUES} end={authoredTotal} />
      {captions && (
        <Captions style={{ bottom: '6%' }} items={[
          { at: CUES.Upload + 0.6, until: P - 0.3, text: cap('Drop in the PO’s invoices, freight bills and customs entries.') },
          { at: P + 0.5, until: PR - 0.2, text: cap('Milora reads every document and fills in the landed cost.') },
          { at: PR + 0.4, until: A, text: cap('Fully loaded cost per pair, and the price that hits your margin.') },
          { at: A + 0.4, until: B - 0.2, text: cap('Change the margin. Every number updates instantly.') },
          { at: B + 0.3, until: K + 0.4, text: cap('See exactly where each dollar per pair goes.') },
        ]} />
      )}
    </div>
  );
}

function Walkthrough() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS || { motionEditor: true, captions: true });
  return (
    <React.Fragment>
      <CompositionStage width={1920} height={1080} bg={C.navy} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK}>
        <Piece captions={t.captions} />
      </CompositionStage>
      <TweaksPanel>
        <TweakSection label="Video" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={(v) => setTweak('motionEditor', v)} />
        <TweakToggle label="Captions" value={t.captions} onChange={(v) => setTweak('captions', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}
window.Walkthrough = Walkthrough;
