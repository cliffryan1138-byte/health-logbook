// Rollups over raw rows. Every function returns null when there's no data —
// a gap is a gap, never a zero (the "gap, not zero" rule from the skill).
//
// RECOVERY NOTE: everything down to dailySeries() is the original file,
// recovered byte-exact from the Vercel deployment. The last ~2.3 KB was lost to
// a response limit; glucoseByContext, symptomSummary, triggerMatches and fmt are
// reconstructed from their call sites in Dashboard.jsx and the live schema.

const DAY = 86400000

export function daysAgo(n) {
  const d = new Date(Date.now() - n * DAY)
  return d.toISOString()
}

export function todayRows(rows, field) {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  return rows.filter((r) => new Date(r[field]) >= start)
}

export function sum(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => v != null)
  return vals.length ? vals.reduce((a, b) => a + Number(b), 0) : null
}

export function avg(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => v != null)
  return vals.length ? vals.reduce((a, b) => a + Number(b), 0) / vals.length : null
}

export function latest(rows, key, timeField) {
  const withVal = rows.filter((r) => r[key] != null)
  if (!withVal.length) return null
  withVal.sort((a, b) => new Date(b[timeField]) - new Date(a[timeField]))
  return withVal[0]
}

// Daily series for sparklines: one point per day that has data, oldest first.
export function dailySeries(rows, key, timeField, days = 14) {
  const byDay = new Map()
  for (const r of rows) {
    if (r[key] == null) continue
    const d = new Date(r[timeField]); d.setHours(0, 0, 0, 0)
    const k = d.getTime()
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k).push(Number(r[key]))
  }
  const cutoff = Date.now() - days * DAY
  return [...byDay.entries()]
    .filter(([k]) => k >= cutoff)
    .sort((a, b) => a[0] - b[0])
    .map(([k, vals]) => ({ day: k, value: vals.reduce((a, b) => a + b, 0) / vals.length }))
}

// --- reconstructed below this line ---------------------------------------

// Average glucose grouped by the context it was taken in. Contexts with no
// readings are omitted entirely rather than reported as zero.
export function glucoseByContext(vitals) {
  const order = ['fasting', 'post-breakfast', 'post-lunch', 'post-dinner', 'random']
  const out = []
  for (const ctx of order) {
    const rows = vitals.filter((v) => v.glucose_context === ctx && v.glucose_mgdl != null)
    if (!rows.length) continue
    out.push({ context: ctx, value: avg(rows, 'glucose_mgdl'), n: rows.length })
  }
  return out.length ? out : null
}

// Most-reported symptoms in the window, worst first by mean severity.
export function symptomSummary(symptoms) {
  if (!symptoms.length) return null
  const byName = new Map()
  for (const s of symptoms) {
    if (!byName.has(s.symptom)) byName.set(s.symptom, [])
    byName.get(s.symptom).push(s)
  }
  return [...byName.entries()]
    .map(([symptom, rows]) => ({
      symptom,
      count: rows.length,
      severity: avg(rows, 'severity_1_5'),
    }))
    .sort((a, b) => b.severity - a.severity || b.count - a.count)
}

// Meals whose trigger_watch overlaps the profile's watch_list.
export function triggerMatches(meals, watchList) {
  if (!watchList?.length) return null
  const hits = meals.filter((m) => (m.trigger_watch || []).some((t) => watchList.includes(t)))
  return hits.length ? hits : null
}

// Format a possibly-null number. Null renders as an em dash, never 0.
export function fmt(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return '—'
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}
