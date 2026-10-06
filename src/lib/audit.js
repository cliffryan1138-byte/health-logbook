import { supabase } from './supabase'

// The record's paper trail (supabase/migrations/0003, 0004).
//
// Exports, prints and shares are logged here; sign-ins are logged by the
// database itself. The database stamps the time and refuses edits or deletes,
// so a logged event can't be backdated or removed. Only counts, purposes and
// fingerprints go in `detail` — never entry content or search terms.

export const EVENT_LABELS = {
  sign_in: 'Signed in',
  export_print: 'Printed / saved a PDF',
  export_csv: 'Downloaded a spreadsheet',
  export_share: 'Shared a spreadsheet',
}

// SHA-256 of the exact text exported, as lowercase hex. Anyone holding the
// file can check it (`shasum -a 256 file.csv` on a Mac,
// `certutil -hashfile file.csv SHA256` on Windows).
export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Fire and forget: a failed log line must never stop someone saving their record.
export function logEvent(profileId, event, detail = {}) {
  supabase.from('audit_events').insert({ profile_id: profileId, event, detail })
    .then(({ error }) => { if (error) console.warn('audit log:', error.message) })
}

export async function loadActivity(profileId, limit = 25) {
  const { data, error } = await supabase.from('audit_events').select('event, detail, at')
    .eq('profile_id', profileId).order('at', { ascending: false }).limit(limit)
  if (error) throw error
  return data || []
}

export async function loadHistory(profileId) {
  const { data, error } = await supabase.from('entry_history').select('table_name, row_id, op, old_row, changed_at')
    .eq('profile_id', profileId).order('changed_at', { ascending: true })
  if (error) throw error
  return data || []
}
