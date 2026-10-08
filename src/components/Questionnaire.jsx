import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { openCrisis } from '../lib/crisis'
import { FORMS, OPTIONS, DIFFICULTY, band } from '../lib/questionnaires'

// One PHQ-9 or GAD-7, every question on one sheet. Saved exactly as answered.
// PHQ-9 question 9 opens the 988 card the moment any answer other than
// "Not at all" is tapped, before anything is saved.
export default function Questionnaire({ profile, kind, onClose, onSaved }) {
  const form = FORMS[kind]
  const [answers, setAnswers] = useState(Array(form.items.length).fill(null))
  const [difficulty, setDifficulty] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  function answer(i, v) {
    setAnswers((a) => a.map((x, j) => (j === i ? v : x)))
    if (i === form.crisisItem && v > 0) openCrisis()
  }

  async function save(e) {
    e.preventDefault()
    const missing = answers.findIndex((a) => a == null)
    if (missing >= 0) { setErr(`Question ${missing + 1} still needs an answer.`); return }
    const score = answers.reduce((s, a) => s + a, 0)
    setBusy(true); setErr('')
    const { error } = await supabase.from('assessments').insert({ profile_id: profile.id, kind, answers, score, difficulty })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved?.()
    setResult(score)
  }

  if (result != null) {
    return (
      <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="sheet" role="dialog" aria-label={`${form.name} result`}>
          <h3>{form.name} saved</h3>
          <p className="q-score"><b>{result}</b> of {form.max} · {band(kind, result)}</p>
          <p className="note">A screening score, not a diagnosis. It’s worth sharing with your doctor, especially if it changes.</p>
          <div className="actions"><button type="button" className="btn" onClick={onClose}>Done</button></div>
        </div>
      </div>
    )
  }

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={save} aria-label={form.name}>
        <h3>{form.name}: {form.about}</h3>
        <p className="note q-stem">{form.stem}</p>
        <ol className="q-list">
          {form.items.map((item, i) => (
            <li key={i}>
              <p id={`q-${kind}-${i}`}>{item}</p>
              <div className="q-opts" role="group" aria-labelledby={`q-${kind}-${i}`}>
                {OPTIONS.map((o, v) => (
                  <button type="button" key={v} className="chip" aria-pressed={answers[i] === v} onClick={() => answer(i, v)}>{o}</button>
                ))}
              </div>
            </li>
          ))}
        </ol>
        {kind === 'phq9' && (
          <div className="field">
            <span>If you checked off any problems, how difficult have these problems made it for you to do your work, take care of things at home, or get along with other people? (optional)</span>
            <div className="chips">
              {DIFFICULTY.map(([k, l]) => (
                <button type="button" key={k} className="chip" aria-pressed={difficulty === k}
                  onClick={() => setDifficulty(difficulty === k ? null : k)}>{l}</button>
              ))}
            </div>
          </div>
        )}
        {err && <p className="err">{err}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
