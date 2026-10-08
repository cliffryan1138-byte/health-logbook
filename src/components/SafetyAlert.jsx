import { useEffect, useRef, useState } from 'react'
import { onSafety, cachedPregnancy, threshold, saveVitals, checkReading } from '../lib/pregnancy'
import { SIGNS, SIGNS_INTRO, SIGNS_OUTRO, SIGNS_SOURCE } from '../lib/warningSigns'
import { openCrisis } from '../lib/crisis'
import { useAuth } from '../context/AuthContext'

// Pregnancy safety (WG-PLAN-HEALTH-002, workstream 9; ground rule 5). Mounted
// once in App, above everything, like the 988 card. Everything it shows ships
// with the app or sits in the phone's copy, so it works with no network.
//
//   severe — a blood pressure in ACOG's severe range while pregnant or in the
//            postpartum year: Call 911, call your OB or midwife, the CDC
//            warning signs, and a second reading after 15 minutes, as ACOG's
//            algorithm says. Both readings are recorded.
//   signs  — the CDC Urgent Maternal Warning Signs list, word for word.
//
// Daybook records and quotes; it does not diagnose. The words here are the
// sources' own, with their names and links.

const RECHECK_SEC = 15 * 60

export default function SafetyAlert() {
  const { profile } = useAuth() || {}
  const [alert, setAlert] = useState(null) // { kind, reading?, because? }
  const [left, setLeft] = useState(RECHECK_SEC)
  const [second, setSecond] = useState({ sys: '', dia: '' })
  const [note, setNote] = useState('')
  const [showAll, setShowAll] = useState(false)
  const first = useRef(null)

  useEffect(() => onSafety((d) => {
    setAlert((cur) => {
      // A second severe reading while the alert is open keeps the same alert.
      if (cur?.kind === 'severe' && d.kind === 'signs') return cur
      return d
    })
    if (d.kind === 'severe') { setLeft(RECHECK_SEC); setSecond({ sys: '', dia: '' }); setNote(''); setShowAll(false) }
  }), [])

  useEffect(() => {
    if (alert?.kind !== 'severe') return
    const started = Date.now()
    const t = setInterval(() => setLeft(Math.max(0, RECHECK_SEC - Math.round((Date.now() - started) / 1000))), 1000)
    return () => clearInterval(t)
  }, [alert])

  useEffect(() => { if (alert) first.current?.focus() }, [alert])
  if (!alert) return null

  const p = cachedPregnancy()
  const doctor = p?.doctor_phone ? { name: p.doctor_name || 'my OB or midwife', tel: p.doctor_phone.replace(/[^\d+]/g, '') } : null
  const close = () => setAlert(null)

  async function saveSecond(e) {
    e.preventDefault()
    const sys = Number(second.sys), dia = Number(second.dia)
    if (!sys || !dia) { setNote('Type both numbers, top and bottom.'); return }
    const row = { bp_systolic: sys, bp_diastolic: dia, notes: 'Second reading, about 15 minutes after a reading in the severe range' }
    const level = checkReading(row)
    if (!profile) return
    const r = await saveVitals(profile.id, row)
    setNote(r.saved ? `Saved ${sys}/${dia}.` : r.queued ? `Kept ${sys}/${dia} on this phone; it saves when you’re back online.` : `Couldn’t save ${sys}/${dia}. Write it down.`)
    if (level !== 'severe') setSecond({ sys: '', dia: '' })
  }

  const severe = threshold('severe')
  const signsList = (
    <div className="signs">
      {SIGNS_INTRO.map((t) => <p key={t}>{t}</p>)}
      <ul>
        {SIGNS.map((s) => (
          <li key={s.title}>
            <b>{s.title}</b>
            {(showAll || alert.kind === 'signs') && (
              <ul>{s.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>
            )}
            {s.crisis && (showAll || alert.kind === 'signs') && (
              <button type="button" className="link-btn" onClick={openCrisis}>Talk to someone now: 988</button>
            )}
          </li>
        ))}
      </ul>
      {alert.kind === 'severe' && !showAll && (
        <button type="button" className="link-btn" onClick={() => setShowAll(true)}>Show what each sign looks like</button>
      )}
      <p>{SIGNS_OUTRO}</p>
      <p className="src">
        Source: <a href={SIGNS_SOURCE.url} target="_blank" rel="noreferrer">{SIGNS_SOURCE.publisher}, “{SIGNS_SOURCE.title}”</a>,
        updated {SIGNS_SOURCE.updated}, retrieved {SIGNS_SOURCE.retrieved}. {SIGNS_SOURCE.developedBy}
      </p>
    </div>
  )

  return (
    <div className="safety-scrim" role="dialog" aria-modal="true" aria-labelledby="safety-title">
      <div className={`safety ${alert.kind}`}>
        {alert.kind === 'severe' ? (
          <>
            <h2 id="safety-title">This blood pressure is in the severe range for pregnancy</h2>
            <p className="reading">{alert.reading.bp_systolic ?? '—'}/{alert.reading.bp_diastolic ?? '—'}</p>
            {severe && (
              <p className="quote">
                ACOG: a top number of {severe.systolic_at_least} or more, or a bottom number of {severe.diastolic_at_least} or
                more, “is {severe.label}.”
              </p>
            )}
            <div className="safety-actions">
              <a ref={first} className="btn crit" href="tel:911">Call 911</a>
              {doctor && <a className="btn" href={`tel:${doctor.tel}`}>Call {doctor.name}</a>}
            </div>

            <form className="recheck" onSubmit={saveSecond}>
              <h3>Second reading</h3>
              <p>
                ACOG’s guidance confirms a severe reading after 15 minutes.{' '}
                {left > 0 ? <>Recheck in <b>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</b>. Don’t wait to call if you have any of the signs below.</> : <b>Take your second reading now.</b>}
              </p>
              <div className="row2">
                <label className="field"><span>Top</span><input inputMode="numeric" value={second.sys} onChange={(e) => setSecond((s) => ({ ...s, sys: e.target.value }))} /></label>
                <label className="field"><span>Bottom</span><input inputMode="numeric" value={second.dia} onChange={(e) => setSecond((s) => ({ ...s, dia: e.target.value }))} /></label>
              </div>
              <button type="submit" className="btn ghost">Save second reading</button>
              {note && <p className="note" role="status">{note}</p>}
            </form>

            <h3>Warning signs (CDC)</h3>
            {signsList}
            {severe && (
              <p className="src">
                Thresholds: <a href={severe.source_url} target="_blank" rel="noreferrer">{severe.source_publisher}, “{severe.source_title}”</a> ({severe.source_year}),
                retrieved {severe.retrieved_on}. The source states it for {severe.source_applies}; Daybook checks {severe.daybook_applies.split(' (')[0].toLowerCase()}.
              </p>
            )}
          </>
        ) : (
          <>
            <h2 id="safety-title">Urgent maternal warning signs</h2>
            {alert.because && <p className="note">Shown because you logged “{alert.because}” while pregnant or in the year after birth.</p>}
            <div className="safety-actions">
              <a ref={first} className="btn crit" href="tel:911">Call 911</a>
              {doctor && <a className="btn" href={`tel:${doctor.tel}`}>Call {doctor.name}</a>}
            </div>
            {signsList}
          </>
        )}
        <button type="button" className="crisis-back" onClick={close}>Back to Daybook</button>
      </div>
    </div>
  )
}
