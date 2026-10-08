import { useState } from 'react'
import { saveAnswers } from '../lib/followups'

// Sparky's follow-up card, shown right after a symptom is saved when the log
// has gaps (lib/followups.js, question bank v0.2). Every question can be
// skipped; Save or Skip all records what was asked either way, so the record
// shows the questions beside the answers. A "Yes" to a missed dose offers the
// dose form, filled in, for the person to save (decision C).

export default function FollowUps({ profile, symptom, questions, onDone, onLogDose }) {
  const [answers, setAnswers] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const key = (q, i) => `${q.id}-${i}`
  const set = (k, v) => setAnswers((a) => ({ ...a, [k]: a[k] === v ? '' : v }))

  async function finish(skipAll) {
    const items = questions.map((q, i) => {
      let a = skipAll ? '' : answers[key(q, i)] ?? ''
      if (q.kind === 'number' && a !== '') {
        const n = Number(a)
        a = Number.isFinite(n) && n >= q.min && n <= q.max ? n : ''
      }
      return { ...q, answer: a }
    })
    setBusy(true); setErr('')
    try {
      await saveAnswers(profile.id, symptom.id, items)
      const took = items.find((i) => i.id === 'dose_since' && i.answer === 'Yes')
      onDone()
      if (took) onLogDose?.(took.medication_id)
    } catch (x) {
      setErr(x.message || 'Couldn’t save the answers.')
    } finally { setBusy(false) }
  }

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && finish(true)}>
      <div className="sheet followups" role="dialog" aria-label="Sparky's questions">
        <div className="fu-head">
          <img src="/sparky.png" alt="" width="40" height="40" />
          <div>
            <h3>A few quick questions</h3>
            <p className="note" style={{ margin: 0 }}>About your {symptom.symptom.toLowerCase()}. Skip any you like; your answers are saved with it.</p>
          </div>
        </div>
        {questions.map((q, i) => {
          const k = key(q, i)
          return (
            <div key={k} className="fu-q">
              <p>{q.question}</p>
              {q.kind === 'choice' ? (
                <div className="chips" role="group" aria-label={q.question}>
                  {q.choices.map((c) => <button key={c} type="button" className="chip" aria-pressed={answers[k] === c} onClick={() => set(k, c)}>{c}</button>)}
                </div>
              ) : (
                <input className="fu-num" inputMode="decimal" aria-label={q.question} value={answers[k] ?? ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [k]: e.target.value }))} placeholder="Skip" />
              )}
            </div>
          )
        })}
        {err && <p className="err">{err}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => finish(true)} disabled={busy}>Skip all</button>
          <button type="button" className="btn" onClick={() => finish(false)} disabled={busy}>{busy ? 'Saving…' : 'Save answers'}</button>
        </div>
      </div>
    </div>
  )
}
