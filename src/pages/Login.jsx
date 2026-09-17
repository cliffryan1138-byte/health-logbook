import { useState } from 'react'
import { supabase } from '../lib/supabase'

// RECOVERY NOTE: everything down to the end of submit() is the original file,
// recovered from the Vercel deployment. The form markup was lost to a response
// limit and is rebuilt; the copy and class names match what shipped.

export default function Login() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(''); setMsg('')
    if (mode === 'signup' && password !== password2) {
      setErr('Passwords don\'t match — retype them and try again.')
      return
    }
    setBusy(true)
    const fn = mode === 'signin'
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password })
    const { error, data } = await fn
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (mode === 'signup' && !data.session) {
      setMsg('Check your email to confirm your account, then sign in.')
    }
  }

  return (
    <div className="authpage">
      <form className="authcard" onSubmit={submit}>
        <img className="mark" src="/sparky.png" alt="" width="72" height="72" />
        <div>
          <h1>Health-Logbook</h1>
          <p>The household health log. Sign in to see your dashboard.</p>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" required
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {mode === 'signup' && (
          <div className="field">
            <label htmlFor="password2">Confirm password</label>
            <input id="password2" type="password" required autoComplete="new-password"
              value={password2} onChange={(e) => setPassword2(e.target.value)} />
          </div>
        )}
        {err && <p className="err">{err}</p>}
        {msg && <p className="note">{msg}</p>}
        <div className="actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </div>
        <div className="swap">
          {mode === 'signin' ? 'No account yet? ' : 'Already have one? '}
          <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErr(''); setMsg('') }}>
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  )
}
