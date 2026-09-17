import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { daysAgo } from '../lib/stats'

// Pull the last 14 days of everything for the signed-in profile.
// RLS scopes rows server-side; no profile_id filter needed, but we pass it
// anyway so the query planner uses the (profile_id, time) index.
export function useLogs(profileId, days = 14) {
  const [logs, setLogs] = useState({ meals: [], vitals: [], exercise: [], symptoms: [], loading: true })

  const refresh = useCallback(async () => {
    if (!profileId) return
    const since = daysAgo(days)
    const [meals, vitals, exercise, symptoms] = await Promise.all([
      supabase.from('meals').select('*').eq('profile_id', profileId).gte('eaten_at', since).order('eaten_at'),
      supabase.from('vitals').select('*').eq('profile_id', profileId).gte('taken_at', since).order('taken_at'),
      supabase.from('exercise').select('*').eq('profile_id', profileId).gte('done_at', since).order('done_at'),
      supabase.from('symptoms').select('*').eq('profile_id', profileId).gte('felt_at', since).order('felt_at'),
    ])
    setLogs({
      meals: meals.data ?? [],
      vitals: vitals.data ?? [],
      exercise: exercise.data ?? [],
      symptoms: symptoms.data ?? [],
      loading: false,
    })
  }, [profileId, days])

  useEffect(() => { refresh() }, [refresh])

  return { ...logs, refresh }
}
