import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [profile, setProfile] = useState(undefined)
  // True after someone opens a password-reset link: they are signed in, but
  // must choose a new password before the dashboard.
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (data.session || !error) { setSession(data.session ?? null); return }
      // Offline with an expired access token: the library can't refresh it,
      // so it reports no session, though the sign-in is still saved on the
      // phone. Use that saved sign-in so Daybook opens (offline start, for
      // the pregnancy blood pressure check). Nothing can be read or written
      // until the connection is back, when the library refreshes it and
      // onAuthStateChange hands over the fresh session.
      const offline = navigator.onLine === false || error.name === 'AuthRetryableFetchError'
      let saved = null
      try { saved = offline ? JSON.parse(localStorage.getItem(supabase.auth.storageKey) || 'null') : null } catch { /* private mode */ }
      setSession(saved?.user ? { ...saved, offline: true } : null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      // The first session is getSession's to report (above).
      if (event === 'INITIAL_SESSION') return
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // The profile is kept on the phone, so Daybook opens offline. A failed load
  // (no connection, a network blip) uses that copy; it never means "no
  // profile", which would send the person back to the sign-up questions.
  const loadProfile = useCallback(async () => {
    if (!session?.user) { setProfile(null); return }
    const key = `lb_profile_${session.user.id}`
    const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
    if (error) {
      let saved = null
      try { saved = JSON.parse(localStorage.getItem(key) || 'null') } catch { /* private mode */ }
      setProfile(saved ?? undefined) // undefined keeps "Loading…" rather than sign-up
      return
    }
    try { data ? localStorage.setItem(key, JSON.stringify(data)) : localStorage.removeItem(key) } catch { /* private mode */ }
    setProfile(data ?? null)
  }, [session])

  useEffect(() => { if (session !== undefined) loadProfile() }, [session, loadProfile])

  const signOut = () => {
    setRecovery(false)
    // Signing out leaves no profile or pregnancy copy behind on the phone.
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('lb_profile_') || k === 'lb_pregnancy') localStorage.removeItem(k)
    } catch { /* private mode */ }
    return supabase.auth.signOut()
  }

  return (
    <AuthCtx.Provider value={{ session, profile, refreshProfile: loadProfile, signOut, recovery, endRecovery: () => setRecovery(false) }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
