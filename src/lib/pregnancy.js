import { supabase } from './supabase'

// The pregnancy tracker (WG-PLAN-HEALTH-002, workstream 9; migration 0015).
//
// The safety checks here run on the phone with no network call, so they work
// offline: the active pregnancy and the blood pressure thresholds are kept on
// the phone (localStorage) every time they load, and the checks read that
// copy. The thresholds come from ref_pregnancy_bp — reference data with its
// published source — never from numbers typed into this file.

const KEY = 'lb_pregnancy'
const DAY = 86400000
const OUTBOX = 'lb_outbox'

// ---------------------------------------------------------------- the cache

function readCache() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}
function writeCache(v) {
  try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY) } catch { /* private mode */ }
}

// The active pregnancy (pregnant or postpartum) and the thresholds, fresh from
// the database; the phone keeps a copy for the offline checks.
export async function loadPregnancy(profileId) {
  const [p, t] = await Promise.all([
    supabase.from('pregnancies').select('*').eq('profile_id', profileId)
      .in('status', ['pregnant', 'postpartum']).maybeSingle(),
    supabase.from('ref_pregnancy_bp').select('*'),
  ])
  if (p.error) throw p.error
  const thresholds = t.data?.length ? t.data : readCache()?.thresholds || []
  writeCache({ pregnancy: p.data || null, thresholds })
  return { pregnancy: p.data || null, thresholds }
}

export const cachedPregnancy = () => readCache()?.pregnancy || null

// ---------------------------------------------------------------- dates

export const localDate = (d = new Date()) => {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 10)
}
const atNoon = (iso) => new Date(`${iso}T12:00:00`)
export const addDays = (iso, n) => localDate(new Date(atNoon(iso).getTime() + n * DAY))

// Due date from the first day of the last period: 280 days (Naegele's rule).
export const dueFromLmp = (lmp) => addDays(lmp, 280)

// Weeks and days pregnant on a given day, counted from the due date (day 280).
// The plan: show the week count and nothing else derived from it.
export function weekCount(dueDate, on = new Date()) {
  const days = 280 - Math.round((atNoon(dueDate) - atNoon(localDate(on))) / DAY)
  if (days < 0) return null
  return { weeks: Math.floor(days / 7), days: days % 7 }
}

// Is this moment inside the tracked window: from 280 days before the due date,
// through the postpartum year (or until the tracker ended)?
export function inWindow(p, at = new Date()) {
  if (!p) return false
  const day = localDate(at)
  const start = addDays(p.due_date, -280)
  if (day < start) return false
  if (p.status === 'ended') return p.ended_on ? day <= p.ended_on : false
  if (p.status === 'postpartum') return !p.postpartum_until || day <= p.postpartum_until
  return true
}

// ---------------------------------------------------------------- blood pressure

// 'severe' | 'high' | null for a reading taken while pregnant or postpartum.
// A range is reached when systolic OR diastolic reaches it, as the source
// writes it ("SBP ≥ 140 or DBP ≥ 90").
export function bpLevel(sys, dia, thresholds = readCache()?.thresholds || []) {
  const s = Number(sys), d = Number(dia)
  if (!Number.isFinite(s) && !Number.isFinite(d)) return null
  for (const level of ['severe', 'high']) {
    const t = thresholds.find((x) => x.level === level)
    if (!t) continue
    if ((Number.isFinite(s) && s >= t.systolic_at_least) || (Number.isFinite(d) && d >= t.diastolic_at_least)) return level
  }
  return null
}

export const threshold = (level) => (readCache()?.thresholds || []).find((t) => t.level === level) || null

// The flag for a saved vitals row, if the person was pregnant or postpartum
// when it was taken. Used by the timeline, the chart and the printout.
export function vitalsFlag(row) {
  const p = cachedPregnancy()
  if (!p || row.bp_systolic == null && row.bp_diastolic == null) return null
  if (!inWindow(p, row.taken_at || new Date())) return null
  return bpLevel(row.bp_systolic, row.bp_diastolic)
}

// ---------------------------------------------------------------- the alert bus

// Mounted once in App (SafetyAlert). 'severe' opens the full-screen blood
// pressure alert; 'signs' opens the CDC warning-signs list.
const listeners = new Set()
export const onSafety = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
export const openSafety = (detail) => listeners.forEach((fn) => fn(detail))

// Call before saving any reading that has a blood pressure. Opens the severe
// alert at once if needed (before, and whether or not, the save succeeds) and
// returns the level so the form can mark it.
export function checkReading({ bp_systolic, bp_diastolic, taken_at }) {
  const p = cachedPregnancy()
  if (!p || !inWindow(p, taken_at || new Date())) return null
  const level = bpLevel(bp_systolic, bp_diastolic)
  if (level === 'severe') openSafety({ kind: 'severe', reading: { bp_systolic, bp_diastolic } })
  return level
}

// A headache, a vision change or upper-belly pain logged during pregnancy or
// the postpartum year brings up the CDC warning signs (plan, workstream 9).
const SIGN_WORDS = /headache|migraine|vision|blur|seeing spots|flash(es)? of light|upper[- ]?(belly|abdomen|stomach)|epigastric|right side under (the )?ribs|keeping fluids down: no/i
export function checkSymptom({ symptom, notes, felt_at }) {
  const p = cachedPregnancy()
  if (!p || !inWindow(p, felt_at || new Date())) return false
  if (!SIGN_WORDS.test(`${symptom || ''} ${notes || ''}`)) return false
  openSafety({ kind: 'signs', because: symptom })
  return true
}

// ---------------------------------------------------------------- saving readings

// A blood pressure reading must not be lost because the phone is offline.
// If the save fails it waits on the phone and is sent the next time Daybook
// opens or the connection comes back.
export async function saveVitals(profileId, row) {
  const full = { ...row, profile_id: profileId, taken_at: row.taken_at || new Date().toISOString() }
  const { error } = await supabase.from('vitals').insert(full)
  if (!error) return { saved: true }
  if (navigator.onLine === false || /fetch|network/i.test(error.message || '')) {
    try {
      const box = JSON.parse(localStorage.getItem(OUTBOX) || '[]')
      box.push({ table: 'vitals', row: full })
      localStorage.setItem(OUTBOX, JSON.stringify(box))
      return { saved: false, queued: true }
    } catch { /* storage full or blocked */ }
  }
  return { saved: false, error }
}

export async function flushOutbox() {
  let box
  try { box = JSON.parse(localStorage.getItem(OUTBOX) || '[]') } catch { return 0 }
  if (!box.length) return 0
  const left = []
  for (const item of box) {
    const { error } = await supabase.from(item.table).insert(item.row)
    if (error) left.push(item)
  }
  try { left.length ? localStorage.setItem(OUTBOX, JSON.stringify(left)) : localStorage.removeItem(OUTBOX) } catch { /* ignore */ }
  return box.length - left.length
}

// ---------------------------------------------------------------- the tracker

export async function startPregnancy(profileId, { due_date, lmp_date, doctor_name, doctor_phone }) {
  const { data, error } = await supabase.from('pregnancies').insert({
    profile_id: profileId, due_date, lmp_date: lmp_date || null,
    doctor_name: doctor_name?.trim() || null, doctor_phone: doctor_phone?.trim() || null,
  }).select().single()
  if (error) throw error
  return data
}

export async function updatePregnancy(profileId, id, patch) {
  const { error } = await supabase.from('pregnancies').update(patch).eq('id', id).eq('profile_id', profileId)
  if (error) throw error
}

// The baby is born: the tracker becomes a postpartum tracker for 12 months.
export const babyBorn = (profileId, id, birth_date) =>
  updatePregnancy(profileId, id, { status: 'postpartum', birth_date, postpartum_until: addDays(birth_date, 365) })

// Ending quietly: no reason asked, nothing reminds. Keep or delete is the
// person's choice.
export const endTracker = (profileId, id) =>
  updatePregnancy(profileId, id, { status: 'ended', ended_on: localDate() })

export async function deleteForGood(id) {
  const { error } = await supabase.rpc('delete_pregnancy_record', { p_pregnancy_id: id })
  if (error) throw error
}

export async function addEvent(profileId, pregnancyId, ev) {
  const { error } = await supabase.from('pregnancy_events').insert({ ...ev, profile_id: profileId, pregnancy_id: pregnancyId })
  if (error) throw error
}

export async function setEvent(profileId, id, patch) {
  const { error } = await supabase.from('pregnancy_events').update(patch).eq('id', id).eq('profile_id', profileId)
  if (error) throw error
}

export async function loadEvents(profileId, pregnancyId) {
  const { data, error } = await supabase.from('pregnancy_events').select('*')
    .eq('profile_id', profileId).eq('pregnancy_id', pregnancyId).order('at', { ascending: false }).limit(300)
  if (error) throw error
  return data || []
}

export const fmtDuration = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)} min ${sec % 60} s` : `${sec} s`)
