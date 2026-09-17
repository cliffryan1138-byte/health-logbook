import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [profile, setProfile] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadProfile = useCallback(async () => {
    if (!session?.user) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
    setProfile(data ?? null)
  }, [session])

  useEffect(() => { if (session !== undefined) loadProfile() }, [session, loadProfile])

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthCtx.Provider value={{ session, profile, refreshProfile: loadProfile, signOut }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
