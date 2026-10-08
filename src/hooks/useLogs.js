import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { daysAgo } from '../lib/stats'

// Pull the last 14 days of everything for the signed-in profile.
// RLS scopes rows server-side; no profile_id filter needed, but we pass it
// anyway so the query planner uses the (profile_id, time) index.
export function useLogs(profileId, days = 14) {
  const [logs, setLogs] = useState({ meals: [], vitals: [], exercise: [], symptoms: [], med_doses: [], daily_checkins: [], medications: [], loading: true })

  const refresh = useCallback(async () => {
    if (!profileId) return
    const since = daysAgo(days)
    const [meals, vitals, exercise, symptoms, doses, checkins, meds] = await Promise.all([
      supabase.from('meals').select('*').eq('profile_id', profileId).gte('eaten_at', since).order('eaten_at'),
      supabase.from('vitals').select('*').eq('profile_id', profileId).gte('taken_at', since).order('taken_at'),
      supabase.from('exercise').select('*').eq('profile_id', profileId).gte('done_at', since).order('done_at'),
      supabase.from('symptoms').select('*').eq('profile_id', profileId).gte('felt_at', since).order('felt_at'),
      supabase.from('med_doses').select('*').eq('profile_id', profileId).gte('taken_at', since).order('taken_at'),
      supabase.from('daily_checkins').select('*').eq('profile_id', profileId).gte('day', since.slice(0, 10)).order('day'),
      // The whole medication list, stopped ones included: it's short, and the
      // printed record lists what was taken over the period.
      supabase.from('medications').select('*').eq('profile_id', profileId).order('name'),
    ])
    setLogs({
      meals: meals.data ?? [],
      vitals: vitals.data ?? [],
      exercise: exercise.data ?? [],
      symptoms: symptoms.data ?? [],
      med_doses: doses.data ?? [],
      daily_checkins: checkins.data ?? [],
      medications: meds.data ?? [],
      loading: false,
    })
  }, [profileId, days])

  useEffect(() => { refresh() }, [refresh])

  return { ...logs, refresh }
}
