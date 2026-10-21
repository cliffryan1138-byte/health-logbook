import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { shrinkToJpeg } from '../lib/images'
import { savePlan, updatePlan, WEEKDAYS } from '../lib/workouts'
import { PLAN_LIBRARY, PREGNANCY_GUIDANCE, RETRIEVED, draftFrom } from '../lib/planLibrary'

// Load a training plan: start from one of the built-in plans (lib/planLibrary,
// public-domain NIA exercises), read it from a PDF or photo (the read-plan
// function), or build it by hand — either way it lands in the same editor, and nothing
// is saved until Save. Saving makes it the active plan.
//
// A plan often comes as several screenshots. Choose them together and they're
// read as one plan; or read one, then "Add more pictures" to append the rest.
// A tester's second screenshot used to be dropped because only one was taken.
//
// With `plan` (the active plan) it opens straight on the editor to change that
// plan in place: rename or remove a day, fix an exercise. Testers ended up
// with a stray day and the only way out was loading the whole plan again.

const MAX_PDF_MB = 8
const MAX_PICTURES = 6 // matches read-plan's MAX_IMAGES
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

// read-plan's days -> editor days.
const toDays = (days) => (days || []).map((d, i) => ({
  title: d.title || `Day ${i + 1}`,
  weekday: d.weekday ?? '',
  focus: d.focus || '',
  notes: d.notes || '',
  exercises: (d.exercises || []).map((x) => ({
    name: x.name || '', sets: x.sets ?? '', reps: x.reps || '', rest_sec: x.rest_sec ?? '', cues: x.cues || '',
  })),
}))

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

// The active plan -> editor draft. Days keep their ids so updatePlan can keep them.
const fromPlan = (plan) => ({
  name: plan.name || '',
  description: plan.description || '',
  weeks: plan.weeks ?? '',
  started_on: plan.started_on || '',
  week_notes: (plan.week_notes || []).map((w) => ({ week: w.week, text: w.text })),
  days: plan.days.map((d, i) => ({
    id: d.id,
    title: d.title || `Day ${i + 1}`,
    weekday: d.weekday ?? '',
    focus: d.focus || '',
    notes: d.notes || '',
    exercises: d.exercises.length
      ? d.exercises.map((x) => ({ name: x.name || '', sets: x.sets ?? '', reps: x.reps || '', rest_sec: x.rest_sec ?? '', cues: x.cues || '' }))
      : [blankExercise()],
  })),
})

export default function PlanEditor({ profile, plan, onClose, onSaved }) {
  const fileRef = useRef(null)
  const [stage, setStage] = useState(plan ? 'edit' : 'start') // start | library | reading | edit
  const [draft, setDraft] = useState(() => (plan ? fromPlan(plan) : null))
  const [source, setSource] = useState(plan ? 'existing' : 'manual')
  const [open, setOpen] = useState(plan ? -1 : 0) // which day card is expanded
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
  const dropDay = (i) => {
    const d = draft.days[i]
    if (!confirm(`Remove “${d.title || `Day ${i + 1}`}” from this plan?${plan && d.id ? ' Workouts you already finished stay in your log.' : ''}`)) return
    setDraft((x) => ({ ...x, days: x.days.filter((_, j) => j !== i) }))
    setOpen(-1)
  }

  function startBlank() {
    setDraft({ name: '', description: '', weeks: '', started_on: nextMonday(), week_notes: [], days: [blankDay(1)] })
    setSource('manual'); setStage('edit')
  }

  function startFrom(entry) {
    setDraft(draftFrom(entry, nextMonday()))
    setSource('library'); setOpen(0); setStage('edit')
  }

  // `adding` = these pictures continue the plan already in the editor.
  const [adding, setAdding] = useState(false)
  const [reading, setReading] = useState(0)
  const pick = (more) => { setAdding(more); fileRef.current?.click() }

  async function onFile(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
    const pdf = files.find(isPdf)
    const pics = files.filter((f) => !isPdf(f))
    if (pdf && (pics.length || files.length > 1)) { setErr('Choose one PDF at a time, or pictures.'); return }
    if (pdf && pdf.size > MAX_PDF_MB * 1024 * 1024) { setErr(`That PDF is over ${MAX_PDF_MB} MB.`); return }
    if (pics.length > MAX_PICTURES) { setErr(`Up to ${MAX_PICTURES} pictures at a time. Choose the first ${MAX_PICTURES}, then Add more pictures.`); return }
    const back = adding ? 'edit' : 'start'
    setErr(''); setReading(pdf ? 1 : pics.length); setStage('reading')
    try {
      // Several pictures go smaller so the upload stays quick on cellular.
      const size = pics.length > 2 ? 1568 : 2000
      const images = pdf ? [] : await Promise.all(pics.map((f) => shrinkToJpeg(f, size)))
      // image_b64 too, so a read-plan deployed before images_b64 still reads the first.
      const body = pdf
        ? { pdf_b64: await fileToBase64(pdf) }
        : { images_b64: images, image_b64: images[0], media_type: 'image/jpeg' }
      const { data, error } = await supabase.functions.invoke('read-plan', { body })
      if (error) throw new Error((await reasonOf(error)) || 'unreadable')
      if (!data?.days?.length) throw new Error(data?.page_note || 'No training days found in that file.')
      if (adding && draft) {
        setDraft((d) => ({
          ...d,
          name: d.name || data.name || '',
          description: d.description || data.description || '',
          weeks: d.weeks || (data.weeks ?? ''),
          week_notes: d.week_notes.length ? d.week_notes : (data.week_notes || []).map((w) => ({ week: w.week, text: w.text })),
          days: [...d.days, ...toDays(data.days)],
        }))
        setOpen(draft.days.length)
      } else {
        setDraft({
          name: data.name || '',
          description: data.description || '',
          weeks: data.weeks ?? '',
          started_on: nextMonday(),
          week_notes: (data.week_notes || []).map((w) => ({ week: w.week, text: w.text })),
          days: toDays(data.days),
        })
        setSource(pdf ? 'pdf' : 'photo'); setOpen(0)
      }
      setStage('edit')
    } catch (e2) {
      setStage(back)
      setErr(e2?.message && e2.message !== 'unreadable' ? e2.message : 'Couldn’t read that file. Try a PDF, or build the plan by hand.')
    }
  }

  async function save() {
    if (!draft.days.some((d) => d.exercises.some((x) => x.name.trim()))) { setErr('Add at least one exercise.'); return }
    setBusy(true); setErr('')
    try {
      if (plan) await updatePlan(profile.id, plan, draft)
      else await savePlan(profile.id, draft, source)
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
        <h3>{plan ? 'Edit your plan' : stage === 'edit' ? 'Check your plan' : 'Load a training plan'}</h3>
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" multiple hidden onChange={onFile} />

        {stage === 'start' && (
          <>
            <p className="note" style={{ marginTop: 0 }}>
              Choose a PDF, or one or more photos or screenshots of your plan, and Sparky turns it into days,
              exercises, sets and reps. You check it before anything is saved. Or build one yourself.
            </p>
            <div className="choose">
              <button type="button" className="choice" onClick={() => setStage('library')}>
                <span className="choice-text"><b>Start from a plan</b><span>Beginner, older adults, or getting back into it, from the National Institute on Aging</span></span>
              </button>
              <button type="button" className="choice" onClick={() => pick(false)}>
                <span className="choice-text"><b>From a PDF or pictures</b><span>Your coach’s or doctor’s plan, a printout, screenshots — pick them all at once</span></span>
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
            <p>Sparky is reading {reading > 1 ? `your ${reading} pictures` : 'your plan'}… this can take a minute or two.</p>
          </div>
        )}

        {stage === 'edit' && draft && (
          <>
            {source === 'library' && (
              <p className="note" style={{ marginTop: 0 }}>
                {draft.description} Check the start date, change any day or exercise you like, then save. Each exercise’s steps are under “How to” during a workout.
              </p>
            )}
            {plan && (
              <p className="note" style={{ marginTop: 0 }}>
                Tap a day to rename it, change its exercises or remove it. Your finished workouts aren’t changed.
              </p>
            )}
            {source !== 'manual' && source !== 'library' && source !== 'existing' && (
              <p className="note" style={{ marginTop: 0 }}>
                Found {draft.days.length} days and {exCount} exercises. Check each day against your plan and fix anything wrong.
                {' '}Missing part of it? Add more pictures below.
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
            <div className="actions">
              <button type="button" className="btn ghost" onClick={addDay}>Add a day</button>
              <button type="button" className="btn ghost" onClick={() => pick(true)}>Add more pictures</button>
            </div>

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
              <button type="button" className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : plan ? 'Save changes' : 'Save plan'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
