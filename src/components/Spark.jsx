export default function Spark({ series }) {
  if (!series || series.length < 2) return <div className="empty">Not enough days logged yet for a trend.</div>
  const w = 300, h = 46, pad = 4
  const vals = series.map((s) => s.value)
  const min = Math.min(...vals), max = Math.max(...vals)
  const rng = max - min || 1
  const step = (w - pad * 2) / (vals.length - 1)
  const pts = vals.map((v, i) => [pad + i * step, pad + (h - pad * 2) * (1 - (v - min) / rng)])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${h - pad} L${pts[0][0].toFixed(1)} ${h - pad} Z`
  const last = pts[pts.length - 1]
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="ar" d={area} />
      <path className="ln" d={line} />
      <circle className="dot" cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="3.2" />
    </svg>
  )
}
