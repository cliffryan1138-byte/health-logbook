import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fail loudly at startup instead of shipping a blank app —
// remote builds don't read local .env (learned the hard way in July).
if (!url || !key) {
  document.body.innerHTML =
    '<div style="font-family:system-ui;padding:40px;max-width:520px;margin:0 auto">' +
    '<h2>Logbook is not configured</h2>' +
    '<p>VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in the build environment.</p></div>'
  throw new Error('Missing Supabase env vars')
}

export const supabase = createClient(url, key)
