import { useCallback, useEffect, useRef, useState } from 'react'
import Card from './Card'
import { shows } from '../lib/items'
import {
  loadPregnancy, startPregnancy, updatePregnancy, babyBorn, endTracker, deleteForGood,
  addEvent, setEvent, loadEvents, weekCount, dueFromLmp, localDate, openSafety, fmtDuration,
} from '../lib/pregnancy'
import { MOVEMENT_NOTE, SIGNS_SOURCE } from '../lib/warningSigns'
import { fmtDay, fmtTime } from '../lib/entries'

// The pregnancy tracker's card on the Overview (WG-PLAN-HEALTH-002,
// workstream 9). Off until the person turns it on ("I'm pregnant"), offered
// by default on female profiles and to anyone who shows the item in Settings.
//
// It shows the week count and nothing else derived from the due date: no baby
// sizes, no milestone messages. Logging here is kick counts, contractions,
// prenatal visits and questions for the next visit. Symptoms, weight, blood
// pressure and glucose use Daybook's own forms; blood pressure is checked
// against ACOG's thresholds wherever it is entered (lib/pregnancy.js).

const fmtDate = (iso, opts = { month: 'long', day: 'numeric', year: 'numeric' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, opts)

function localNow() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function Pregnancy({ profile, onChanged }) {
  const [state, setState] = useState(undefined) // undefined = loading
  const [events, setEvents] = useState([])
  const [sheet, setSheet] = useState(null)
  const [err, setErr] = useState('')

  const refresh = useCallback(async () => {
    try {
      const s = await loadPregnancy(profile.id)
      setState(s)
      setEvents(s.pregnancy ? await loadEvents(profile.id, s.pregnancy.id) : [])
    } catch (e) { setErr(e.message || 'Couldn’t load the pregnancy tracker.'); setState({ pregnancy: null, thresholds: [] }) }
  }, [profile.id])

  useEffect(() => { refresh() }, [refresh])

  const changed = () => { refresh(); onChanged?.() }
  if (state === undefined) return null
  const p = state.pregnancy

  if (!p) {
    if (!shows(profile, 'pregnancy')) return null
    return (
      <div className="card preg-offer">
        <span>Pregnant? Daybook can track the weeks, kicks, contractions and visits, and watch your blood pressure.</span>
        <button type="button" className="chip took" onClick={() => setSheet('setup')}>I’m pregnant</button>
        {err && <p className="err">{err}</p>}
        {sheet === 'setup' && <SetupSheet profile={profile} onClose={() => setSheet(null)} onSaved={changed} />}
      </div>
    )
  }

  const wk = p.status === 'pregnant' ? weekCount(p.due_date) : null
  const today = localDate()
  const yearDone = p.status === 'postpartum' && p.postpartum_until && today > p.postpartum_until
  const visits = events.filter((e) => e.kind === 'visit')
  const next = visits.filter((v) => new Date(v.at) >= new Date(Date.now() - 3600000)).sort((a, b) => new Date(a.at) - new Date(b.at))[0]
  const openQs = events.filter((e) => e.kind === 'question' && !e.done).length

  return (
    <Card icon="heart" title={p.status === 'pregnant' ? 'Pregnancy' : 'After birth'}
      tag={p.status === 'pregnant' ? `due ${fmtDate(p.due_date, { month: 'short', day: 'numeric' })}` : ''}>
      {p.status === 'pregnant' ? (
        <div className="preg-week">
          {wk ? <>Week <b>{wk.weeks}</b>{wk.days ? <span>, day {wk.days}</span> : null}</> : 'Before week 0'}
          <span className="preg-due">Due date {fmtDate(p.due_date)}</span>
        </div>
      ) : (
        <div className="preg-week">
          <span className="preg-due">Baby born {fmtDate(p.birth_date)}. Tracking the year after birth{p.postpartum_until ? ` until ${fmtDate(p.postpartum_until)}` : ''}.</span>
        </div>
      )}

      {!state.thresholds?.length && (
        <p className="err">The blood pressure check couldn’t load. Open Daybook with a connection once so it can check your readings.</p>
      )}

      {yearDone && (
        <div className="preg-yearend">
          <p>The year after birth has passed. Keep tracking, or switch the tracker off? Nothing logged is deleted either way.</p>
          <div className="actions">
            <button type="button" className="btn ghost" onClick={() => updatePregnancy(profile.id, p.id, { postpartum_until: null }).then(changed)}>Keep tracking</button>
            <button type="button" className="btn" onClick={() => endTracker(profile.id, p.id).then(changed)}>Switch it off</button>
          </div>
        </div>
      )}

      <div className="preg-actions">
        {p.status === 'pregnant' && <button type="button" className="chip took" onClick={() => setSheet('kicks')}>Count kicks</button>}
        {p.status === 'pregnant' && <button type="button" className="chip took" onClick={() => setSheet('contractions')}>Time contractions</button>}
        <button type="button" className="chip took" onClick={() => setSheet('visits')}>Visits{openQs ? ` · ${openQs} question${openQs === 1 ? '' : 's'}` : ''}</button>
      </div>
      {next && <p className="note">Next visit: {fmtDay(next.at, { weekday: 'short', month: 'short', day: 'numeric' })}, {fmtTime(next.at)}{next.title ? ` · ${next.title}` : ''}</p>}

      <div className="plan-links med-links">
        <button type="button" className="link-btn" onClick={() => openSafety({ kind: 'signs' })}>Warning signs (CDC)</button>
        {p.status === 'pregnant' && <button type="button" className="link-btn" onClick={() => setSheet('born')}>Baby’s here</button>}
        <button type="button" className="link-btn" onClick={() => setSheet('edit')}>Due date and doctor</button>
        <button type="button" className="link-btn" onClick={() => setSheet('end')}>End the tracker</button>
      </div>
      {err && <p className="err">{err}</p>}

      {sheet === 'kicks' && <KickSheet profile={profile} p={p} events={events} onClose={() => setSheet(null)} onSaved={changed} />}
      {sheet === 'contractions' && <ContractionSheet profile={profile} p={p} events={events} onClose={() => setSheet(null)} onSaved={changed} />}
      {sheet === 'visits' && <VisitsSheet profile={profile} p={p} events={events} onClose={() => setSheet(null)} onSaved={changed} />}
      {sheet === 'born' && <BornSheet profile={profile} p={p} onClose={() => setSheet(null)} onSaved={changed} />}
      {sheet === 'edit' && <SetupSheet profile={profile} p={p} onClose={() => setSheet(null)} onSaved={changed} />}
      {sheet === 'end' && <EndSheet profile={profile} p={p} onClose={() => setSheet(null)} onSaved={changed} />}
    </Card>
  )
}

function Sheet({ title, onClose, onSubmit, busy, err, children, submitLabel = 'Save', closeLabel = 'Cancel' }) {
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="sheet" onSubmit={onSubmit || ((e) => e.preventDefault())}>
        <h3>{title}</h3>
        {children}
        {err && <p className="err">{err}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>{closeLabel}</button>
          {onSubmit && <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>}
        </div>
      </form>
    </div>
  )
}

// Turn the tracker on, or change the due date and the saved doctor.
function SetupSheet({ profile, p, onClose, onSaved }) {
  const [by, setBy] = useState(p?.lmp_date ? 'lmp' : 'due')
  const [f, setF] = useState({ due_date: p?.due_date || '', lmp_date: p?.lmp_date || '', doctor_name: p?.doctor_name || '', doctor_phone: p?.doctor_phone || '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const due = by === 'lmp' ? (f.lmp_date ? dueFromLmp(f.lmp_date) : '') : f.due_date

  async function submit(e) {
    e.preventDefault()
    if (!due) { setErr(by === 'lmp' ? 'Pick the first day of your last period.' : 'Pick your due date.'); return }
    const wk = weekCount(due)
    if (!wk || wk.weeks > 44) { setErr('That date doesn’t look right. Check it and try again.'); return }
    setBusy(true); setErr('')
    try {
      const row = { due_date: due, lmp_date: by === 'lmp' ? f.lmp_date : null, doctor_name: f.doctor_name, doctor_phone: f.doctor_phone }
      if (p) await updatePregnancy(profile.id, p.id, { ...row, doctor_name: row.doctor_name.trim() || null, doctor_phone: row.doctor_phone.trim() || null })
      else await startPregnancy(profile.id, row)
      onSaved?.(); onClose()
    } catch (x) { setErr(x.message || 'Couldn’t save.') } finally { setBusy(false) }
  }

  const wk = due ? weekCount(due) : null
  return (
    <Sheet title={p ? 'Due date and doctor' : 'Start tracking your pregnancy'} onClose={onClose} onSubmit={submit} busy={busy} err={err}>
      <div className="chips tight" role="group" aria-label="What do you know?">
        <button type="button" className="chip" aria-pressed={by === 'due'} onClick={() => setBy('due')}>I know my due date</button>
        <button type="button" className="chip" aria-pressed={by === 'lmp'} onClick={() => setBy('lmp')}>First day of my last period</button>
      </div>
      {by === 'due'
        ? <label className="field"><span>Due date</span><input type="date" value={f.due_date} onChange={set('due_date')} /></label>
        : <label className="field"><span>First day of your last period</span><input type="date" value={f.lmp_date} max={localDate()} onChange={set('lmp_date')} /></label>}
      {wk && <p className="note">{by === 'lmp' ? `Due date ${fmtDate(due)}. ` : ''}Week {wk.weeks}{wk.days ? `, day ${wk.days}` : ''} today.</p>}
      <p className="note">Your OB or midwife, for a Call button if a blood pressure reading is in the severe range. Optional.</p>
      <div className="row2">
        <label className="field"><span>Name</span><input value={f.doctor_name} onChange={set('doctor_name')} placeholder="Dr. Lee" /></label>
        <label className="field"><span>Phone</span><input type="tel" inputMode="tel" value={f.doctor_phone} onChange={set('doctor_phone')} placeholder="321-555-0100" /></label>
      </div>
      {!p && <p className="note">Pregnancy entries are left out of printouts and spreadsheets unless you include them.</p>}
    </Sheet>
  )
}

// Kick counter: a running clock and one big button per movement.
function KickSheet({ profile, p, events, onClose, onSaved }) {
  const [started] = useState(() => new Date())
  const [count, setCount] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const secs = Math.round((now - started) / 1000)
  const past = events.filter((e) => e.kind === 'kicks').slice(0, 5)

  async function save(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await addEvent(profile.id, p.id, { kind: 'kicks', at: started.toISOString(), count, duration_sec: secs })
      onSaved?.(); onClose()
    } catch (x) { setErr(x.message || 'Couldn’t save.') } finally { setBusy(false) }
  }

  return (
    <Sheet title="Count kicks" onClose={onClose} onSubmit={save} busy={busy} err={err} submitLabel="Save count">
      <p className="note">Tap once for each movement you feel.</p>
      <button type="button" className="kick-btn" onClick={() => setCount((c) => c + 1)}>
        <b>{count}</b><span>{count === 1 ? 'movement' : 'movements'}</span>
      </button>
      <p className="kick-clock">{fmtDuration(secs)}</p>
      <button type="button" className="link-btn" onClick={() => setCount((c) => Math.max(0, c - 1))} disabled={!count}>Undo one</button>
      <blockquote className="cdc-quote">
        {MOVEMENT_NOTE.map((t) => <p key={t}>{t}</p>)}
        <cite>— <a href={SIGNS_SOURCE.url} target="_blank" rel="noreferrer">CDC, Urgent Maternal Warning Signs</a></cite>
      </blockquote>
      {past.length > 0 && (
        <ul className="preg-list">
          {past.map((k) => <li key={k.id}><span>{fmtDay(k.at, { weekday: 'short', month: 'short', day: 'numeric' })}, {fmtTime(k.at)}</span><b>{k.count} in {fmtDuration(k.duration_sec || 0)}</b></li>)}
        </ul>
      )}
    </Sheet>
  )
}

// Contraction timer: Start when one begins, Stop when it ends. Each is saved
// as it stops, with how long it lasted and the time from the start of the one
// before.
function ContractionSheet({ profile, p, events, onClose, onSaved }) {
  const [running, setRunning] = useState(null) // Date
  const [now, setNow] = useState(Date.now())
  const [list, setList] = useState(() => events.filter((e) => e.kind === 'contraction' && Date.now() - new Date(e.at) < 12 * 3600000))
  const [err, setErr] = useState('')
  const busy = useRef(false)
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [])

  async function toggle() {
    if (!running) { setRunning(new Date()); return }
    if (busy.current) return
    busy.current = true
    const at = running, duration_sec = Math.max(1, Math.round((Date.now() - at) / 1000))
    setRunning(null)
    try {
      await addEvent(profile.id, p.id, { kind: 'contraction', at: at.toISOString(), duration_sec })
      setList((l) => [{ id: at.toISOString(), at: at.toISOString(), duration_sec }, ...l])
      onSaved?.()
    } catch (x) { setErr(x.message || 'Couldn’t save that one. Write it down.') } finally { busy.current = false }
  }

  const sorted = [...list].sort((a, b) => new Date(b.at) - new Date(a.at))
  return (
    <Sheet title="Time contractions" onClose={onClose} err={err} closeLabel="Done">
      <button type="button" className={`kick-btn${running ? ' on' : ''}`} onClick={toggle}>
        <b>{running ? fmtDuration(Math.round((now - running) / 1000)) : 'Start'}</b>
        <span>{running ? 'Tap when it ends' : 'Tap when one begins'}</span>
      </button>
      <p className="note">Follow what your OB or midwife told you about when to call or go in.</p>
      {sorted.length > 0 && (
        <ul className="preg-list">
          {sorted.map((c, i) => {
            const before = sorted[i + 1]
            const gap = before ? Math.round((new Date(c.at) - new Date(before.at)) / 1000) : null
            return (
              <li key={c.id}>
                <span>{fmtTime(c.at)}</span>
                <b>lasted {fmtDuration(c.duration_sec || 0)}{gap != null && gap < 3 * 3600 ? ` · ${fmtDuration(gap)} after the one before` : ''}</b>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}

// Prenatal visits and the running list of questions to ask at the next one.
function VisitsSheet({ profile, p, events, onClose, onSaved }) {
  const [f, setF] = useState({ at: '', title: '', notes: '' })
  const [q, setQ] = useState('')
  const [items, setItems] = useState(events)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const visits = items.filter((e) => e.kind === 'visit').sort((a, b) => new Date(b.at) - new Date(a.at))
  const questions = items.filter((e) => e.kind === 'question').sort((a, b) => Number(a.done) - Number(b.done) || new Date(b.at) - new Date(a.at))

  async function reload() { setItems(await loadEvents(profile.id, p.id)); onSaved?.() }

  async function addVisit(e) {
    e.preventDefault()
    if (!f.at) { setErr('When is the visit?'); return }
    setErr('')
    try {
      await addEvent(profile.id, p.id, { kind: 'visit', at: new Date(f.at).toISOString(), title: f.title.trim() || null, notes: f.notes.trim() || null })
      setF({ at: '', title: '', notes: '' }); await reload()
    } catch (x) { setErr(x.message || 'Couldn’t save.') }
  }
  async function addQuestion() {
    if (!q.trim()) return
    try { await addEvent(profile.id, p.id, { kind: 'question', title: q.trim() }); setQ(''); await reload() } catch (x) { setErr(x.message) }
  }
  async function tick(item) {
    try { await setEvent(profile.id, item.id, { done: !item.done }); await reload() } catch (x) { setErr(x.message) }
  }

  return (
    <Sheet title="Prenatal visits" onClose={onClose} err={err} closeLabel="Done">
      <h4 className="preg-h">Questions for your next visit</h4>
      <div className="preg-q">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Is it OK to keep running?" aria-label="New question"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addQuestion() } }} />
        <button type="button" className="chip took" onClick={addQuestion}>Add</button>
      </div>
      {questions.length > 0 && (
        <ul className="preg-list checks">
          {questions.map((x) => (
            <li key={x.id}>
              <label><input type="checkbox" checked={x.done} onChange={() => tick(x)} /> <span className={x.done ? 'done' : ''}>{x.title}</span></label>
            </li>
          ))}
        </ul>
      )}

      <h4 className="preg-h">Add a visit</h4>
      <div className="row2">
        <label className="field"><span>When</span><input type="datetime-local" value={f.at} onChange={set('at')} /></label>
        <label className="field"><span>What</span><input value={f.title} onChange={set('title')} placeholder="20-week scan" /></label>
      </div>
      <label className="field"><span>Notes (what you were told)</span><textarea rows={2} value={f.notes} onChange={set('notes')} /></label>
      <button type="button" className="btn ghost" onClick={addVisit}>Save visit</button>

      {visits.length > 0 && (
        <ul className="preg-list">
          {visits.map((v) => (
            <li key={v.id}>
              <span>{fmtDay(v.at, { weekday: 'short', month: 'short', day: 'numeric' })}, {fmtTime(v.at)}</span>
              <b>{v.title || 'Visit'}</b>
              {v.notes && <em>{v.notes}</em>}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}

function BornSheet({ profile, p, onClose, onSaved }) {
  const [day, setDay] = useState(localDate())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try { await babyBorn(profile.id, p.id, day); onSaved?.(); onClose() } catch (x) { setErr(x.message || 'Couldn’t save.') } finally { setBusy(false) }
  }
  return (
    <Sheet title="Baby’s here" onClose={onClose} onSubmit={submit} busy={busy} err={err}>
      <label className="field"><span>Day of birth</span><input type="date" value={day} max={localDate()} onChange={(e) => setDay(e.target.value)} /></label>
      <p className="note">The tracker keeps watching your blood pressure and keeps the warning signs one tap away for the year after birth, the window the CDC gives for them.</p>
    </Sheet>
  )
}

// Ending quietly. No reason asked, no reminders afterwards.
function EndSheet({ profile, p, onClose, onSaved }) {
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function keep() {
    setBusy(true); setErr('')
    try { await endTracker(profile.id, p.id); onSaved?.(); onClose() } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  async function remove() {
    setBusy(true); setErr('')
    try { await deleteForGood(p.id); onSaved?.(); onClose() } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  return (
    <Sheet title="End the pregnancy tracker" onClose={onClose} busy={busy} err={err}>
      <p>The tracker switches off and nothing more is asked or shown about it. What would you like done with its entries?</p>
      <div className="actions stack">
        <button type="button" className="btn" disabled={busy} onClick={keep}>End it and keep the entries</button>
        {!sure
          ? <button type="button" className="btn ghost" disabled={busy} onClick={() => setSure(true)}>End it and delete the entries</button>
          : <button type="button" className="btn crit" disabled={busy} onClick={remove}>Delete for good — this can’t be undone</button>}
      </div>
      {sure && <p className="note">Deletes the kick counts, contractions, visits, questions and pregnancy symptoms, and their edit history. Weight and blood pressure readings stay with your vitals.</p>}
    </Sheet>
  )
}
