// One timeline out of four tables. The dashboard summarises; the Logbook view
// shows every entry as it was logged, and exports it for a doctor, a lawyer, or
// the person's own records.
//
// Every entry carries two times: `at` (when the person says it happened) and
// `recorded` (created_at — when it was written). A record made at the time
// carries more weight than one reconstructed later, so exports show both and
// mark anything written more than a day after the event.

export const KINDS = {
  meals:    { label: 'Meals',    one: 'Meal',     time: 'eaten_at', icon: 'flame' },
  symptoms: { label: 'Symptoms', one: 'Symptom',  time: 'felt_at',  icon: 'pulse' },
  vitals:   { label: 'Vitals',   one: 'Vitals',   time: 'taken_at', icon: 'drop' },
  exercise: { label: 'Exercise', one: 'Exercise', time: 'done_at',  icon: 'dumbbell' },
}

export const HEADACHE = /headache|migraine/i
const LATE_MS = 24 * 3600 * 1000

const n = (v, d = 0) =>
  v == null || Number.isNaN(Number(v))
    ? null
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: d })

export function isHeadache(e) {
  return e.kind === 'symptoms' && (HEADACHE.test(e.raw.symptom || '') || HEADACHE.test(e.raw.notes || ''))
}

// Short title + one-line detail for the feed. Also used for the earlier
// versions of edited entries (entry_history.old_row), which have the same shape.
export function describe(kind, r) {
  if (kind === 'meals') {
    return {
      title: r.description || 'Meal',
      stats: [r.calories != null && `${n(r.calories)} kcal`, r.sugar_g != null && `${n(r.sugar_g)} g sugar`]
        .filter(Boolean).join(' · '),
      detail: r.notes && r.notes !== r.description ? r.notes : '',
    }
  }
  if (kind === 'symptoms') {
    return {
      title: r.symptom,
      stats: [`${r.severity_1_5}/5`, r.duration_hr != null && `${n(r.duration_hr, 1)} hr`].filter(Boolean).join(' · '),
      detail: [r.notes, r.suspected_trigger && `Suspected trigger: ${r.suspected_trigger}`].filter(Boolean).join(' — '),
    }
  }
  if (kind === 'exercise') {
    return {
      title: r.activity,
      stats: [r.duration_min != null && `${n(r.duration_min)} min`, r.intensity].filter(Boolean).join(' · '),
      detail: r.notes || '',
    }
  }
  const bits = []
  if (r.weight_lb != null) bits.push(`${n(r.weight_lb, 1)} lb`)
  if (r.bp_systolic != null) bits.push(`BP ${r.bp_systolic}/${r.bp_diastolic ?? '—'}`)
  if (r.glucose_mgdl != null) bits.push(`Glucose ${r.glucose_mgdl}${r.glucose_context ? ` (${r.glucose_context})` : ''}`)
  if (r.heart_rate != null) bits.push(`HR ${r.heart_rate}`)
  if (r.sleep_hr != null) bits.push(`Slept ${n(r.sleep_hr, 1)} hr`)
  return { title: bits.slice(0, 2).join(' · ') || 'Vitals', stats: bits.slice(2).join(' · '), detail: r.notes || '' }
}

export function toEntries(logs) {
  const out = []
  for (const kind of Object.keys(KINDS)) {
    for (const r of logs[kind] || []) {
      const at = new Date(r[KINDS[kind].time])
      const recorded = r.created_at ? new Date(r.created_at) : null
      out.push({
        id: `${kind}:${r.id}`,
        kind,
        at,
        recorded,
        late: recorded ? recorded - at > LATE_MS : false,
        // Set by the database when a row changes after it was recorded; the
        // earlier version is kept in entry_history.
        edited: r.edited_at ? new Date(r.edited_at) : null,
        raw: r,
        ...describe(kind, r),
      })
    }
  }
  return out.sort((a, b) => b.at - a.at)
}

export function dayKey(d) {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export function fmtDay(d, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Date(d).toLocaleDateString(undefined, opts)
}

export function fmtTime(d) {
  return new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function fmtStamp(d) {
  return d ? `${fmtDay(d, { year: 'numeric', month: 'short', day: 'numeric' })} ${fmtTime(d)}` : 'not recorded'
}

// ---------------------------------------------------------------- CSV

const COLS = {
  meals: ['description', 'calories', 'carbs_g', 'sugar_g', 'fiber_g', 'protein_g', 'fat_g', 'sodium_mg', 'confidence', 'source', 'trigger_watch', 'notes'],
  symptoms: ['symptom', 'severity_1_5', 'duration_hr', 'suspected_trigger', 'notes'],
  vitals: ['weight_lb', 'bp_systolic', 'bp_diastolic', 'heart_rate', 'glucose_mgdl', 'glucose_context', 'sleep_hr', 'energy_1_5', 'mood_1_5', 'waist_in', 'notes'],
  exercise: ['activity', 'duration_min', 'intensity', 'notes'],
}

export function toCSV(entries) {
  const kinds = [...new Set(entries.map((e) => e.kind))]
  const fields = []
  for (const k of kinds) for (const c of COLS[k]) if (!fields.includes(c)) fields.push(c)
  const head = ['log', 'date', 'time', ...fields, 'recorded_at', 'edited_at']
  const q = (v) => {
    if (v == null) return ''
    const s = Array.isArray(v) ? v.join('; ') : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = [...entries].sort((a, b) => a.at - b.at).map((e) =>
    [KINDS[e.kind].one, dayKey(e.at), fmtTime(e.at), ...fields.map((f) => e.raw[f]),
      e.recorded ? e.recorded.toISOString() : '', e.edited ? e.edited.toISOString() : ''].map(q).join(','))
  return [head.join(','), ...rows].join('\n')
}

export function download(filename, text, type = 'text/csv') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function slug(s) {
  return String(s || 'logbook').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
