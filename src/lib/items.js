// What a person sees, and why. The answer to "Male or female?" sets the
// starting point for the body-specific items below; Settings lets anyone turn
// any of them on or off (profiles.shown_items: key -> true/false), and that
// choice always wins. Hiding an item hides it; nothing logged is deleted.
// WG-PLAN-HEALTH-002, workstream 10.

export const BODY_ITEMS = [
  { key: 'cycle', label: 'Menstrual cycle, PMS, period pain', female: true, male: false },
  { key: 'menopause', label: 'Perimenopause and menopause', female: true, male: false },
  { key: 'pregnancy', label: 'Pregnancy and postpartum', female: true, male: false },
  { key: 'mens_health', label: 'Men’s health: prostate, urinary flow, erectile, testicular', female: false, male: true },
]

// Does this person see the item? Their own choice first, then the default for
// their answer. Anything not body-specific is shown to everyone.
export function shows(profile, key) {
  const own = profile?.shown_items?.[key]
  if (typeof own === 'boolean') return own
  const item = BODY_ITEMS.find((i) => i.key === key)
  if (!item || !profile?.sex) return true
  return item[profile.sex]
}

// Focus areas offered at sign-up and in Settings. An area tied to a body item
// only shows when that item does.
export const FOCUS = [
  { value: 'blood sugar' }, { value: 'deficit' }, { value: 'recovery' }, { value: 'blood pressure' },
  { value: 'sleep' }, { value: 'GERD' }, { value: 'perimenopause', item: 'menopause' }, { value: 'joints' },
]
export const focusFor = (profile) => FOCUS.filter((f) => !f.item || shows(profile, f.item)).map((f) => f.value)

export const COMMON_TRIGGERS = ['coffee', 'tomato', 'citrus', 'onion', 'garlic', 'chocolate', 'alcohol', 'spicy', 'dairy', 'fried']
