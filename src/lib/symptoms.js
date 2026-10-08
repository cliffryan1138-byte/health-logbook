import { shows } from './items'

// The symptom library: anything a man or a woman might have, grouped by body
// area (WG-PLAN-HEALTH-002, workstream 1). The person picks one, or types
// anything that isn't here and it is saved as written. A group tied to a body
// item (items.js) only shows when that item does; Settings can turn any of
// them on for anyone.
//
// Pregnancy and postpartum symptoms (morning sickness, practice contractions…)
// arrive with the pregnancy tracker in Phase 2. Until then they can be typed.
export const GROUPS = [
  { key: 'general', label: 'General', symptoms: ['Fatigue', 'Fever', 'Chills', 'Night sweats', 'Weight change', 'Loss of appetite'] },
  { key: 'head_nerves', label: 'Head and nerves', symptoms: ['Headache', 'Migraine', 'Dizziness', 'Numbness', 'Tingling', 'Memory or focus trouble', 'Ringing in the ears', 'Fainting'] },
  { key: 'eyes_ent', label: 'Eyes, ears, nose, throat', symptoms: ['Vision changes', 'Eye pain', 'Ear pain', 'Congestion', 'Sore throat', 'Nosebleed'] },
  { key: 'heart_lungs', label: 'Heart and lungs', symptoms: ['Chest pain', 'Racing heart', 'Shortness of breath', 'Cough', 'Wheezing'] },
  { key: 'stomach_gut', label: 'Stomach and gut', symptoms: ['Nausea', 'Vomiting', 'Heartburn', 'Bloating', 'Stomach pain', 'Constipation', 'Diarrhea'] },
  { key: 'muscles_joints', label: 'Muscles and joints', symptoms: ['Back pain', 'Neck pain', 'Joint pain', 'Stiffness', 'Swelling', 'Muscle cramps'] },
  { key: 'skin', label: 'Skin', symptoms: ['Rash', 'Itching', 'Hives', 'Bruising', 'Wound or sore'] },
  { key: 'urinary', label: 'Urinary', symptoms: ['Peeing often', 'Urgent need to pee', 'Burning when peeing', 'Waking at night to pee'] },
  { key: 'sleep_mind', label: 'Sleep and mind', symptoms: ['Poor sleep', 'Nightmares', 'Anxiety', 'Low mood', 'Irritability'] },
  { key: 'female_health', label: 'Female health', item: 'cycle', symptoms: ['Period pain', 'PMS', 'Heavy bleeding', 'Irregular bleeding', 'Discharge', 'Pelvic pain', 'Breast pain'] },
  { key: 'menopause', label: 'Perimenopause and menopause', item: 'menopause', symptoms: ['Hot flash', 'Night sweats', 'Vaginal dryness', 'Cycle changes'] },
  { key: 'male_health', label: 'Men’s health', item: 'mens_health', symptoms: ['Weak urine flow', 'Prostate discomfort', 'Erectile difficulty', 'Testicular pain or lump', 'Low libido'] },
]

// The quick picks at the top of the Symptom form, before any searching.
const COMMON = ['Headache', 'Heartburn', 'Bloating', 'Fatigue', 'Nausea', 'Joint pain', 'Poor sleep', 'Hot flash', 'Period pain']

export const groupsFor = (profile) => GROUPS.filter((g) => !g.item || shows(profile, g.item))

// Common picks this person can see, each with the group it belongs to.
export function commonFor(profile) {
  const groups = groupsFor(profile)
  return COMMON.map((name) => ({ name, group: groups.find((g) => g.symptoms.includes(name))?.key }))
    .filter((s) => s.group)
}

// Everything this person can see whose name contains the search words.
export function search(profile, text) {
  const q = text.trim().toLowerCase()
  if (!q) return []
  const out = []
  for (const g of groupsFor(profile)) {
    for (const name of g.symptoms) {
      if (name.toLowerCase().includes(q) && !out.some((s) => s.name === name)) out.push({ name, group: g.key })
    }
  }
  return out
}
