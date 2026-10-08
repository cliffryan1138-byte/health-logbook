import { useState } from 'react'
import { supabase } from '../lib/supabase'

// A meditation (or prayer) session: how long, what kind, mood before and after.
const KINDS = [['breathing', 'Breathing'], ['guided', 'Guided'], ['body_scan', 'Body scan'], ['prayer', 'Prayer'], ['other', 'Other']]

export default function Meditation({ profile, onClose, onSaved }) {
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const pick = (k, v) => setForm((f) => ({ ...f, [k]: f[k] === v ? null : v }))

  async function save(e) {
    e.preventDefault()
    const minutes = Math.round(Number(form.minutes))
    if (!minutes || minutes < 1 || minutes > 600) { setErr('How many minutes? (1 to 600)'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.from('meditations').insert({
      profile_id: profile.id, minutes, kind: form.kind || null,
      mood_before_1_5: form.mood_before_1_5 || null, mood_after_1_5: form.mood_after_1_5 || null,
      notes: form.notes?.trim() || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved?.()
    onClose()
  }

  const mood = (k, label) => (
    <div className="field">
      <span>{label}</span>
      <div className="sev-pick plain" role="group" aria-label={`${label}, 1 to 5`}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button type="button" key={v} aria-pressed={form[k] === v} onClick={() => pick(k, v)}>{v}</button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={save} aria-label="Log a meditation">
        <h3>Log a meditation</h3>
        <label className="field"><span>Minutes</span>
          <input inputMode="numeric" value={form.minutes ?? ''} onChange={(e) => setForm((f) => ({ ...f, minutes: e.target.value }))} autoFocus /></label>
        <div className="field">
          <span>Kind</span>
          <div className="chips">
            {KINDS.map(([k, l]) => <button type="button" key={k} className="chip" aria-pressed={form.kind === k} onClick={() => pick('kind', k)}>{l}</button>)}
          </div>
        </div>
        {mood('mood_before_1_5', 'Mood before (1 low, 5 great)')}
        {mood('mood_after_1_5', 'Mood after')}
        <label className="field"><span>Notes</span>
          <textarea rows={2} value={form.notes ?? ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></label>
        {err && <p className="err">{err}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
