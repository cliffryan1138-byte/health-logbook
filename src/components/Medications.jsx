import { useState } from 'react'
import Card from './Card'
import { addMed, stopMed, logDose, isCurrent, medLine, today } from '../lib/meds'
import { supabase } from '../lib/supabase'
import { fmtDay, fmtTime } from '../lib/entries'

// The Overview card: what you take, "Took it" beside each, and the last dose.
// The sheets are exported so the Add-manually menu opens the same forms.

export default function Medications({ profile, meds, doses, onChanged }) {
  const [sheet, setSheet] = useState(null) // { kind: 'add' } | { kind: 'dose', med }
  const current = meds.filter(isCurrent)
  const lastDose = (m) => doses.filter((d) => d.medication_id === m.id)
    .reduce((a, d) => (!a || d.taken_at > a.taken_at ? d : a), null)

  return (
    <Card icon="pill" title="Medications" tag={current.length ? `${current.length} current` : ''}>
      {current.length === 0 ? (
        <p className="empty">Add what you take, and tap Took it each time — a doctor will ask both.</p>
      ) : (
        <ul className="meds">
          {current.map((m) => {
            const last = lastDose(m)
            return (
              <li key={m.id}>
                <div className="med-body">
                  <div className="med-name">{m.name}</div>
                  {medLine(m) && <div className="med-line">{medLine(m)}</div>}
                  {last && <div className="med-last">Last taken {fmtDay(last.taken_at, { weekday: 'short', month: 'short', day: 'numeric' })}, {fmtTime(last.taken_at)}</div>}
                </div>
                <button type="button" className="chip took" onClick={() => setSheet({ kind: 'dose', med: m })}>Took it</button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="plan-links med-links">
        <button type="button" className="link-btn" onClick={() => setSheet({ kind: 'add' })}>+ Add a medicine</button>
        {current.length > 0 && <button type="button" className="link-btn" onClick={() => setSheet({ kind: 'stop' })}>Stopped taking one</button>}
      </div>

      {sheet?.kind === 'add' && <AddMedSheet profile={profile} onClose={() => setSheet(null)} onSaved={onChanged} />}
      {sheet?.kind === 'dose' && <DoseSheet profile={profile} meds={meds} med={sheet.med} onClose={() => setSheet(null)} onSaved={onChanged} />}
      {sheet?.kind === 'stop' && <StopSheet profile={profile} meds={current} onClose={() => setSheet(null)} onSaved={onChanged} />}
    </Card>
  )
}

function Sheet({ title, onClose, onSubmit, busy, err, children, submitLabel = 'Save' }) {
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="sheet" onSubmit={onSubmit}>
        <h3>{title}</h3>
        {children}
        {err && <p className="err">{err}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          {onSubmit && <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>}
        </div>
      </form>
    </div>
  )
}

// Now, formatted for a datetime-local input (local time, no seconds).
function localNow() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

// A saved moment, as a datetime-local value in the phone's time.
function toLocalInput(iso) {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function AddMedSheet({ profile, onClose, onSaved }) {
  const [f, setF] = useState({ started_on: today() })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (!f.name?.trim()) { setErr('What is the medicine called?'); return }
    setBusy(true); setErr('')
    try { await addMed(profile.id, f); onSaved?.(); onClose() } catch (x) { setErr(x.message || 'Couldn’t save.') } finally { setBusy(false) }
  }

  return (
    <Sheet title="Add a medicine" onClose={onClose} onSubmit={submit} busy={busy} err={err}>
      <label className="field"><span>Name</span>
        <input value={f.name || ''} onChange={set('name')} placeholder="Sumatriptan, Advil, vitamin D" autoFocus /></label>
      <div className="row2">
        <label className="field"><span>Dose</span>
          <input value={f.dose || ''} onChange={set('dose')} placeholder="50 mg" /></label>
        <label className="field"><span>How often</span>
          <input value={f.as_needed ? '' : (f.schedule || '')} onChange={set('schedule')} placeholder={f.as_needed ? 'As needed' : 'Twice a day'} disabled={f.as_needed} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={Boolean(f.as_needed)} onChange={set('as_needed')} /> Only when I need it</label>
      <div className="row2">
        <label className="field"><span>What it’s for</span>
          <input value={f.reason || ''} onChange={set('reason')} placeholder="Migraine" /></label>
        <label className="field"><span>Started</span>
          <input type="date" value={f.started_on || ''} onChange={set('started_on')} /></label>
      </div>
      <label className="field"><span>Notes</span><textarea rows={2} value={f.notes || ''} onChange={set('notes')} /></label>
    </Sheet>
  )
}

// One dose. With `med` it's that medicine; without, pick from the list or type one.
// `existing` is a saved dose to edit (from the Logbook); saving updates it,
// and the earlier version stays in the change history.
export function DoseSheet({ profile, meds, med, existing, onClose, onSaved }) {
  const current = meds.filter(isCurrent)
  const [pick, setPick] = useState(med || (existing && meds.find((m) => m.id === existing.medication_id)) || null)
  const [f, setF] = useState(existing
    ? { name: existing.name, dose: existing.dose || '', notes: existing.notes || '', taken_at: toLocalInput(existing.taken_at) }
    : { dose: med?.dose || '', taken_at: localNow() })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const choose = (m) => { setPick(m); setF((x) => ({ ...x, dose: m?.dose || '' })) }

  async function submit(e) {
    e.preventDefault()
    const name = pick?.name || f.name?.trim()
    if (!name) { setErr('Which medicine?'); return }
    const at = new Date(f.taken_at)
    if (Number.isNaN(at.getTime())) { setErr('Check the time.'); return }
    if (at > new Date(Date.now() + 5 * 60000)) { setErr('That time is in the future.'); return }
    setBusy(true); setErr('')
    try {
      if (existing) {
        const { error } = await supabase.from('med_doses').update({
          medication_id: pick?.id || null, name, dose: f.dose?.trim() || null, notes: f.notes?.trim() || null, taken_at: at.toISOString(),
        }).eq('id', existing.id).eq('profile_id', profile.id)
        if (error) throw error
      } else {
        await logDose(profile.id, { medication_id: pick?.id, name, dose: f.dose, notes: f.notes, taken_at: at })
      }
      onSaved?.(); onClose()
    } catch (x) { setErr(x.message || 'Couldn’t save.') } finally { setBusy(false) }
  }

  return (
    <Sheet title={existing ? 'Edit medicine taken' : pick ? `Took ${pick.name}` : 'Medicine taken'} onClose={onClose} onSubmit={submit} busy={busy} err={err}>
      {!med && (
        <label className="field"><span>Which one?</span>
          <div className="chips">
            {current.map((m) => (
              <button type="button" key={m.id} className="chip" aria-pressed={pick?.id === m.id} onClick={() => choose(m)}>{m.name}</button>
            ))}
            <button type="button" className="chip" aria-pressed={!pick} onClick={() => choose(null)}>Something else</button>
          </div>
        </label>
      )}
      {!pick && (
        <label className="field"><span>Name</span>
          <input value={f.name || ''} onChange={set('name')} placeholder="Ibuprofen" autoFocus={!current.length} /></label>
      )}
      <div className="row2">
        <label className="field"><span>Dose</span><input value={f.dose} onChange={set('dose')} placeholder="200 mg" /></label>
        <label className="field"><span>When</span><input type="datetime-local" value={f.taken_at} onChange={set('taken_at')} /></label>
      </div>
      <label className="field"><span>Notes</span>
        <textarea rows={2} value={f.notes || ''} onChange={set('notes')} placeholder="Helped after an hour, half a tablet…" /></label>
    </Sheet>
  )
}

function StopSheet({ profile, meds, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function stop(m) {
    if (!confirm(`Mark ${m.name} as stopped today? It stays in your record.`)) return
    setBusy(true); setErr('')
    try { await stopMed(profile.id, m.id); onSaved?.(); onClose() } catch (x) { setErr(x.message || 'Couldn’t save.') } finally { setBusy(false) }
  }
  return (
    <Sheet title="Which one did you stop?" onClose={onClose} busy={busy} err={err}>
      <p className="note" style={{ marginTop: 0 }}>It moves off your current list. Past doses and dates stay in your record.</p>
      <div className="chips">
        {meds.map((m) => <button type="button" key={m.id} className="chip" disabled={busy} onClick={() => stop(m)}>{m.name}</button>)}
      </div>
    </Sheet>
  )
}
