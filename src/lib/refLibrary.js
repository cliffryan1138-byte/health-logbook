import { supabase } from './supabase'

// The reference library's medicine part (migration 0017, function ref-sync).
// A medicine's FDA label: the person's own match in medication_refs, then the
// public label rows. If the medicine hasn't been matched yet (or was renamed),
// ask ref-sync to do it first.

// The label sections shown, in order, with the FDA's own section names.
export const LABEL_SECTIONS = [
  ['boxed_warning', 'Boxed Warning'],
  ['warnings_and_cautions', 'Warnings and Precautions'],
  ['warnings', 'Warnings'],
  ['contraindications', 'Contraindications'],
  ['do_not_use', 'Do not use'],
  ['ask_doctor', 'Ask a doctor before use if you have'],
  ['ask_doctor_or_pharmacist', 'Ask a doctor or pharmacist before use if you are'],
  ['when_using', 'When using this product'],
  ['stop_use', 'Stop use and ask a doctor if'],
  ['adverse_reactions', 'Adverse Reactions (side effects)'],
  ['drug_interactions', 'Drug Interactions'],
  ['pregnancy', 'Pregnancy'],
  ['teratogenic_effects', 'Pregnancy: Teratogenic Effects'],
  ['lactation', 'Lactation'],
  ['nursing_mothers', 'Nursing Mothers'],
  ['pregnancy_or_breast_feeding', 'If pregnant or breast-feeding'],
  ['indications_and_usage', 'Indications and Usage'],
  ['purpose', 'Purpose'],
  ['information_for_patients', 'Patient Counseling Information'],
]

export const OPENFDA_DISCLAIMER = 'Do not rely on openFDA to make decisions regarding medical care. While we make every effort to ensure that data is accurate, you should assume all results are unvalidated.'
export const dailyMedUrl = (setId) => `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(setId)}`

// Ask the server to match medicines (all current ones, or the ids given).
// Never throws: the label sheet says when the lookup is unavailable.
export async function syncMeds(ids) {
  try {
    const { data, error } = await supabase.functions.invoke('ref-sync', { body: ids?.length ? { medication_ids: ids } : {} })
    if (error) return { ok: false }
    return data || { ok: false }
  } catch { return { ok: false } }
}

// { status: 'unavailable' | 'not_matched' | 'no_label' | 'label', ref, label, rx }
export async function loadLabel(med) {
  let ref = await readRef(med.id)
  if (!ref || ref.matched_name !== med.name) {
    const res = await syncMeds([med.id])
    if (!res.ok) return { status: 'unavailable' }
    ref = await readRef(med.id)
    if (!ref) return { status: 'unavailable' }
  }
  if (ref.status !== 'matched') return { status: 'not_matched', ref }
  const { data: rx } = await supabase.from('ref_rx_labels').select('*').eq('rxcui', ref.rxcui).maybeSingle()
  if (!rx) return { status: 'unavailable', ref }
  if (rx.status !== 'found' || !rx.set_id) return { status: 'no_label', ref, rx }
  const { data: label, error } = await supabase.from('ref_drug_labels').select('*').eq('set_id', rx.set_id).maybeSingle()
  if (error || !label) return { status: 'unavailable', ref, rx }
  return { status: 'label', ref, rx, label }
}

async function readRef(id) {
  const { data } = await supabase.from('medication_refs').select('*').eq('medication_id', id).maybeSingle()
  return data
}
