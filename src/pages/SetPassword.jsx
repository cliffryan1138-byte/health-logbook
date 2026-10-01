import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Shown after someone opens the reset link from "Forgot password?". The link has
// already signed them in; this sets the new password on that session.

export default function SetPassword() {
  const { endRecovery, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (password.length < 8) { setErr('Use at least 8 characters.'); return }
    if (password !== password2) { setErr('Passwords don\'t match — retype them and try again.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) { setErr(error.message); return }
    endRecovery()
  }

  return (
    <div className="authpage">
      <form className="authcard" onSubmit={submit}>
        <img className="mark" src="/sparky.png" alt="" width="72" height="72" />
        <div>
          <h1>Set a new password</h1>
          <p>Choose a new password for your Daybook account.</p>
        </div>
        <div className="field">
          <label htmlFor="np1">New password</label>
          <input id="np1" type="password" required autoComplete="new-password" autoFocus
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="np2">Confirm new password</label>
          <input id="np2" type="password" required autoComplete="new-password"
            value={password2} onChange={(e) => setPassword2(e.target.value)} />
        </div>
        {err && <p className="err">{err}</p>}
        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
        </div>
        <div className="swap">
          <button type="button" onClick={signOut}>Cancel and sign out</button>
        </div>
      </form>
    </div>
  )
}
