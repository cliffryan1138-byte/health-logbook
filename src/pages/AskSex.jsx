import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import SexChoice from '../components/SexChoice'

// Asked once of people who signed up before "Male or female?" was the first
// sign-up question (migration 0012). Nothing they logged changes.
export default function AskSex() {
  const { profile, refreshProfile, signOut } = useAuth()
  const [sex, setSex] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!sex) { setErr('Choose male or female.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.from('profiles').update({ sex }).eq('id', profile.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    refreshProfile()
  }

  return (
    <div className="authpage">
      <form className="authcard" onSubmit={submit}>
        <img className="mark" src="/sparky.png" alt="" width="72" height="72" />
        <div>
          <h1>One quick question</h1>
          <p>Daybook is adding items that depend on this, like period and men’s health tracking. Everything you’ve logged stays as it is.</p>
        </div>
        <SexChoice value={sex} onChange={(v) => { setSex(v); setErr('') }} />
        {err && <p className="err">{err}</p>}
        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button>
        </div>
        <p className="swap"><button type="button" onClick={signOut}>Sign out</button></p>
      </form>
    </div>
  )
}
