import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import SexChoice from '../components/SexChoice'
import VeteranFields from '../components/VeteranFields'

// Sign-up questions added after people had already signed up, asked once:
// male or female (migration 0012) and veteran status (0013). Only the ones
// still unanswered are shown. Nothing they logged changes.
export default function AskOnce() {
  const { profile, refreshProfile, signOut } = useAuth()
  const needSex = !profile.sex
  const needVet = profile.veteran == null
  const [sex, setSex] = useState(profile.sex)
  const [vet, setVet] = useState({ veteran: profile.veteran, service_branches: profile.service_branches || [], va_rating: profile.va_rating })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (needSex && !sex) { setErr('Choose male or female.'); return }
    if (needVet && vet.veteran == null) { setErr('Tell us whether you’re a veteran.'); return }
    setBusy(true); setErr('')
    const patch = {}
    if (needSex) patch.sex = sex
    if (needVet) Object.assign(patch, vet)
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    refreshProfile()
  }

  return (
    <div className="authpage">
      <form className="authcard" onSubmit={submit}>
        <img className="mark" src="/sparky.png" alt="" width="72" height="72" />
        <div>
          <h1>{needSex && needVet ? 'Two quick questions' : 'One quick question'}</h1>
          <p>Daybook is adding items that depend on {needSex ? 'this' : 'your service'}, like {needSex ? 'period and men’s health tracking' : 'records shaped for a VA claim'}. Everything you’ve logged stays as it is.</p>
        </div>
        {needSex && <SexChoice value={sex} onChange={(v) => { setSex(v); setErr('') }} />}
        {needVet && <VeteranFields value={vet} onChange={(v) => { setVet(v); setErr('') }} />}
        {err && <p className="err">{err}</p>}
        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button>
        </div>
        <p className="swap"><button type="button" onClick={signOut}>Sign out</button></p>
      </form>
    </div>
  )
}
