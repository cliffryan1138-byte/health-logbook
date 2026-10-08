import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { focusFor, COMMON_TRIGGERS } from '../lib/items'
import SexChoice from '../components/SexChoice'
import VeteranFields from '../components/VeteranFields'

// Shown once, when a signed-in user has no profiles row yet. Writes the row the
// dashboard and the health-tracker skill both read.
//
// RECOVERY NOTE: this file was not recoverable from the deployment. It is
// rebuilt against the live profiles schema (display_name, focus_areas[],
// watch_list[], targets jsonb, color), plus sex (migration 0012) and veteran
// status (0013).

export default function Onboarding() {
  const { session, refreshProfile } = useAuth()
  const [sex, setSex] = useState(null)
  const [vet, setVet] = useState({ veteran: null, service_branches: [], va_rating: null })
  const [name, setName] = useState('')
  const [focus, setFocus] = useState([])
  const [watch, setWatch] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const toggle = (list, setList) => (v) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  // Only offer focus areas that fit the answer above.
  const offered = focusFor({ sex })

  async function submit(e) {
    e.preventDefault()
    if (!sex) { setErr('Choose male or female first.'); return }
    if (vet.veteran == null) { setErr('Tell us whether you’re a veteran.'); return }
    if (!name.trim()) { setErr('What should the logbook call you?'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.from('profiles').insert({
      id: session.user.id,
      display_name: name.trim(),
      sex,
      ...vet,
      focus_areas: focus.filter((f) => offered.includes(f)),
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
        <img className="mark" src="/sparky.png" alt="" width="72" height="72" />
        <div>
          <h1>Set up your logbook</h1>
          <p>A few questions. You can change any of them later in Settings.</p>
        </div>

        <SexChoice value={sex} onChange={(v) => { setSex(v); setErr('') }} />
        <VeteranFields value={vet} onChange={(v) => { setVet(v); setErr('') }} />

        <div className="field">
          <label htmlFor="name">Your name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field">
          <label>What are you watching?</label>
          <div className="chips">
            {offered.map((f) => (
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
