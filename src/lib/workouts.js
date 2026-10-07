import { supabase } from './supabase'

// Training plans and the sets actually done (see supabase/migrations/0002).
//
// A finished workout is one `exercise` row, so everything that already reads
// exercise (Logbook, calendar, trends, exports) keeps working; its sets hang
// off it in `workout_sets`.

export const WEEKDAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_MS = 86400000

// Today's weekday, 1 = Monday .. 7 = Sunday.
export const isoWeekday = (d = new Date()) => ((d.getDay() + 6) % 7) + 1

export async function loadActivePlan(profileId) {
  const { data: plan, error } = await supabase.from('workout_plans').select('*')
    .eq('profile_id', profileId).eq('active', true).maybeSingle()
  if (error) throw error
  if (!plan) return null
  const [{ data: days }, { data: exercises }] = await Promise.all([
    supabase.from('plan_days').select('*').eq('plan_id', plan.id).order('position'),
    supabase.from('plan_exercises').select('*').eq('plan_id', plan.id).order('position'),
  ])
  return {
    ...plan,
    days: (days || []).map((d) => ({ ...d, exercises: (exercises || []).filter((x) => x.day_id === d.id) })),
  }
}

// Which week of the plan today falls in (1-based), or null before it starts.
export function weekOf(plan, today = new Date()) {
  if (!plan?.started_on) return null
  const start = new Date(`${plan.started_on}T00:00:00`)
  const diff = Math.floor((today - start) / DAY_MS)
  if (diff < 0) return null
  return Math.floor(diff / 7) + 1
}

// Today's session: the day tied to today's weekday; for plans without weekdays,
// the day after the last one done. Returns { day, rest } — rest is true when the
// plan uses weekdays and nothing is scheduled today.
export function todaysDay(plan, lastDoneDayId) {
  if (!plan?.days?.length) return { day: null, rest: false }
  const usesWeekdays = plan.days.some((d) => d.weekday)
  if (usesWeekdays) {
    const day = plan.days.find((d) => d.weekday === isoWeekday())
    return day ? { day, rest: false } : { day: null, rest: true }
  }
  const i = plan.days.findIndex((d) => d.id === lastDoneDayId)
  return { day: plan.days[(i + 1) % plan.days.length], rest: false }
}

export async function lastDoneDayId(profileId, plan) {
  if (!plan?.days?.length) return null
  const { data } = await supabase.from('exercise').select('plan_day_id, done_at')
    .eq('profile_id', profileId).in('plan_day_id', plan.days.map((d) => d.id))
    .order('done_at', { ascending: false }).limit(1)
  return data?.[0]?.plan_day_id ?? null
}

// The last set of the most recent session for each movement (the band you
// finished on, not the one you started with) — prefills "load" and shows
// "last time" so progression is visible while training.
export async function lastSets(profileId, movements) {
  if (!movements.length) return {}
  const { data } = await supabase.from('workout_sets').select('movement, set_no, reps, load, weight_lb, rpe, created_at')
    .eq('profile_id', profileId).in('movement', movements)
    .order('created_at', { ascending: false }).order('set_no', { ascending: false }).limit(400)
  const out = {}
  for (const s of data || []) if (!out[s.movement]) out[s.movement] = s
  return out
}

// Save a reviewed draft as the active plan (any previous active plan is
// switched off first, since only one can be active).
export async function savePlan(profileId, draft, source = 'manual') {
  const off = await supabase.from('workout_plans').update({ active: false })
    .eq('profile_id', profileId).eq('active', true)
  if (off.error) throw off.error
  const { data: plan, error } = await supabase.from('workout_plans').insert({
    profile_id: profileId,
    name: draft.name.trim() || 'My plan',
    description: draft.description?.trim() || null,
    weeks: draft.weeks ? Number(draft.weeks) : null,
    started_on: draft.started_on || null,
    week_notes: (draft.week_notes || []).filter((w) => w.text?.trim()),
    active: true,
    source,
  }).select().single()
  if (error) throw error
  for (const [i, d] of draft.days.entries()) {
    const { data: day, error: e1 } = await supabase.from('plan_days').insert({
      plan_id: plan.id, profile_id: profileId, position: i + 1,
      weekday: d.weekday ? Number(d.weekday) : null,
      title: d.title.trim() || `Day ${i + 1}`, focus: d.focus?.trim() || null, notes: d.notes?.trim() || null,
    }).select().single()
    if (e1) throw e1
    const rows = d.exercises.filter((x) => x.name.trim()).map((x, j) => ({
      day_id: day.id, plan_id: plan.id, profile_id: profileId, position: j + 1,
      name: x.name.trim(), sets: x.sets ? Number(x.sets) : null, reps: x.reps?.trim() || null,
      rest_sec: x.rest_sec === '' || x.rest_sec == null ? null : Number(x.rest_sec), cues: x.cues?.trim() || null,
    }))
    if (rows.length) {
      const { error: e2 } = await supabase.from('plan_exercises').insert(rows)
      if (e2) throw e2
    }
  }
  return plan
}

export async function stopPlan(profileId, planId) {
  const { error } = await supabase.from('workout_plans').update({ active: false })
    .eq('profile_id', profileId).eq('id', planId)
  if (error) throw error
}

// One finished session -> one exercise row + its sets.
export async function finishWorkout(profileId, { day, planName, week, startedAt, minutes, notes, sets }) {
  const done = sets.filter((s) => s.done)
  const { data: ex, error } = await supabase.from('exercise').insert({
    profile_id: profileId,
    activity: day.title,
    duration_min: minutes ? Number(minutes) : null,
    intensity: null,
    notes: [
      `${planName}${week ? `, week ${week}` : ''}. ${done.length} sets.`,
      notes?.trim(),
    ].filter(Boolean).join(' '),
    done_at: new Date(startedAt).toISOString(),
    plan_day_id: day.id,
  }).select().single()
  if (error) throw error
  if (done.length) {
    const { error: e2 } = await supabase.from('workout_sets').insert(done.map((s) => ({
      profile_id: profileId, exercise_id: ex.id, plan_exercise_id: s.plan_exercise_id,
      movement: s.movement, set_no: s.set_no,
      reps: s.reps === '' || s.reps == null ? null : Number(s.reps),
      load: s.load?.trim() || null,
      weight_lb: weightOf(s),
      rpe: s.rpe === '' || s.rpe == null ? null : Number(s.rpe),
    })))
    if (e2) throw e2
  }
  return ex
}

// A weight typed into the band/weight box ("20 lb", "12.5lbs") is also kept as
// a number, for progress charts; band colours stay text only.
function weightOf(s) {
  if (s.weight_lb !== '' && s.weight_lb != null && !Number.isNaN(Number(s.weight_lb))) return Number(s.weight_lb)
  const m = String(s.load || '').match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds?)\b/i)
  return m ? Number(m[1]) : null
}

// The upper number in a target like "12–15" / "12-15" / "10 slow", used as the
// reps placeholder. Null for time or round targets.
export function targetReps(reps) {
  const nums = String(reps || '').match(/\d+/g)
  if (!nums || /s\b|sec|min|round/i.test(reps)) return null
  return Number(nums[nums.length - 1])
}
