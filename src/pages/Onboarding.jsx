import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Icon from '../lib/icons'

// Shown once, when a signed-in user has no profiles row yet. Writes the row the
// dashboard and the health-tracker skill both read.
//
// RECOVERY NOTE: this file was not recoverable from the deployment. It is
// rebuilt against the live profiles schema (display_name, focus_areas[],
// watch_list[], targets jsonb, color).

const FOCUS = ['blood sugar', 'deficit', 'recovery', 'blood pressure', 'sleep', 'GERD', 'perimenopause', 'joints']
const COMMON_TRIGGERS = ['coffee', 'tomato', 'citrus', 'onion', 'garlic', 'chocolate', 'alcohol', 'spicy', 'dairy', 'fried']

export default function Onboarding() {
  const { session, refreshProfile } = useAuth()
  const [name, setName] = useState('')
  const [focus, setFocus] = useState([])
  const [watch, setWatch] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const toggle = (list, setList) => (v) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) { setErr('What should the logbook call you?'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.from('profiles').insert({
      id: session.user.id,
      display_name: name.trim(),
      focus_areas: focus,
      watch_list: watch,
      targets: {},
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    refreshProfile()
  }

  return (
    <div className="authpage">
      <form className="authcard" onSubmit={submit}>
        <div className="glyph"><Icon name="pen" /></div>
        <div>
          <h1>Set up your logbook</h1>
          <p>Two questions. You can change both later.</p>
        </div>

        <div className="field">
          <label htmlFor="name">Your name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div className="field">
          <label>What are you watching?</label>
          <div className="chips">
            {FOCUS.map((f) => (
              <button type="button" key={f} className="chip" aria-pressed={focus.includes(f)}
                onClick={() => toggle(focus, setFocus)(f)}>{f}</button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Foods that tend to set you off</label>
          <div className="chips">
            {COMMON_TRIGGERS.map((t) => (
              <button type="button" key={t} className="chip" aria-pressed={watch.includes(t)}
                onClick={() => toggle(watch, setWatch)(t)}>{t}</button>
            ))}
          </div>
        </div>

        {err && <p className="err">{err}</p>}
        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Start logging'}</button>
        </div>
      </form>
    </div>
  )
}
