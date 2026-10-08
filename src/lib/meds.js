import { supabase } from './supabase'

// Medications (supabase/migrations/0006): the list a person takes, and each
// dose taken. Doses sit on the timeline with everything else; the list is
// printed at the top of the record for a doctor.
//
// Nothing here deletes. Stopping a medicine sets stopped_on, so "was on X
// from March to June" stays in the record.

export const isCurrent = (m) => !m.stopped_on || m.stopped_on > today()

export function today() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export function medLine(m) {
  return [m.dose, m.as_needed ? 'as needed' : m.schedule, m.reason && `for ${m.reason}`].filter(Boolean).join(' · ')
}

const medRow = (m) => ({
    name: m.name.trim(),
    dose: m.dose?.trim() || null,
    schedule: m.as_needed ? null : (m.schedule?.trim() || null),
    as_needed: Boolean(m.as_needed),
    reason: m.reason?.trim() || null,
    started_on: m.started_on || null,
    notes: m.notes?.trim() || null,
})

export async function addMed(profileId, m) {
  const { data, error } = await supabase.from('medications').insert({ profile_id: profileId, ...medRow(m) }).select().single()
  if (error) throw error
  return data
}

// Fix a medicine on the list (its name, dose, schedule…). The earlier version
// stays in the change history (0003 trigger), so a rename is on record.
export async function updateMed(profileId, id, m) {
  const { error } = await supabase.from('medications').update(medRow(m)).eq('id', id).eq('profile_id', profileId)
  if (error) throw error
}

export async function stopMed(profileId, id) {
  const { error } = await supabase.from('medications').update({ stopped_on: today() })
    .eq('id', id).eq('profile_id', profileId)
  if (error) throw error
}

export async function logDose(profileId, d) {
  const { error } = await supabase.from('med_doses').insert({
    profile_id: profileId,
    medication_id: d.medication_id || null,
    name: d.name.trim(),
    dose: d.dose?.trim() || null,
    notes: d.notes?.trim() || null,
    taken_at: (d.taken_at ? new Date(d.taken_at) : new Date()).toISOString(),
  })
  if (error) throw error
}

// The list entry a spoken or typed name refers to, if any.
export function matchMed(meds, name) {
  const n = String(name || '').trim().toLowerCase()
  if (!n) return null
  return meds.find((m) => m.name.toLowerCase() === n) ||
    meds.find((m) => n.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(n)) || null
}
