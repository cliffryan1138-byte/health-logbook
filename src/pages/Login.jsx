import { useState } from 'react'
import { supabase } from '../lib/supabase'

// RECOVERY NOTE: everything down to the end of submit() is the original file,
// recovered from the Vercel deployment. The form markup was lost to a response
// limit and is rebuilt; the copy and class names match what shipped.

// Google's four-colour G, inline rather than an image so it survives with no
// network and keeps its colours in both themes. Google's brand terms require
// the mark be used unaltered, so the paths are verbatim and it is never
// recoloured to match the app.
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

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

  // No redirect handler is needed here. This app is a single page with no
  // router, and supabase-js exchanges the PKCE code off the URL on startup
  // (detectSessionInUrl, on by default) — AuthContext's onAuthStateChange
  // then swaps this screen for the dashboard. Sending the user back to the
  // bare origin is deliberate: any deeper path would 404 on a static host.
  async function google() {
    setErr(''); setMsg(''); setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    // On success the browser has already left for Google, so this only runs
    // when the call failed outright — most often the provider being disabled.
    if (error) { setErr(error.message); setBusy(false) }
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
        <div className="oauth-sep"><span>or</span></div>
        <button className="btn-oauth" type="button" onClick={google} disabled={busy}>
          <GoogleMark />
          Continue with Google
        </button>
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
