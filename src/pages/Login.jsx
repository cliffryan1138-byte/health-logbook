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

// The project's password rule (Supabase Auth): a lowercase letter, a capital,
// a number and a symbol. Checked here first, in plain words; a tester got the
// server's version, which lists every symbol on the keyboard.
const PASSWORD_NEEDS = [
  [/[a-z]/, 'a lowercase letter'],
  [/[A-Z]/, 'a capital letter'],
  [/[0-9]/, 'a number'],
  [/[^A-Za-z0-9]/, 'a symbol like ! or #'],
]
function passwordMissing(pw) {
  return PASSWORD_NEEDS.filter(([re]) => !re.test(pw)).map(([, what]) => what)
}
const listOf = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

// Supabase's messages, in words a tester can act on.
function plain(error) {
  const code = error?.code
  if (code === 'weak_password') return 'That password is too easy to guess. Use a lowercase letter, a capital letter, a number and a symbol like ! or #.'
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error?.status === 429 || /for security purposes|rate limit/i.test(error?.message || '')) {
    return 'That was tapped a few times quickly. Wait a minute, then try once.'
  }
  if (code === 'invalid_credentials') return 'That email and password don’t match. Check them, or tap Forgot password.'
  if (code === 'user_already_exists' || code === 'email_exists') return 'That email already has an account. Sign in instead.'
  return error?.message || 'Something went wrong. Try again.'
}

export default function Login() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(''); setMsg('')
    if (mode === 'forgot') return sendReset()
    if (mode === 'signup' && password !== password2) {
      setErr('Passwords don\'t match — retype them and try again.')
      return
    }
    if (mode === 'signup' && passwordMissing(password).length) {
      setErr(`Your password also needs ${listOf(passwordMissing(password))}.`)
      return
    }
    setBusy(true)
    const fn = mode === 'signin'
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password })
    const { error, data } = await fn
    setBusy(false)
    // Signing in before confirming: show the confirm screen, with a resend.
    if (error?.code === 'email_not_confirmed') { setMode('sent'); setMsg('unconfirmed'); return }
    if (error) { setErr(plain(error)); return }
    // A tester tapped Create account four more times because the form stayed
    // up after it worked. Success now replaces the form.
    if (mode === 'signup' && !data.session) { setMode('sent'); setMsg('') }
  }

  async function resend() {
    setErr(''); setResent(false); setBusy(true)
    const { error } = await supabase.auth.resend({
      type: 'signup', email: email.trim(),
      options: { emailRedirectTo: window.location.origin.replace(/\.+(?=(:\d+)?$)/, '') },
    })
    setBusy(false)
    if (error) { setErr(plain(error)); return }
    setResent(true)
  }

  // "Forgot password?" — Supabase emails a one-time link back to this origin.
  // Opening it signs the person in with a PASSWORD_RECOVERY event, which
  // AuthContext turns into the "Set a new password" screen. The reply is the
  // same whether or not the address has an account, so the form can't be used
  // to find out who is registered.
  async function sendReset() {
    if (!email.trim()) { setErr('Enter the email you signed up with.'); return }
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin.replace(/\.+(?=(:\d+)?$)/, ''),
    })
    setBusy(false)
    if (error && !/rate|too many/i.test(error.message)) { setErr(error.message); return }
    if (error) { setErr('Too many reset emails just now — wait a minute and try again.'); return }
    setMsg('If that email has an account, a reset link is on its way. Open it on this device.')
  }

  const go = (m) => { setMode(m); setErr(''); setMsg(''); setResent(false) }

  // No redirect handler is needed here. This app is a single page with no
  // router, and supabase-js exchanges the PKCE code off the URL on startup
  // (detectSessionInUrl, on by default) — AuthContext's onAuthStateChange
  // then swaps this screen for the dashboard. Sending the user back to the
  // bare origin is deliberate: any deeper path would 404 on a static host.
  async function google() {
    setErr(''); setMsg(''); setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin.replace(/\.+(?=(:\d+)?$)/, '') },
    })
    // On success the browser has already left for Google, so this only runs
    // when the call failed outright — most often the provider being disabled.
    if (error) { setErr(error.message); setBusy(false) }
  }

  if (mode === 'sent') {
    return (
      <div className="authpage">
        <div className="authcard">
          <img className="mark" src="/sparky.png" alt="" width="72" height="72" />
          <h1>{msg === 'unconfirmed' ? 'Confirm your email first' : 'Check your email'}</h1>
          <p>
            We sent a link to <b>{email.trim()}</b>. Open that email and tap the link in it, then come back
            and sign in. It comes from Daybook (noreply@wastegate.ai); if it isn’t in your inbox in a
            minute or two, look in Spam or Promotions.
          </p>
          {err && <p className="err">{err}</p>}
          {resent && <p className="saved-note" role="status">✓ Sent again. Use the newest email.</p>}
          <div className="actions">
            <button className="btn" type="button" onClick={() => go('signin')}>I’ve confirmed — sign in</button>
          </div>
          <div className="swap">
            Nothing arrived? <button type="button" onClick={resend} disabled={busy}>{busy ? 'Sending…' : 'Send it again'}</button>
          </div>
          <div className="swap">
            <button type="button" onClick={() => go('signup')}>Use a different email</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="authpage">
      <form className="authcard" onSubmit={submit}>
        <img className="mark" src="/sparky.png" alt="" width="72" height="72" />
        <div>
          <h1>Daybook</h1>
          <p>{mode === 'forgot'
            ? 'Enter your email and we’ll send you a link to set a new password.'
            : 'The household health log. Sign in to see your dashboard.'}</p>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== 'forgot' && (
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" required
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password} onChange={(e) => { setPassword(e.target.value); setErr('') }} />
            {mode === 'signup' && (
              <p className="note pw-hint">
                Use a lowercase letter, a capital letter, a number and a symbol like ! or #.
                {password && passwordMissing(password).length > 0 && <> Still needs {listOf(passwordMissing(password))}.</>}
                {password && !passwordMissing(password).length && <> ✓ Good.</>}
              </p>
            )}
          </div>
        )}
        {mode === 'signin' && (
          <button type="button" className="forgot" onClick={() => go('forgot')}>Forgot password?</button>
        )}
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
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>
        </div>
        {mode !== 'forgot' && (
          <>
            <div className="oauth-sep"><span>or</span></div>
            <button className="btn-oauth" type="button" onClick={google} disabled={busy}>
              <GoogleMark />
              Continue with Google
            </button>
          </>
        )}
        <div className="swap">
          {mode === 'forgot' ? (
            <button type="button" onClick={() => go('signin')}>Back to sign in</button>
          ) : (
            <>
              {mode === 'signin' ? 'No account yet? ' : 'Already have one? '}
              <button type="button" onClick={() => go(mode === 'signin' ? 'signup' : 'signin')}>
                {mode === 'signin' ? 'Create one' : 'Sign in'}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  )
}
