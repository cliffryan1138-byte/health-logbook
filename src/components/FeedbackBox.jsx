import { useState } from 'react'
import { supabase } from '../lib/supabase'

// The "Something missing or annoying?" link under the dashboard. Writes to the
// feedback table (status defaults to 'new').
//
// RECOVERY NOTE: rebuilt — the original was not recoverable. Copy matches the
// running app.

export default function FeedbackBox({ profile }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!message.trim()) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('feedback').insert({
      profile_id: profile.id,
      message: message.trim(),
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDone(true); setMessage('')
  }

  if (done) return <p className="note">Thanks — logged it.</p>

  if (!open) {
    return (
      <button className="fb" onClick={() => setOpen(true)}>
        Something missing or annoying? Suggest an improvement
      </button>
    )
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 420, margin: '10px auto 0', textAlign: 'left' }}>
      <label className="field">
        <span>What would make this better?</span>
        <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} autoFocus />
      </label>
      {err && <p className="err">{err}</p>}
      <div className="actions">
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
      </div>
    </form>
  )
}
