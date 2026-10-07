import { useEffect, useState } from 'react'
import { loadWorkoutHistory } from '../lib/workouts'

// Finished workouts, newest first, each opening to the sets done. Came over
// from Sparky Fit's History tab when fitness moved back into Daybook.

const fmtDay = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

export default function WorkoutHistory({ profile }) {
  const [rows, setRows] = useState(undefined)
  const [err, setErr] = useState('')

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
          <details className="card hist" key={w.id}>
            <summary>
              <b>{w.activity}</b>
              <span>{fmtDay(w.done_at)}{w.duration_min ? ` · ${w.duration_min} min` : ''} · {w.sets.length} set{w.sets.length === 1 ? '' : 's'}</span>
            </summary>
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
