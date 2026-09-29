import { useMemo, useState } from 'react'
import Card from './Card'
import { HEADACHE, dayKey, fmtDay, fmtTime, isHeadache } from '../lib/entries'

// A month-at-a-glance grid: one square per day, darker = worse. Three states are
// drawn differently on purpose — "nothing logged" (dashed), "logged, no
// symptom" (flat), and a symptom (shaded by the worst severity that day) — so a
// day nobody logged never reads as a good day.

const DAY = 86400000

// `days` is how much is loaded (drawn as context); `range` is what the summary
// line counts, so it agrees with the tiles above it.
export default function SymptomCalendar({ entries, days, range = days }) {
  const symptoms = entries.filter((e) => e.kind === 'symptoms')
  const hasHead = symptoms.some(isHeadache)
  const [filter, setFilter] = useState(hasHead ? 'head' : 'all')
  const [picked, setPicked] = useState(null)

  const others = useMemo(() => {
    const count = new Map()
    for (const e of symptoms) if (!HEADACHE.test(e.raw.symptom)) count.set(e.raw.symptom, (count.get(e.raw.symptom) || 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s)
  }, [symptoms])

  if (!symptoms.length) return null

  const match = (e) => filter === 'all' ? true : filter === 'head' ? isHeadache(e) : e.raw.symptom === filter
  const shown = symptoms.filter(match)
  const byDay = new Map()
  for (const e of shown) {
    const k = dayKey(e.at)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k).push(e)
  }
  const logged = new Set(entries.map((e) => dayKey(e.at)))

  // Whole weeks, Monday first, ending with the current week.
  const weeks = Math.ceil(days / 7)
  const today = new Date(); today.setHours(12, 0, 0, 0)
  const end = new Date(today.getTime() + (6 - ((today.getDay() + 6) % 7)) * DAY)
  const start = new Date(end.getTime() - (weeks * 7 - 1) * DAY)
  // Days before the loaded window are unknown, not empty — hide them.
  const loadedFrom = new Date(today.getTime() - (days - 1) * DAY); loadedFrom.setHours(0, 0, 0, 0)
  const cells = []
  for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
    const d = new Date(t), k = dayKey(d)
    if (d > today || d < loadedFrom) { cells.push({ k, state: 'future' }); continue }
    const hits = byDay.get(k)
    if (hits) cells.push({ k, d, state: 'hit', level: Math.max(...hits.map((e) => e.raw.severity_1_5 || 3)), hits })
    else cells.push({ k, d, state: logged.has(k) ? 'clear' : 'none' })
  }

  const label = filter === 'head' ? 'headache' : filter === 'all' ? 'symptom' : filter.toLowerCase()
  const rangeFrom = new Date(today.getTime() - (range - 1) * DAY); rangeFrom.setHours(0, 0, 0, 0)
  const counted = shown.filter((e) => e.at >= rangeFrom)
  const nDays = new Set(counted.map((e) => dayKey(e.at))).size
  const sev = counted.map((e) => e.raw.severity_1_5).filter((v) => v != null)
  const hrs = counted.map((e) => e.raw.duration_hr).filter((v) => v != null).map(Number)
  const pick = picked && cells.find((c) => c.k === picked)

  return (
    <Card icon="pulse" title="Symptom calendar" tag="darker = worse">
      <div className="chips tight" role="group" aria-label="Which symptoms">
        <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
        {hasHead && (
          <button type="button" className="chip" aria-pressed={filter === 'head'} onClick={() => setFilter('head')}>Headaches</button>
        )}
        {others.map((s) => (
          <button type="button" key={s} className="chip" aria-pressed={filter === s} onClick={() => setFilter(s)}>{s}</button>
        ))}
      </div>

      <div className="cal-scroll">
        <div className="cal-wrap">
          <div className="cal-days" aria-hidden="true"><span>M</span><span /><span>W</span><span /><span>F</span><span /><span>S</span></div>
          <div className="cal" role="grid" aria-label={`${label} calendar`}>
            {cells.map((c) => (
              <button
                type="button"
                key={c.k}
                className={`cell ${c.state}${picked === c.k ? ' on' : ''}`}
                style={c.state === 'hit' ? { background: `var(--sev-${Math.min(5, Math.max(1, c.level))})` } : undefined}
                disabled={c.state === 'future'}
                aria-label={c.d ? `${fmtDay(c.d)}: ${c.state === 'hit' ? `${c.hits.length} ${label}, worst ${c.level} of 5` : c.state === 'clear' ? `no ${label}` : 'nothing logged'}` : undefined}
                onClick={() => setPicked(picked === c.k ? null : c.k)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="legend">
        <span><i className="sw none" />Nothing logged</span>
        <span><i className="sw clear" />No {label}</span>
        <span>Mild {[1, 2, 3, 4, 5].map((i) => <i key={i} className="sw" style={{ background: `var(--sev-${i})` }} />)} Severe</span>
      </div>

      {pick ? (
        <div className="cal-pick">
          <strong>{fmtDay(pick.d, { weekday: 'long', month: 'short', day: 'numeric' })}</strong>
          {pick.state === 'hit'
            ? pick.hits.map((e) => (
              <div key={e.id} className="cal-pick-row">
                {e.title} · {e.raw.severity_1_5}/5 · {fmtTime(e.at)}{e.detail ? ` — ${e.detail}` : ''}
              </div>
            ))
            : <div className="cal-pick-row">{pick.state === 'clear' ? `Logged, no ${label}.` : 'Nothing logged this day.'}</div>}
        </div>
      ) : (
        <p className="cal-sum">
          {nDays
            ? <><b>{nDays}</b> {label} day{nDays === 1 ? '' : 's'}
              {sev.length > 0 && <> · average severity <b>{(sev.reduce((a, b) => a + b, 0) / sev.length).toFixed(1)}</b>/5</>}
              {hrs.length > 0 && <> · <b>{hrs.reduce((a, b) => a + b, 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}</b> hours</>}
              {' '}in this range. Tap a day for details.</>
            : `No ${label} entries in this range.`}
        </p>
      )}
    </Card>
  )
}
