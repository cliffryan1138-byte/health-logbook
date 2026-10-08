import { useCallback, useEffect, useMemo, useState } from 'react'
import PlanEditor from '../components/PlanEditor'
import {
  loadActivePlan, lastDoneDayId, lastSets, todaysDay, weekOf, finishWorkout, stopPlan, targetReps, WEEKDAYS,
} from '../lib/workouts'

// The Workouts tab: today's session from the active plan, one tap per set, the
// last time you did each movement right beside it, a rest timer, and Finish.
// An unfinished session is kept on this device, so leaving the app mid-workout
// loses nothing.

const RPES = ['', 6, 7, 8, 9, 10]

function sessionKey(profileId) { return `lb_workout_${profileId}` }
function loadSession(profileId) {
  try { return JSON.parse(localStorage.getItem(sessionKey(profileId)) || 'null') } catch { return null }
}
function keepSession(profileId, s) {
  try { s ? localStorage.setItem(sessionKey(profileId), JSON.stringify(s)) : localStorage.removeItem(sessionKey(profileId)) } catch { /* private mode */ }
}

function newSession(day, last) {
  const sets = []
  for (const x of day.exercises) {
    const n = x.sets || 1
    const prev = last[x.name]
    for (let k = 1; k <= n; k++) {
      sets.push({
        plan_exercise_id: x.id, movement: x.name, set_no: k,
        reps: '', load: prev?.load || '', weight_lb: prev?.weight_lb ?? '', rpe: '', done: false,
      })
    }
  }
  return { dayId: day.id, startedAt: Date.now(), sets, notes: '' }
}

// A moment as a datetime-local value in the phone's time.
function toLocalInput(ms) {
  const d = new Date(ms)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function Workouts({ profile, onLogged }) {
  const [plan, setPlan] = useState(undefined) // undefined = loading, null = none
  const [dayId, setDayId] = useState(null)
  const [last, setLast] = useState({})
  const [lastDone, setLastDone] = useState(null)
  const [session, setSession] = useState(() => loadSession(profile.id))
  const [editing, setEditing] = useState(false)
  const [rest, setRest] = useState(null) // { until, label }
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState('')

  const refresh = useCallback(async () => {
    try {
      const p = await loadActivePlan(profile.id)
      setPlan(p)
      if (!p) return
      const ld = await lastDoneDayId(profile.id, p)
      setLastDone(ld)
      setLast(await lastSets(profile.id, [...new Set(p.days.flatMap((d) => d.exercises.map((x) => x.name)))]))
    } catch (e) { setErr(e.message || 'Couldn’t load your plan.'); setPlan(null) }
  }, [profile.id])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { keepSession(profile.id, session) }, [profile.id, session])
  useEffect(() => {
    if (!rest) return
    const t = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= rest.until) {
        setRest(null)
        try { navigator.vibrate?.(300) } catch { /* not supported */ }
      }
    }, 500)
    return () => clearInterval(t)
  }, [rest])

  const today = useMemo(() => (plan ? todaysDay(plan, lastDone) : { day: null, rest: false }), [plan, lastDone])
  const week = weekOf(plan)
  const weekNote = plan?.week_notes?.find((w) => w.week === week)?.text
  // A session in progress wins; otherwise the day picked, otherwise today's.
  const activeDay = plan?.days.find((d) => d.id === (session?.dayId || dayId)) || today.day

  if (plan === undefined) return <div className="card empty">Loading your plan…</div>

  if (!plan) {
    return (
      <>
        <div className="card empty-state">
          <img src="/sparky.png" alt="" width="96" height="96" />
          <h2>No training plan yet</h2>
          <p>Start from a ready-made plan, load yours from a PDF or a photo and Sparky sets up each day for you, or build one yourself.
            Then every workout is one tap per set.</p>
          {err && <p className="err">{err}</p>}
          <div className="actions" style={{ maxWidth: 360, margin: '16px auto 0' }}>
            <button type="button" className="btn" onClick={() => setEditing(true)}>Load a plan</button>
          </div>
        </div>
        {editing && <PlanEditor profile={profile} onClose={() => setEditing(false)} onSaved={refresh} />}
      </>
    )
  }

  const setsFor = (x) => (session?.sets || []).map((s, i) => ({ ...s, i })).filter((s) => s.plan_exercise_id === x.id)
  // A band or weight typed on one set carries down to that exercise's later
  // sets that aren't done yet — nobody wants to type "red band" four times.
  const updateSet = (i, patch) => setSession((s) => {
    const src = s.sets[i]
    return {
      ...s,
      sets: s.sets.map((y, k) => {
        if (k === i) return { ...y, ...patch }
        if ('load' in patch && k > i && !y.done && y.plan_exercise_id === src.plan_exercise_id && (y.load === '' || y.load === src.load)) {
          return { ...y, load: patch.load }
        }
        return y
      }),
    }
  })

  function start(day) {
    setSaved(''); setErr('')
    setSession(newSession(day, last))
  }

  function tick(s, x) {
    const done = !s.done
    const reps = s.reps === '' && done ? (targetReps(x.reps) ?? '') : s.reps
    updateSet(s.i, { done, reps })
    if (done && x.rest_sec) { setNow(Date.now()); setRest({ until: Date.now() + x.rest_sec * 1000, label: x.name }) }
    if (!done) setRest(null)
  }

  function addSet(x) {
    setSession((s) => {
      const mine = s.sets.filter((y) => y.plan_exercise_id === x.id)
      const lastOne = mine[mine.length - 1] || {}
      const at = s.sets.lastIndexOf(lastOne) + 1 || s.sets.length
      const row = { plan_exercise_id: x.id, movement: x.name, set_no: mine.length + 1, reps: '', load: lastOne.load || '', weight_lb: lastOne.weight_lb ?? '', rpe: '', done: false }
      return { ...s, sets: [...s.sets.slice(0, at), row, ...s.sets.slice(at)] }
    })
  }

  async function finish() {
    const doneCount = session.sets.filter((s) => s.done).length
    if (!doneCount && !confirm('No sets are ticked. Save this workout anyway?')) return
    // "When did you do it?" defaults to when the session was started; change
    // it to log a workout done earlier. Minutes still default to the timer.
    const startedAt = session.at ? new Date(session.at).getTime() : session.startedAt
    if (Number.isNaN(startedAt)) { setErr('Enter when you did it.'); return }
    if (startedAt > Date.now() + 5 * 60000) { setErr('That time is in the future.'); return }
    setBusy(true); setErr('')
    try {
      const minutes = session.minutes || Math.max(1, Math.round((Date.now() - session.startedAt) / 60000))
      await finishWorkout(profile.id, {
        day: activeDay, planName: plan.name, week, startedAt, minutes, notes: session.notes, sets: session.sets,
      })
      setSaved(`${activeDay.title} saved: ${doneCount} sets, ${minutes} min.`)
      setSession(null); setRest(null); setDayId(null)
      onLogged?.()
      refresh()
    } catch (e) {
      setErr(e.message || 'Couldn’t save the workout.')
    } finally { setBusy(false) }
  }

  function discard() {
    if (!confirm('Throw away this workout? Nothing from it will be saved.')) return
    setSession(null); setRest(null)
  }

  async function stop() {
    if (!confirm(`Stop using “${plan.name}”? Your finished workouts stay in your log.`)) return
    try { await stopPlan(profile.id, plan.id); setSession(null); refresh() } catch (e) { setErr(e.message) }
  }

  const restLeft = rest ? Math.max(0, Math.ceil((rest.until - now) / 1000)) : 0
  const doneSets = (session?.sets || []).filter((s) => s.done).length
  const totalSets = (session?.sets || []).length

  return (
    <div className="grid">
      <div className="card hero">
        <div className="hero-top">
          <h2>{plan.name}</h2>
          {week && <span className="focus">Week {week}{plan.weeks ? ` of ${plan.weeks}` : ''}</span>}
        </div>
        {weekNote && <p className="hero-today">{weekNote}</p>}
        {plan.source === 'library' && plan.description && <p className="note" style={{ margin: '6px 0 0' }}>{plan.description}</p>}
        {!week && plan.started_on && <p className="hero-today">Starts {new Date(`${plan.started_on}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}.</p>}
        {saved && <p className="saved-note">✓ {saved}</p>}
      </div>

      {!session && (
        <div className="card">
          <div className="card-head"><h3>{today.rest ? 'Rest day' : 'Today'}</h3></div>
          {today.rest && <p className="empty">Nothing is scheduled today. Recovery counts. Or pick a day below to train anyway.</p>}
          <div className="chips tight" role="group" aria-label="Pick a day">
            {plan.days.map((d) => (
              <button type="button" key={d.id} className="chip" aria-pressed={(dayId || today.day?.id) === d.id} onClick={() => setDayId(d.id)}>
                {d.weekday ? WEEKDAYS[d.weekday].slice(0, 3) + ' · ' : ''}{d.title.replace(/^Day \d+\s*[—-]\s*/, '')}
              </button>
            ))}
          </div>
          {activeDay && (
            <>
              <h3 className="day-title">{activeDay.title}</h3>
              {activeDay.focus && <p className="note" style={{ marginTop: 0 }}>{activeDay.focus}</p>}
              {activeDay.notes && <p className="note day-notes">{activeDay.notes}</p>}
              <ol className="day-preview">
                {activeDay.exercises.map((x) => (
                  <li key={x.id}><b>{x.name}</b> <span>{[x.sets && `${x.sets} ×`, x.reps].filter(Boolean).join(' ')}</span></li>
                ))}
              </ol>
              <button type="button" className="btn" onClick={() => start(activeDay)}>Start {activeDay.title.replace(/\s*[—-].*$/, '')}</button>
            </>
          )}
        </div>
      )}

      {session && activeDay && (
        <>
          <div className="card session-head">
            <div>
              <h3>{activeDay.title}</h3>
              {activeDay.notes && <details className="ex-cues"><summary>Day notes</summary><p>{activeDay.notes}</p></details>}
              <p className="note" style={{ margin: 0 }}>{doneSets} of {totalSets} sets · started {new Date(session.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
            </div>
            <div className="progress" aria-hidden="true"><i style={{ width: `${totalSets ? (100 * doneSets) / totalSets : 0}%` }} /></div>
          </div>

          {activeDay.exercises.map((x) => {
            const prev = last[x.name]
            return (
              <div className="card ex-card" key={x.id}>
                <div className="ex-head">
                  <h4>{x.name}</h4>
                  <span className="ex-target">{[x.sets && `${x.sets} ×`, x.reps].filter(Boolean).join(' ')}{x.rest_sec ? ` · rest ${x.rest_sec}s` : ''}</span>
                </div>
                {x.cues && <details className="ex-cues"><summary>How to</summary><p>{x.cues}</p></details>}
                {prev && (
                  <p className="ex-last">Last time: {[prev.reps != null && `${prev.reps} reps`, prev.load, prev.weight_lb != null && !/lb/i.test(prev.load || '') && `${prev.weight_lb} lb`, prev.rpe && `RPE ${prev.rpe}`].filter(Boolean).join(' · ')}</p>
                )}
                <div className="set-rows">
                  <div className="set-row set-labels" aria-hidden="true"><span /><span>Reps</span><span>Band / weight</span><span>RPE</span></div>
                  {setsFor(x).map((s) => (
                    <div className={`set-row${s.done ? ' done' : ''}`} key={s.i}>
                      <button type="button" className="set-tick" aria-pressed={s.done} onClick={() => tick(s, x)}>
                        {s.done ? '✓' : ''} {s.set_no}
                      </button>
                      <input inputMode="numeric" aria-label={`Set ${s.set_no} reps`} placeholder={targetReps(x.reps) ?? '—'} value={s.reps} onChange={(e) => updateSet(s.i, { reps: e.target.value })} />
                      <input aria-label={`Set ${s.set_no} band or weight`} placeholder="red band / 20 lb" value={s.load} onChange={(e) => updateSet(s.i, { load: e.target.value })} />
                      <select aria-label={`Set ${s.set_no} RPE`} value={s.rpe} onChange={(e) => updateSet(s.i, { rpe: e.target.value })}>
                        {RPES.map((r) => <option key={r} value={r}>{r || '–'}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <button type="button" className="link-btn" onClick={() => addSet(x)}>+ Add a set</button>
              </div>
            )
          })}

          <div className="card">
            <div className="row2">
              <label className="field"><span>Minutes</span>
                <input inputMode="numeric" value={session.minutes ?? ''} placeholder={String(Math.max(1, Math.round((Date.now() - session.startedAt) / 60000)))}
                  onChange={(e) => setSession((s) => ({ ...s, minutes: e.target.value }))} /></label>
              <label className="field"><span>When did you do it?</span>
                <input type="datetime-local" value={session.at ?? toLocalInput(session.startedAt)}
                  onChange={(e) => setSession((s) => ({ ...s, at: e.target.value }))} /></label>
            </div>
            <label className="field"><span>Notes (how it felt, pain, band changes)</span>
              <textarea rows={2} value={session.notes} onChange={(e) => setSession((s) => ({ ...s, notes: e.target.value }))} /></label>
            {err && <p className="err">{err}</p>}
            <div className="actions">
              <button type="button" className="btn ghost" onClick={discard} disabled={busy}>Discard</button>
              <button type="button" className="btn" onClick={finish} disabled={busy}>{busy ? 'Saving…' : 'Finish workout'}</button>
            </div>
          </div>
        </>
      )}

      {!session && (
        <div className="plan-links">
          <button type="button" className="link-btn" onClick={() => setEditing(true)}>Load a different plan</button>
          <button type="button" className="link-btn" onClick={stop}>Stop this plan</button>
        </div>
      )}
      {!session && err && <p className="err">{err}</p>}

      {rest && restLeft > 0 && (
        <button type="button" className="rest-banner" onClick={() => setRest(null)} aria-live="polite">
          Rest <b>{fmtClock(restLeft)}</b> · {rest.label} <span>tap to skip</span>
        </button>
      )}

      {editing && <PlanEditor profile={profile} onClose={() => setEditing(false)} onSaved={() => { setSession(null); refresh() }} />}
    </div>
  )
}
