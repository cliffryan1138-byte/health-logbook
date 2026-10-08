import { supabase } from './supabase'
import { loadLabel } from './refLibrary'
import { isCurrent } from './meds'
import { NIAAA_ROWS } from './niaaa'
import { daysAgo } from './stats'

// "My medicines report" (WG-PLAN-HEALTH-002, workstream 4). Built from the
// person's medicine list, their own log, and the reference library — and
// nothing else. Every line is either a quote (FDA label, NIAAA) with its
// source, or a count from the person's own entries. Nothing is graded,
// summarised or interpreted; a symptom on a label beside a symptom in the log
// is two facts side by side, never a cause.

const SALTS = /\b(hydrochloride|hcl|sodium|potassium|calcium|magnesium|succinate|maleate|besylate|mesylate|tartrate|citrate|sulfate|phosphate|acetate|fumarate|bromide|chloride|hyclate|monohydrate|dihydrate|anhydrous|extended|release|er|xr|sr|dr|odt)\b/gi

// The words a label or list might use for a medicine: its ingredient(s) and
// brand names, lowercased, without salt words.
export function namesOf(item) {
  const out = new Set()
  const add = (s) => {
    const base = String(s || '').toLowerCase().replace(/[®™]/g, '').replace(SALTS, ' ').replace(/\s+/g, ' ').trim()
    if (base.length >= 4) out.add(base)
  }
  const l = item.label
  for (const g of l?.generic_names || []) g.split(/,| and |\//).forEach(add)
  for (const b of l?.brand_names || []) add(b)
  if (item.ref?.tty === 'IN' || item.ref?.tty === 'BN') add(item.ref.rx_name)
  add(item.med.name)
  return [...out]
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordRe = (w) => new RegExp(`\\b${esc(w)}(s|es)?\\b`, 'i')

// A section's text as sentences (labels run sentences together; OTC "Drug
// Facts" use bullets and semicolons).
export function sentences(text) {
  return String(text || '')
    .split(/(?<=[.!?;])\s+(?=[A-Z•(])|\s+•\s+|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 3)
}

// A long run of label text cut to the words around the match, at word
// boundaries, with "…" where text was left out. Still the label's own words.
const MAX_QUOTE = 320
function around(text, re) {
  if (text.length <= MAX_QUOTE) return text
  const m = re.exec(text)
  const at = m ? m.index : 0
  let a = Math.max(0, at - 140), b = Math.min(text.length, at + 180)
  if (a > 0) a = text.indexOf(' ', a) + 1
  if (b < text.length) b = text.lastIndexOf(' ', b)
  return `${a > 0 ? '…' : ''}${text.slice(a, b).trim()}${b < text.length ? '…' : ''}`
}

// Sentences from the given label sections that mention any of the words.
export function quotesAbout(label, sections, words, max = 4) {
  if (!label) return []
  const res = words.map(wordRe)
  const seen = new Set(), out = []
  for (const k of sections) {
    for (const block of label.sections?.[k] || []) {
      for (const s of sentences(block)) {
        const hit = res.find((r) => r.test(s))
        if (!hit || seen.has(s)) continue
        seen.add(s); out.push({ section: k, text: around(s, hit) })
        if (out.length >= max) return out
      }
    }
  }
  return out
}

const ALL_SECTIONS = ['boxed_warning', 'warnings_and_cautions', 'warnings', 'contraindications', 'do_not_use', 'ask_doctor',
  'ask_doctor_or_pharmacist', 'when_using', 'stop_use', 'drug_interactions', 'information_for_patients', 'pregnancy_or_breast_feeding']
const SIDE_EFFECT_SECTIONS = ['adverse_reactions', 'warnings_and_cautions', 'warnings', 'boxed_warning', 'stop_use', 'when_using']
const ALCOHOL = ['alcohol', 'alcoholic', 'ethanol', 'drinks', 'drinking']
const CAFFEINE_FOOD = ['caffeine', 'coffee', 'grapefruit', 'food', 'meal', 'meals', 'empty stomach']

// NIAAA rows whose generic name is one of this medicine's ingredients. Rows
// that differ only by brand (Advil®, Motrin®: both ibuprofen) become one, with
// the brands listed together.
export function niaaaFor(item) {
  const names = namesOf(item)
  const hits = NIAAA_ROWS.filter(([, , generic]) => generic && generic.toLowerCase().split(/\s*(?:\/|,|\+)\s*/)
    .some((g) => names.some((n) => n === g.trim() || n.split(' ')[0] === g.trim())))
  const merged = new Map()
  for (const [cond, brand, generic, reactions] of hits) {
    const k = `${cond}|${generic}|${reactions}`
    if (merged.has(k)) merged.get(k)[1].push(brand)
    else merged.set(k, [cond, [brand], generic, reactions])
  }
  return [...merged.values()].map(([c, b, g, r]) => [c, b.join(', '), g, r])
}

const dayKey = (iso) => String(iso).slice(0, 10)

// Everything the report needs, for the current medicines.
export async function buildReport(profile, meds, { days = 30, pregnant = false } = {}) {
  const current = meds.filter(isCurrent)
  const items = []
  for (const med of current) {
    const res = await loadLabel(med)
    items.push({ med, status: res.status, ref: res.ref || null, label: res.label || null })
  }

  // The person's own entries: symptoms since the earliest start date, and
  // check-ins (alcohol, caffeine) in the report period.
  const starts = current.map((m) => m.started_on || String(m.created_at || '').slice(0, 10)).filter(Boolean).sort()
  const earliest = starts[0] || daysAgo(days).slice(0, 10)
  const since = daysAgo(days)
  const [{ data: symptoms }, { data: checkins }] = await Promise.all([
    supabase.from('symptoms').select('symptom, felt_at').eq('profile_id', profile.id).gte('felt_at', `${earliest}T00:00:00`).order('felt_at'),
    supabase.from('daily_checkins').select('day, alcohol_drinks, caffeine_cups').eq('profile_id', profile.id).gte('day', since.slice(0, 10)),
  ])
  const alcoholDays = (checkins || []).filter((c) => Number(c.alcohol_drinks) > 0)
  const caffeineDays = (checkins || []).filter((c) => Number(c.caffeine_cups) > 0)
  const logged = {
    days,
    checkinDays: new Set((checkins || []).map((c) => c.day)).size,
    alcoholDays: alcoholDays.length,
    drinks: alcoholDays.reduce((a, c) => a + Number(c.alcohol_drinks), 0),
    caffeineDays: caffeineDays.length,
  }

  for (const it of items) {
    const l = it.label
    it.names = namesOf(it)
    it.niaaa = niaaaFor(it)
    it.alcohol = quotesAbout(l, ALL_SECTIONS, ALCOHOL)
    it.caffeineFood = quotesAbout(l, ALL_SECTIONS, CAFFEINE_FOOD)
    // Logged symptoms that the label also names, counted since this medicine started.
    const start = it.med.started_on || dayKey(it.med.created_at || '')
    const mine = (symptoms || []).filter((s) => !start || dayKey(s.felt_at) >= start)
    const byName = new Map()
    for (const s of mine) {
      const n = String(s.symptom || '').trim()
      if (n) byName.set(n, (byName.get(n) || 0) + 1)
    }
    it.symptoms = []
    for (const [name, count] of byName) {
      const q = quotesAbout(l, SIDE_EFFECT_SECTIONS, [name.toLowerCase()], 1)
      if (q.length) it.symptoms.push({ name, count, since: start, quote: q[0] })
    }
    it.pregnancy = pregnant ? ['pregnancy', 'teratogenic_effects', 'lactation', 'nursing_mothers', 'pregnancy_or_breast_feeding'].filter((k) => l?.sections?.[k]?.length) : []
  }

  // Between medicines: one label's interaction text naming another medicine on the list.
  const between = []
  for (const a of items) {
    if (!a.label) continue
    for (const b of items) {
      if (a === b) continue
      const q = quotesAbout(a.label, ['drug_interactions', 'warnings_and_cautions', 'warnings', 'do_not_use', 'ask_doctor_or_pharmacist', 'contraindications', 'boxed_warning'], b.names, 3)
      if (q.length) between.push({ a, b, quotes: q })
    }
  }

  return { items, between, logged, built: new Date().toISOString() }
}
