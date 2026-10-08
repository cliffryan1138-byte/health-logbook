// One timeline out of five tables. The dashboard summarises; the Logbook view
// shows every entry as it was logged, and exports it for a doctor, a lawyer, or
// the person's own records.
//
// Every entry carries two times: `at` (when the person says it happened) and
// `recorded` (created_at — when it was written). A record made at the time
// carries more weight than one reconstructed later, so exports show both and
// mark anything written more than a day after the event.

import { FORMS, DIFFICULTY, band } from './questionnaires'
import { vitalsFlag, threshold, fmtDuration } from './pregnancy'

export const KINDS = {
  meals:    { label: 'Meals',    one: 'Meal',     time: 'eaten_at', icon: 'flame' },
  symptoms: { label: 'Symptoms', one: 'Symptom',  time: 'felt_at',  icon: 'pulse' },
  vitals:   { label: 'Vitals',   one: 'Vitals',   time: 'taken_at', icon: 'drop' },
  exercise: { label: 'Exercise', one: 'Exercise', time: 'done_at',  icon: 'dumbbell' },
  med_doses: { label: 'Medicine', one: 'Medicine', time: 'taken_at', icon: 'pill' },
  // One row per day (a date, not a moment): placed at local noon on the timeline.
  daily_checkins: { label: 'Check-ins', one: 'Check-in', time: 'day', icon: 'moon' },
  // Mental health: left out of exports unless the person includes them.
  assessments: { label: 'Questionnaires', one: 'Questionnaire', time: 'taken_at', icon: 'mind', mind: true },
  meditations: { label: 'Meditation', one: 'Meditation', time: 'done_at', icon: 'leaf', mind: true },
  // Pregnancy: kick counts, contractions, visits, questions. Left out of
  // exports unless the person includes them (with pregnancy symptoms).
  pregnancy_events: { label: 'Pregnancy', one: 'Pregnancy', time: 'at', icon: 'heart', pregnancy: true },
}

// Pregnancy entries: the tracker's own, and symptoms from the pregnancy group.
export const isPregnancyEntry = (e) => Boolean(KINDS[e.kind]?.pregnancy) || (e.kind === 'symptoms' && e.raw.body_group === 'pregnancy')

// When an entry happened. A check-in's `day` is a plain date; new Date() would
// read it as UTC midnight, which is the evening before anywhere in the US.
export function entryTime(kind, r) {
  return kind === 'daily_checkins' ? new Date(`${r.day}T12:00:00`) : new Date(r[KINDS[kind].time])
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
  if (kind === 'med_doses') {
    return { title: r.name, stats: r.dose || '', detail: r.notes || '' }
  }
  if (kind === 'exercise') {
    return {
      title: r.activity,
      stats: [r.distance_m != null && `${(r.distance_m / 1609.344).toFixed(2)} mi`, r.duration_min != null && `${n(r.duration_min)} min`,
        r.pack_lb != null && `${n(r.pack_lb)} lb pack`, r.intensity].filter(Boolean).join(' · '),
      detail: r.notes || '',
    }
  }
  if (kind === 'daily_checkins') return describeCheckin(r)
  if (kind === 'assessments') {
    const f = FORMS[r.kind]
    return { title: `${f.name} · ${f.about}`, stats: `${r.score} of ${f.max} · ${band(r.kind, r.score)}`,
      detail: r.difficulty ? `Difficulty: ${DIFFICULTY.find(([k]) => k === r.difficulty)?.[1]}` : '' }
  }
  if (kind === 'meditations') {
    return { title: `Meditation · ${r.minutes} min`, stats: [r.kind?.replace('_', ' '),
      r.mood_before_1_5 != null && r.mood_after_1_5 != null && `mood ${r.mood_before_1_5} → ${r.mood_after_1_5}`].filter(Boolean).join(' · '),
      detail: r.notes || '' }
  }
  if (kind === 'pregnancy_events') {
    if (r.kind === 'kicks') return { title: `Kick count · ${r.count ?? 0}`, stats: r.duration_sec != null ? `in ${fmtDuration(r.duration_sec)}` : '', detail: r.notes || '' }
    if (r.kind === 'contraction') return { title: 'Contraction', stats: r.duration_sec != null ? `lasted ${fmtDuration(r.duration_sec)}` : '', detail: r.notes || '' }
    if (r.kind === 'visit') return { title: `Prenatal visit${r.title ? ` · ${r.title}` : ''}`, stats: '', detail: r.notes || '' }
    return { title: `Question for the doctor${r.done ? ' (asked)' : ''}`, stats: '', detail: r.title || '' }
  }
  const bits = []
  if (r.weight_lb != null) bits.push(`${n(r.weight_lb, 1)} lb`)
  if (r.bp_systolic != null) {
    // Marked during pregnancy and the postpartum year, in the source's words.
    const flag = vitalsFlag(r)
    const t = flag && threshold(flag)
    bits.push(`BP ${r.bp_systolic}/${r.bp_diastolic ?? '—'}${t ? ` (${flag === 'severe' ? 'severe range' : 'high'} for pregnancy: top ≥${t.systolic_at_least} or bottom ≥${t.diastolic_at_least}, ACOG)` : ''}`)
  }
  if (r.glucose_mgdl != null) bits.push(`Glucose ${r.glucose_mgdl}${r.glucose_context ? ` (${r.glucose_context})` : ''}`)
  if (r.heart_rate != null) bits.push(`HR ${r.heart_rate}`)
  if (r.sleep_hr != null) bits.push(`Slept ${n(r.sleep_hr, 1)} hr`)
  return { title: bits.slice(0, 2).join(' · ') || 'Vitals', stats: bits.slice(2).join(' · '), detail: r.notes || '' }
}

const WORD = { mood_1_5: 'Mood', stress_1_5: 'Stress', energy_1_5: 'Energy', sleep_quality_1_5: 'Sleep quality', hot_flashes_1_5: 'Hot flashes', night_sweats_1_5: 'Night sweats' }
const IMPACT_WORDS = { missed_work: 'missed work', bed_rest: 'bed rest', needed_help: 'needed help', couldnt_drive: 'couldn’t drive' }

function describeCheckin(r) {
  const first = []
  if (r.sleep_hr != null) first.push(`Slept ${n(r.sleep_hr, 1)} hr${r.woke_at_night ? ' (woke in the night)' : ''}`)
  for (const k of ['mood_1_5', 'stress_1_5', 'energy_1_5']) if (r[k] != null) first.push(`${WORD[k]} ${r[k]}/5`)
  const more = []
  if (r.sleep_quality_1_5 != null) more.push(`${WORD.sleep_quality_1_5} ${r.sleep_quality_1_5}/5`)
  if (r.water_glasses != null) more.push(`${r.water_glasses} water`)
  if (r.caffeine_cups != null) more.push(`${r.caffeine_cups} caffeine`)
  if (r.alcohol_drinks != null) more.push(`${r.alcohol_drinks} alcohol${r.alcohol_type ? ` (${r.alcohol_type})` : ''}`)
  if (r.bowel) more.push(`bowel ${r.bowel}`)
  if (r.bloating) more.push('bloating')
  if (r.reflux) more.push('reflux')
  if (r.period && r.period !== 'none') more.push(`period ${r.period}`)
  for (const k of ['hot_flashes_1_5', 'night_sweats_1_5']) if (r[k] != null) more.push(`${WORD[k]} ${r[k]}/5`)
  const impact = Object.keys(IMPACT_WORDS).filter((k) => r[k]).map((k) => IMPACT_WORDS[k])
  return {
    title: first.slice(0, 2).join(' · ') || 'Check-in',
    stats: [...first.slice(2), ...more].join(' · '),
    detail: [impact.length && `Day: ${impact.join(', ')}`, r.notes].filter(Boolean).join(' — '),
  }
}

export function toEntries(logs) {
  const out = []
  for (const kind of Object.keys(KINDS)) {
    for (const r of logs[kind] || []) {
      const at = entryTime(kind, r)
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

// An entry's time of day, or "All day" for a check-in (it has a date, not a time).
export function entryClock(e) {
  return e.kind === 'daily_checkins' ? 'All day' : fmtTime(e.at)
}

export function fmtStamp(d) {
  return d ? `${fmtDay(d, { year: 'numeric', month: 'short', day: 'numeric' })} ${fmtTime(d)}` : 'not recorded'
}

// ---------------------------------------------------------------- CSV

const COLS = {
  meals: ['description', 'calories', 'carbs_g', 'sugar_g', 'fiber_g', 'protein_g', 'fat_g', 'sodium_mg', 'confidence', 'source', 'trigger_watch', 'notes'],
  symptoms: ['symptom', 'body_group', 'severity_1_5', 'duration_hr', 'suspected_trigger', 'notes'],
  vitals: ['weight_lb', 'bp_systolic', 'bp_diastolic', 'heart_rate', 'glucose_mgdl', 'glucose_context', 'sleep_hr', 'energy_1_5', 'mood_1_5', 'waist_in', 'notes'],
  exercise: ['activity', 'duration_min', 'intensity', 'notes'],
  med_doses: ['name', 'dose', 'notes'],
  daily_checkins: ['sleep_hr', 'sleep_quality_1_5', 'woke_at_night', 'mood_1_5', 'stress_1_5', 'energy_1_5', 'water_glasses',
    'caffeine_cups', 'alcohol_drinks', 'alcohol_type', 'bowel', 'bloating', 'reflux', 'period', 'hot_flashes_1_5',
    'night_sweats_1_5', 'missed_work', 'bed_rest', 'needed_help', 'couldnt_drive', 'notes'],
  assessments: ['kind', 'answers', 'score', 'difficulty'],
  meditations: ['minutes', 'kind', 'mood_before_1_5', 'mood_after_1_5', 'notes'],
  pregnancy_events: ['kind', 'count', 'duration_sec', 'title', 'notes', 'done'],
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
    [KINDS[e.kind].one, dayKey(e.at), e.kind === 'daily_checkins' ? '' : fmtTime(e.at), ...fields.map((f) => e.raw[f]),
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
