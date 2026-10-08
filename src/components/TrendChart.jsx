import { useEffect, useMemo, useRef, useState } from 'react'
import Card from './Card'
import { dayKey, fmtDay } from '../lib/entries'
import { glucoseByContext, fmt } from '../lib/stats'
import { vitalsFlag } from '../lib/pregnancy'

// One chart with tabs instead of a wall of cards: whichever measures the person
// actually logs. A day with nothing logged is a gap in the chart, never a zero.

const METRICS = [
  { k: 'Weight', table: 'vitals', f: 'weight_lb', time: 'taken_at', how: 'avg', kind: 'line', unit: 'lb', dp: 1 },
  { k: 'Calories', table: 'meals', f: 'calories', time: 'eaten_at', how: 'sum', kind: 'bar', unit: 'kcal', dp: 0, target: 'calories' },
  { k: 'Sugar', table: 'meals', f: 'sugar_g', time: 'eaten_at', how: 'sum', kind: 'bar', unit: 'g', dp: 0, target: 'sugar_g' },
  { k: 'Protein', table: 'meals', f: 'protein_g', time: 'eaten_at', how: 'sum', kind: 'bar', unit: 'g', dp: 0, target: 'protein_g' },
  { k: 'Sleep', table: 'vitals', f: 'sleep_hr', time: 'taken_at', how: 'avg', kind: 'bar', unit: 'hr', dp: 1 },
  { k: 'Blood sugar', table: 'vitals', f: 'glucose_mgdl', time: 'taken_at', how: 'avg', kind: 'line', unit: 'mg/dL', dp: 0 },
  // The day's highest top number, so one high reading is never averaged away.
  // During pregnancy and the year after, readings at ACOG's thresholds are
  // marked (lib/pregnancy.js).
  { k: 'Blood pressure', table: 'vitals', f: 'bp_systolic', time: 'taken_at', how: 'max', kind: 'line', unit: 'mmHg (top)', dp: 0, flags: true },
  { k: 'Activity', table: 'exercise', f: 'duration_min', time: 'done_at', how: 'sum', kind: 'bar', unit: 'min', dp: 0 },
]
const CONTEXT_LABEL = {
  fasting: 'Fasting', 'post-breakfast': 'After breakfast', 'post-lunch': 'After lunch',
  'post-dinner': 'After dinner', random: 'Random',
}

export default function TrendChart({ logs, days, targets }) {
  const avail = METRICS.filter((m) => (logs[m.table] || []).some((r) => r[m.f] != null))
  const [pick, setPick] = useState(null)
  const m = avail.find((x) => x.k === pick) || avail[0]
  const box = useRef(null)
  const [width, setWidth] = useState(320)
  const [hover, setHover] = useState(null)

  useEffect(() => {
    if (!box.current) return
    // Measure now, then follow resizes (rotation, window drags).
    setWidth(Math.max(260, box.current.clientWidth))
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, e.contentRect.width)))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [m?.k])

  const series = useMemo(() => {
    if (!m) return []
    const byDay = new Map(), flagDay = new Map()
    for (const r of logs[m.table]) {
      if (r[m.f] == null) continue
      const k = dayKey(r[m.time])
      byDay.set(k, [...(byDay.get(k) || []), Number(r[m.f])])
      if (m.flags) {
        const f = vitalsFlag(r)
        if (f && flagDay.get(k) !== 'severe') flagDay.set(k, f)
      }
    }
    const out = []
    const today = new Date(); today.setHours(12, 0, 0, 0)
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000)
      const v = byDay.get(dayKey(d))
      const val = !v ? null : m.how === 'sum' ? v.reduce((a, b) => a + b, 0) : m.how === 'max' ? Math.max(...v) : v.reduce((a, b) => a + b, 0) / v.length
      out.push({ d, v: val, flag: flagDay.get(dayKey(d)) || null })
    }
    return out
  }, [logs, m, days])

  if (!m) return null

  const have = series.filter((p) => p.v != null).map((p) => p.v)
  const target = m.target && targets?.[m.target] != null ? Number(targets[m.target]) : null
  const H = 200, P = { l: 40, r: 12, t: 14, b: 26 }
  const iw = width - P.l - P.r, ih = H - P.t - P.b
  let lo = Math.min(...have, target ?? Infinity), hi = Math.max(...have, target ?? -Infinity)
  if (m.kind === 'bar') lo = 0
  else { const pad = (hi - lo) * 0.15 || Math.max(1, hi * 0.02); lo -= pad; hi += pad }
  const raw = (hi - lo) / 4 || 1, mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= raw)
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step
  const x = (i) => P.l + (i + 0.5) * iw / series.length
  const y = (v) => P.t + ih - ((v - lo) / (hi - lo || 1)) * ih
  const ticks = []
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v)
  const xl = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])]
  const pts = series.map((p, i) => (p.v == null ? null : [x(i), y(p.v), p.flag])).filter(Boolean)
  const bw = Math.max(2, Math.min(24, (iw / series.length) * 0.66)), br = Math.min(4, bw / 2)
  const hp = hover != null ? series[hover] : null

  const onMove = (ev) => {
    const rect = box.current.getBoundingClientRect()
    const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left
    setHover(Math.max(0, Math.min(series.length - 1, Math.floor(((px - P.l) / iw) * series.length))))
  }

  const glucose = m.k === 'Blood sugar' ? glucoseByContext(logs.vitals) : null

  return (
    <Card icon="scale" title="Trends" tag={`${have.length} of ${days} days`}>
      <div className="tabs" role="tablist">
        {avail.map((a) => (
          <button key={a.k} role="tab" aria-selected={a.k === m.k} onClick={() => { setPick(a.k); setHover(null) }}>{a.k}</button>
        ))}
      </div>

      <div className="chart" ref={box}>
        {have.length === 0 ? (
          <div className="empty chart-empty">No {m.k.toLowerCase()} logged in this range.</div>
        ) : (
          <svg width={width} height={H} role="img" aria-label={`${m.k} by day`}
            onMouseMove={onMove} onTouchStart={onMove} onTouchMove={onMove} onMouseLeave={() => setHover(null)}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={P.l} x2={width - P.r} y1={y(v)} y2={y(v)} className="grid-ln" />
                <text x={P.l - 6} y={y(v) + 4} textAnchor="end" className="ax">{fmt(v, step < 1 ? 1 : 0)}</text>
              </g>
            ))}
            {xl.map((i) => (
              <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="ax">{fmtDay(series[i].d, { month: 'short', day: 'numeric' })}</text>
            ))}
            {m.kind === 'bar'
              ? series.map((p, i) => {
                if (p.v == null) return null
                const top = y(p.v), base = y(lo), cx = x(i) - bw / 2
                return <path key={i} className="bar" d={`M${cx},${base}V${Math.min(base, top + br)}Q${cx},${top} ${cx + br},${top}H${cx + bw - br}Q${cx + bw},${top} ${cx + bw},${Math.min(base, top + br)}V${base}Z`} />
              })
              : <>
                {pts.length > 1 && <path className="line" d={`M${pts.map((p) => `${p[0]},${p[1]}`).join('L')}`} />}
                {/* Flagged readings are always drawn, however many days are shown. */}
                {pts.filter((p, i) => p[2] || pts.length <= 40 || i === pts.length - 1).map((p, i) => (
                  <circle key={i} className={`pt${p[2] ? ` flag ${p[2]}` : ''}`} cx={p[0]} cy={p[1]} r={p[2] ? 5.5 : 4} />
                ))}
              </>}
            {target != null && (
              <g>
                <line x1={P.l} x2={width - P.r} y1={y(target)} y2={y(target)} className="target" />
                <text x={width - P.r} y={y(target) - 5} textAnchor="end" className="ax">target {fmt(target)}</text>
              </g>
            )}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={P.t + ih} className="xhair" />}
            <rect x={P.l} y={P.t} width={iw} height={ih} fill="transparent" />
          </svg>
        )}
        {hp && (
          <div className="tip" style={{ left: Math.max(70, Math.min(width - 70, x(hover))), top: hp.v == null ? P.t + ih / 2 : y(hp.v) }}>
            {fmtDay(hp.d)} · <b>{hp.v == null ? 'not logged' : `${fmt(hp.v, m.dp)} ${m.unit}`}</b>
            {hp.flag && <> · {hp.flag === 'severe' ? 'severe range' : 'high'} for pregnancy</>}
          </div>
        )}
      </div>

      {glucose && (
        <div className="ctx-list">
          {glucose.map((g) => (
            <div className="ctx" key={g.context}>
              <span className="name">{CONTEXT_LABEL[g.context] || g.context}</span>
              <span className="n">n={g.n}</span>
              <span className="val">{fmt(g.value)} mg/dL</span>
            </div>
          ))}
        </div>
      )}

      <details className="as-table">
        <summary>View as a table</summary>
        <table>
          <thead><tr><th>Date</th><th>{m.k} ({m.unit})</th></tr></thead>
          <tbody>
            {[...series].reverse().filter((p) => p.v != null).map((p) => (
              <tr key={p.d.getTime()}><td>{fmtDay(p.d)}</td><td>{fmt(p.v, m.dp)}{p.flag ? ` · ${p.flag === 'severe' ? 'severe range' : 'high'} for pregnancy` : ''}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </Card>
  )
}
