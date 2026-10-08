import { lazy, Suspense, useEffect, useState } from 'react'
import { loadWorkoutHistory } from '../lib/workouts'
import { loadRoute, fmtMiles, fmtPace } from '../lib/routes'

const RouteMap = lazy(() => import('./RouteMap'))

// Finished workouts, newest first, each opening to the sets done. Came over
// from Sparky Fit's History tab when fitness moved back into Daybook.

const fmtDay = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

export default function WorkoutHistory({ profile }) {
  const [rows, setRows] = useState(undefined)
  const [err, setErr] = useState('')
  const [opened, setOpened] = useState({}) // routes load the first time a workout is opened

  useEffect(() => {
    loadWorkoutHistory(profile.id).then(setRows).catch((e) => { setErr(e.message || 'Couldn’t load your history.'); setRows([]) })
  }, [profile.id])

  if (rows === undefined) return <div className="card empty">Loading your workouts…</div>
  // Nothing finished yet: the plan card above already says what to do.
  if (!rows.length) return err ? <p className="err">{err}</p> : null

  return (
    <div className="grid">
      <h3 className="section-h">Past workouts</h3>
      {rows.map((w) => {
        const moves = [...new Set(w.sets.map((s) => s.movement))]
        return (
          <details className="card hist" key={w.id} onToggle={(e) => e.currentTarget.open && w.distance_m != null && setOpened((o) => ({ ...o, [w.id]: true }))}>
            <summary>
              <b>{w.activity}</b>
              <span>{fmtDay(w.done_at)}{w.distance_m != null ? ` · ${fmtMiles(w.distance_m)}` : ''}{w.duration_min ? ` · ${w.duration_min} min` : ''}{w.distance_m != null ? ` · ${fmtPace(w.duration_min * 60, w.distance_m)}` : ` · ${w.sets.length} set${w.sets.length === 1 ? '' : 's'}`}</span>
            </summary>
            {opened[w.id] && <RouteOf id={w.id} />}
            {w.notes && <p className="note">{w.notes}</p>}
            {moves.map((m) => (
              <div className="hist-move" key={m}>
                <h4>{m}</h4>
                <ol>
                  {w.sets.filter((s) => s.movement === m).map((s) => (
                    <li key={s.id}>{[s.reps != null && `${s.reps} reps`, s.load, s.weight_lb != null && !/lb/i.test(s.load || '') && `${s.weight_lb} lb`, s.rpe && `RPE ${s.rpe}`].filter(Boolean).join(' · ') || 'done'}</li>
                  ))}
                </ol>
              </div>
            ))}
          </details>
        )
      })}
    </div>
  )
}

// A saved route's map, loaded when its workout is first opened.
function RouteOf({ id }) {
  const [route, setRoute] = useState(undefined)
  useEffect(() => { loadRoute(id).then(setRoute).catch(() => setRoute(null)) }, [id])
  if (route === undefined) return <div className="route-map" style={{ height: 200 }} />
  if (!route?.points?.length) return null
  return <Suspense fallback={<div className="route-map" style={{ height: 200 }} />}><RouteMap points={route.points} height={200} /></Suspense>
}
