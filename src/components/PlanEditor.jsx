import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { shrinkToJpeg } from '../lib/images'
import { savePlan, WEEKDAYS } from '../lib/workouts'
import { PLAN_LIBRARY, PREGNANCY_GUIDANCE, RETRIEVED, draftFrom } from '../lib/planLibrary'

// Load a training plan: start from one of the built-in plans (lib/planLibrary,
// public-domain NIA exercises), read it from a PDF or photo (the read-plan
// function), or build it by hand — either way it lands in the same editor, and nothing
// is saved until Save. Saving makes it the active plan.

const MAX_PDF_MB = 8
const blankExercise = () => ({ name: '', sets: '', reps: '', rest_sec: '', cues: '' })
const blankDay = (n) => ({ title: `Day ${n}`, weekday: '', focus: '', notes: '', exercises: [blankExercise()] })

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

async function reasonOf(error) {
  try { return (await error?.context?.json?.())?.error || '' } catch { return '' }
}

// Plans usually start on a Monday.
function nextMonday() {
  const d = new Date()
  const add = (8 - d.getDay()) % 7
  d.setDate(d.getDate() + add)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export default function PlanEditor({ profile, onClose, onSaved }) {
  const fileRef = useRef(null)
  const [stage, setStage] = useState('start') // start | library | reading | edit
  const [draft, setDraft] = useState(null)
  const [source, setSource] = useState('manual')
  const [open, setOpen] = useState(0) // which day card is expanded
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const setPlan = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }))
  const setDay = (i, k) => (e) => setDraft((d) => ({ ...d, days: d.days.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) }))
  const setEx = (i, n, k) => (e) => setDraft((d) => ({
    ...d,
    days: d.days.map((x, j) => (j !== i ? x : { ...x, exercises: x.exercises.map((y, m) => (m === n ? { ...y, [k]: e.target.value } : y)) })),
  }))
  const addEx = (i) => setDraft((d) => ({ ...d, days: d.days.map((x, j) => (j === i ? { ...x, exercises: [...x.exercises, blankExercise()] } : x)) }))
  const dropEx = (i, n) => setDraft((d) => ({ ...d, days: d.days.map((x, j) => (j === i ? { ...x, exercises: x.exercises.filter((_, m) => m !== n) } : x)) }))
  const addDay = () => { setDraft((d) => ({ ...d, days: [...d.days, blankDay(d.days.length + 1)] })); setOpen(draft.days.length) }
  const dropDay = (i) => setDraft((d) => ({ ...d, days: d.days.filter((_, j) => j !== i) }))

  function startBlank() {
    setDraft({ name: '', description: '', weeks: '', started_on: nextMonday(), week_notes: [], days: [blankDay(1)] })
    setSource('manual'); setStage('edit')
  }

  function startFrom(entry) {
    setDraft(draftFrom(entry, nextMonday()))
    setSource('library'); setOpen(0); setStage('edit')
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    if (isPdf && file.size > MAX_PDF_MB * 1024 * 1024) { setErr(`That PDF is over ${MAX_PDF_MB} MB.`); return }
    setErr(''); setStage('reading')
    try {
      const body = isPdf
        ? { pdf_b64: await fileToBase64(file) }
        : { image_b64: await shrinkToJpeg(file, 2000), media_type: 'image/jpeg' }
      const { data, error } = await supabase.functions.invoke('read-plan', { body })
      if (error) throw new Error((await reasonOf(error)) || 'unreadable')
      if (!data?.days?.length) throw new Error(data?.page_note || 'No training days found in that file.')
      setDraft({
        name: data.name || '',
        description: data.description || '',
        weeks: data.weeks ?? '',
        started_on: nextMonday(),
        week_notes: (data.week_notes || []).map((w) => ({ week: w.week, text: w.text })),
        days: data.days.map((d, i) => ({
          title: d.title || `Day ${i + 1}`,
          weekday: d.weekday ?? '',
          focus: d.focus || '',
          notes: d.notes || '',
          exercises: (d.exercises || []).map((x) => ({
            name: x.name || '', sets: x.sets ?? '', reps: x.reps || '', rest_sec: x.rest_sec ?? '', cues: x.cues || '',
          })),
        })),
      })
      setSource(isPdf ? 'pdf' : 'photo'); setOpen(0); setStage('edit')
    } catch (e2) {
      setStage('start')
      setErr(e2?.message && e2.message !== 'unreadable' ? e2.message : 'Couldn’t read that file. Try a PDF, or build the plan by hand.')
    }
  }

  async function save() {
    if (!draft.days.some((d) => d.exercises.some((x) => x.name.trim()))) { setErr('Add at least one exercise.'); return }
    setBusy(true); setErr('')
    try {
      await savePlan(profile.id, draft, source)
      onSaved?.()
      onClose()
    } catch (e) {
      setErr(e.message || 'Couldn’t save the plan.')
    } finally { setBusy(false) }
  }

  const exCount = draft ? draft.days.reduce((a, d) => a + d.exercises.filter((x) => x.name.trim()).length, 0) : 0

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="sheet plan-sheet">
        <h3>{stage === 'edit' ? 'Check your plan' : 'Load a training plan'}</h3>
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" hidden onChange={onFile} />

        {stage === 'start' && (
          <>
            <p className="note" style={{ marginTop: 0 }}>
              Choose a PDF or a photo of your plan and Sparky turns it into days, exercises, sets and reps.
              You check it before anything is saved. Or build one yourself.
            </p>
            <div className="choose">
              <button type="button" className="choice" onClick={() => setStage('library')}>
                <span className="choice-text"><b>Start from a plan</b><span>Beginner, older adults, or getting back into it, from the National Institute on Aging</span></span>
              </button>
              <button type="button" className="choice" onClick={() => fileRef.current?.click()}>
                <span className="choice-text"><b>From a PDF or photo</b><span>Your coach’s or doctor’s plan, a printout, a screenshot</span></span>
              </button>
              <button type="button" className="choice" onClick={startBlank}>
                <span className="choice-text"><b>Build it by hand</b><span>Add days and exercises yourself</span></span>
              </button>
            </div>
            {err && <p className="err">{err}</p>}
            <div className="actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
          </>
        )}

        {stage === 'library' && (
          <>
            <p className="note" style={{ marginTop: 0 }}>
              Plans built from the National Institute on Aging’s exercises, in NIA’s own words, following its guidance on how often.
              The same for men and women: US guidelines don’t differ by sex. You can change anything before saving.
            </p>
            <div className="choose">
              {PLAN_LIBRARY.map((e) => {
                const days = e.plan.days.length
                return (
                  <button key={e.id} type="button" className="choice" onClick={() => startFrom(e)}>
                    <span className="choice-text">
                      <b>{e.plan.name}</b>
                      <span>{e.for} · {days} days a week{e.plan.weeks ? ` · ${e.plan.weeks} weeks` : ''}</span>
                      <span>{e.summary}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <details className="as-table lib-preg">
              <summary>Pregnant or recently had a baby?</summary>
              <p className="note">There’s no pregnancy plan here: no US government source gives one. Ask your OB or midwife what’s right for you. The US guidelines say:</p>
              {PREGNANCY_GUIDANCE.quotes.map((q) => <blockquote key={q}>“{q}”</blockquote>)}
              <p className="src">{PREGNANCY_GUIDANCE.quoteSource.publisher}, <a href={PREGNANCY_GUIDANCE.quoteSource.url} target="_blank" rel="noreferrer">{PREGNANCY_GUIDANCE.quoteSource.title}</a>, p. {PREGNANCY_GUIDANCE.quoteSource.page}.</p>
              <blockquote>“{PREGNANCY_GUIDANCE.avoid}”</blockquote>
              <blockquote>After the baby: “{PREGNANCY_GUIDANCE.afterBirth}”</blockquote>
              <p className="src">{PREGNANCY_GUIDANCE.factSheetSource.publisher}, <a href={PREGNANCY_GUIDANCE.factSheetSource.url} target="_blank" rel="noreferrer">{PREGNANCY_GUIDANCE.factSheetSource.title}</a>.</p>
            </details>
            <p className="src">Exercise text: National Institute on Aging, National Institutes of Health (public domain). Retrieved {RETRIEVED}.</p>
            <div className="actions"><button type="button" className="btn ghost" onClick={() => setStage('start')}>Back</button></div>
          </>
        )}

        {stage === 'reading' && (
          <div className="paper-reading">
            <img src="/sparky.png" alt="" width="64" height="64" />
            <p>Sparky is reading your plan… this can take a minute or two.</p>
          </div>
        )}

        {stage === 'edit' && draft && (
          <>
            {source === 'library' && (
              <p className="note" style={{ marginTop: 0 }}>
                {draft.description} Check the start date, change any day or exercise you like, then save. Each exercise’s steps are under “How to” during a workout.
              </p>
            )}
            {source !== 'manual' && source !== 'library' && (
              <p className="note" style={{ marginTop: 0 }}>
                Found {draft.days.length} days and {exCount} exercises. Check each day against your plan and fix anything wrong.
              </p>
            )}
            <label className="field"><span>Plan name</span><input value={draft.name} onChange={setPlan('name')} placeholder="The Three-Limb Protocol" /></label>
            <div className="row2">
              <label className="field"><span>Starts on</span><input type="date" value={draft.started_on} onChange={setPlan('started_on')} /></label>
              <label className="field"><span>Weeks</span><input inputMode="numeric" value={draft.weeks} onChange={setPlan('weeks')} placeholder="4" /></label>
            </div>

            {draft.days.map((d, i) => (
              <fieldset key={i} className="plan-day">
                <button type="button" className="plan-day-head" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                  <b>{d.title || `Day ${i + 1}`}</b>
                  <span>{d.weekday ? WEEKDAYS[d.weekday] : 'Any day'} · {(() => { const k = d.exercises.filter((x) => x.name.trim()).length; return `${k} exercise${k === 1 ? '' : 's'}` })()}</span>
                </button>
                {open === i && (
                  <div className="plan-day-body">
                    <label className="field"><span>Day name</span><input value={d.title} onChange={setDay(i, 'title')} /></label>
                    <div className="row2">
                      <label className="field"><span>On</span>
                        <select value={d.weekday} onChange={setDay(i, 'weekday')}>
                          <option value="">Any day (next in order)</option>
                          {WEEKDAYS.slice(1).map((w, k) => <option key={w} value={k + 1}>{w}</option>)}
                        </select></label>
                      <label className="field"><span>Focus</span><input value={d.focus} onChange={setDay(i, 'focus')} /></label>
                    </div>
                    {d.exercises.map((x, n) => (
                      <div key={n} className="plan-ex">
                        <label className="field"><span>Exercise {n + 1}</span><input value={x.name} onChange={setEx(i, n, 'name')} placeholder="Seated band row" /></label>
                        <div className="row3">
                          <label className="field"><span>Sets</span><input inputMode="numeric" value={x.sets} onChange={setEx(i, n, 'sets')} /></label>
                          <label className="field"><span>Reps</span><input value={x.reps} onChange={setEx(i, n, 'reps')} placeholder="12–15" /></label>
                          <label className="field"><span>Rest (s)</span><input inputMode="numeric" value={x.rest_sec} onChange={setEx(i, n, 'rest_sec')} /></label>
                        </div>
                        <label className="field"><span>Cues</span><textarea rows={2} value={x.cues} onChange={setEx(i, n, 'cues')} /></label>
                        <button type="button" className="link-btn" onClick={() => dropEx(i, n)}>Remove exercise</button>
                      </div>
                    ))}
                    <div className="actions">
                      <button type="button" className="btn ghost" onClick={() => addEx(i)}>Add exercise</button>
                      {draft.days.length > 1 && <button type="button" className="btn ghost" onClick={() => dropDay(i)}>Remove day</button>}
                    </div>
                  </div>
                )}
              </fieldset>
            ))}
            <button type="button" className="btn ghost more" onClick={addDay}>Add a day</button>

            {draft.week_notes.length > 0 && (
              <details className="as-table">
                <summary>Week-by-week notes ({draft.week_notes.length})</summary>
                {draft.week_notes.map((w, k) => (
                  <label key={k} className="field"><span>Week {w.week}</span>
                    <textarea rows={2} value={w.text} onChange={(e) => setDraft((d) => ({ ...d, week_notes: d.week_notes.map((y, m) => (m === k ? { ...y, text: e.target.value } : y)) }))} />
                  </label>
                ))}
              </details>
            )}

            {err && <p className="err">{err}</p>}
            <div className="actions">
              <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save plan'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
