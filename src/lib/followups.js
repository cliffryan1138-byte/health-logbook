import { supabase } from './supabase'
import { localDate } from './pregnancy'

// Sparky's follow-up questions after a symptom is saved (WG-PLAN-HEALTH-002,
// workstream 2). The questions are the approved bank, v0.2 (Claude Docs
// "Sparky Follow-up Question Bank"; decisions A–E by Cliff, 2026-10-08), word
// for word. Gaps only: a question is asked only when the person's own log for
// the last 72 hours has nothing on it. Up to three, in the bank's order. No AI
// call, nothing made up, never a cause.
//
// Changing a question's words means a new bank version, approved first.

export const BANK = 'v0.2'
const HOUR = 3600000
const MAX = 3

// Hours a scheduled medicine can go without a logged dose before question 1.
export function doseWindow(schedule) {
  const s = String(schedule || '').toLowerCase()
  if (/three|3\s*(x|times)|tid\b|every\s*8/.test(s)) return 10
  if (/twice|two times|2\s*(x|times)|bid\b|every\s*12/.test(s)) return 14
  if (/once|daily|every\s*day|a day|bedtime|night|morning|evening|qd\b|every\s*24/.test(s)) return 26
  return 30
}

export const Q = {
  dose: (name, hours) => `Your last logged dose of ${name} was ${hours} hours ago. Did you take one since?`,
  sleep: 'No sleep logged for last night. About how many hours did you sleep?',
  meal: 'No meal logged in the 6 hours before this started. When did you last eat?',
  water: 'No water logged today. About how many glasses so far?',
  caffeine: 'No caffeine logged today. About how many cups of coffee, tea or soda so far?',
}
export const DOSE_ANSWERS = ['Yes', 'No', 'Not sure']
export const MEAL_ANSWERS = ['Less than 2 hours before', '2 to 4 hours', '4 to 6 hours', 'More than 6 hours', 'Not sure']

// The questions for a just-saved symptom, from the person's log. `now` is
// injectable for tests.
export async function questionsFor(profileId, symptom, now = new Date()) {
  const felt = new Date(symptom.felt_at)
  // Not asked for something that started more than 24 hours before it was entered.
  if (now - felt > 24 * HOUR) return []
  const today = localDate(now)
  const since7d = new Date(now - 7 * 24 * HOUR).toISOString()
  const [{ data: meds }, { data: doses }, { data: meals }, { data: checkins }, { data: vitals }] = await Promise.all([
    supabase.from('medications').select('id, name, schedule, as_needed, stopped_on').eq('profile_id', profileId),
    supabase.from('med_doses').select('medication_id, name, taken_at').eq('profile_id', profileId).gte('taken_at', since7d),
    supabase.from('meals').select('eaten_at').eq('profile_id', profileId)
      .gte('eaten_at', new Date(felt - 6 * HOUR).toISOString()).lte('eaten_at', felt.toISOString()),
    supabase.from('daily_checkins').select('day, sleep_hr, water_glasses, caffeine_cups').eq('profile_id', profileId).eq('day', today),
    supabase.from('vitals').select('sleep_hr, taken_at').eq('profile_id', profileId)
      .gte('taken_at', new Date(now - 24 * HOUR).toISOString()),
  ])
  const out = []

  // 1. Missed dose: scheduled, taken at least once in 7 days, last dose overdue. At most two.
  const current = (meds || []).filter((m) => !m.as_needed && (!m.stopped_on || m.stopped_on > today))
  for (const m of current) {
    const mine = (doses || []).filter((d) => d.medication_id === m.id || (!d.medication_id && d.name?.toLowerCase() === m.name.toLowerCase()))
    if (!mine.length) continue
    const last = Math.max(...mine.map((d) => Date.parse(d.taken_at)))
    const hours = Math.floor((now - last) / HOUR)
    if (hours > doseWindow(m.schedule)) {
      out.push({ id: 'dose_since', medication_id: m.id, medication: m.name, question: Q.dose(m.name, hours), kind: 'choice', choices: DOSE_ANSWERS })
      if (out.length === 2) break
    }
  }

  const ck = (checkins || [])[0] || {}
  // 2. Sleep: no hours in today's check-in, and none on a vitals entry in the last day.
  if (ck.sleep_hr == null && !(vitals || []).some((v) => v.sleep_hr != null)) {
    out.push({ id: 'sleep_hr', question: Q.sleep, kind: 'number', min: 0, max: 24, step: 0.5 })
  }
  // 3. Food: no meal in the 6 hours before it started.
  if (!(meals || []).length) out.push({ id: 'last_ate', question: Q.meal, kind: 'choice', choices: MEAL_ANSWERS })
  // 4, 5. Water and caffeine: nothing in today's check-in.
  if (ck.water_glasses == null) out.push({ id: 'water_glasses', question: Q.water, kind: 'number', min: 0, max: 40, step: 1 })
  if (ck.caffeine_cups == null) out.push({ id: 'caffeine_cups', question: Q.caffeine, kind: 'number', min: 0, max: 40, step: 1 })

  return out.slice(0, MAX)
}

// Save what was asked and what was answered (or skipped), once.
export async function saveAnswers(profileId, symptomId, items) {
  const rows = items.map(({ id, question, medication_id, answer }) => ({
    id, question, ...(medication_id ? { medication_id } : {}),
    answer: answer === '' || answer == null ? null : answer,
    skipped: answer === '' || answer == null,
  }))
  const { error } = await supabase.from('symptom_followups').insert({ profile_id: profileId, symptom_id: symptomId, items: rows, bank: BANK, asked_at: new Date().toISOString() })
  if (error) throw error
}

// One line per question for the Logbook, the printout and the spreadsheet.
export const followupText = (items) => (items || [])
  .map((i) => `${i.question} ${i.skipped ? '(skipped)' : `${i.answer}`}`).join(' | ')
