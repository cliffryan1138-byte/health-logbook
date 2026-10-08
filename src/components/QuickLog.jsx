import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icon from '../lib/icons'
import PaperNotes from './PaperNotes'
import { DoseSheet } from './Medications'
import SymptomPicker from './SymptomPicker'
import CheckIn from './CheckIn'
import Questionnaire from './Questionnaire'
import Meditation from './Meditation'
import { checkReading, checkSymptom, saveVitals } from '../lib/pregnancy'
import { mentionsCrisis } from '../lib/crisis'
import { questionsFor } from '../lib/followups'
import FollowUps from './FollowUps'

// v1 quick-log: fast manual forms, and the dock that opens them.
//
// RECOVERY NOTE: the header above, the SYMPTOMS list and the component
// signature are the original file, recovered from the Vercel deployment. The
// forms and submit handlers were lost to a response limit and are rebuilt
// against the live database schema, so every field and every CHECK constraint
// below matches the real columns.
//
// Voice moved to SparkyChat (2026-10-07): "Talk it through" used to save the
// raw transcript as a meal; now the mic opens a conversation with Sparky, who
// drafts proper entries of any kind.
//
// Pictures followed the same day: "Take a picture" opens the camera (or photo
// library) and hands the photo to Sparky, who works out what it is — a meal, a
// medicine label, a meter reading, a rash, paper notes — and drafts what fits.
// Testers couldn't photograph their medicine when the camera only knew food.
// Old notes and PDF logs keep their own importer under Add manually.
// The symptom list itself lives in lib/symptoms.js (the symptom library,
// WG-PLAN-HEALTH-002 workstream 1).

const CHOICES = [
  { kind: 'checkin', icon: 'moon', label: 'Daily check-in', hint: 'Sleep, mood, water, caffeine, alcohol, how the day went' },
  { kind: 'meal', icon: 'flame', label: 'Meal or drink', hint: 'What you ate, with calories if you know them' },
  { kind: 'symptom', icon: 'pulse', label: 'Symptom', hint: 'Anything you feel: search the list or type your own' },
  { kind: 'vitals', icon: 'drop', label: 'Vitals', hint: 'Weight, blood sugar, blood pressure, sleep' },
  { kind: 'dose', icon: 'pill', label: 'Medicine taken', hint: 'A dose of something on your list, or anything else' },
  { kind: 'exercise', icon: 'dumbbell', label: 'Exercise', hint: 'Walk, weights, bike…' },
  { kind: 'phq9', icon: 'mind', label: 'Mood check-up (PHQ-9)', hint: 'Nine questions about the last two weeks' },
  { kind: 'gad7', icon: 'mind', label: 'Anxiety check-up (GAD-7)', hint: 'Seven questions about the last two weeks' },
  { kind: 'meditation', icon: 'leaf', label: 'Meditation', hint: 'Minutes, kind, mood before and after' },
  { kind: 'paper', icon: 'camera', label: 'Old notes or PDF log', hint: 'Photo of paper notes, or a PDF from another app' },
  { kind: 'talk', icon: 'mic', label: 'Talk to Sparky', hint: 'Say what happened; Sparky drafts the entries' },
]

// One tap each, written into the entry's notes: the details a headache diary
// for a doctor asks for, without typing.
const HEADACHE_DETAILS = ['One side', 'Both sides', 'Behind the eyes', 'Throbbing', 'Pressure', 'Stabbing',
  'Aura', 'Nausea', 'Light hurts', 'Noise hurts', 'Dizzy', 'Woke up with it']
const SEVERITY_WORDS = ['', 'Mild', 'Noticeable', 'Medium', 'Bad', 'Worst ever']

const GLUCOSE_CONTEXTS = ['fasting', 'post-breakfast', 'post-lunch', 'post-dinner', 'random']
const INTENSITIES = ['easy', 'moderate', 'hard']

// Choices that open their own component instead of a form in this sheet.
const OWN_SHEETS = ['paper', 'dose', 'checkin', 'phq9', 'gad7', 'meditation']

const SHEETS = {
  choose: 'What are you adding?',
  meal: 'Log a meal',
  vitals: 'Log vitals',
  exercise: 'Log exercise',
  symptom: 'Log a symptom',
}

// Editing from the Logbook (swipe right or tap Edit): which form opens for
// each kind of entry, and how a saved row fills it. Saving updates the row;
// the database keeps the earlier version in the change history and marks
// the entry edited (migration 0003).
const EDIT_SHEET = { meals: 'meal', vitals: 'vitals', exercise: 'exercise', symptoms: 'symptom', med_doses: 'dose' }
export const canEdit = (kind) => Boolean(EDIT_SHEET[kind])
const asText = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v == null ? '' : v]))

export default function QuickLog({ profile, meds = [], onLogged, openKind, onOpenChange, onTalk, onPicture, editEntry, onEditDone }) {
  const [openInner, setOpenInner] = useState(null) // 'meal' | 'vitals' | 'exercise' | 'symptom' | 'dose'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({})
  const [editing, setEditing] = useState(null) // { kind, row } while editing a saved entry
  const [followUp, setFollowUp] = useState(null) // { symptom, questions } after a new symptom is saved
  const [doseFor, setDoseFor] = useState(null) // a medicine to log a dose of, from a follow-up "Yes"
  const fileRef = useRef(null)

  // Dashboard can drive the sheet from its "→ log a weigh-in" links; when it
  // doesn't, the dock manages its own state.
  const open = openKind !== undefined ? openKind : openInner
  const setOpen = (k) => { setOpenInner(k); onOpenChange?.(k) }

  // Meals, vitals and exercise carry a "when" (form.at), now by default and
  // changeable, so something from earlier can be logged at its real time.
  const TIMED = { meal: 'eaten_at', vitals: 'taken_at', exercise: 'done_at' }
  function openSheet(kind) {
    setEditing(null)
    setForm(kind === 'symptom' ? { felt_at: localNow() } : TIMED[kind] ? { at: localNow() } : {})
    setErr(''); setOpen(kind)
  }
  function close() { setOpen(null); if (editing) { setEditing(null); onEditDone?.() } }

  useEffect(() => {
    if (!editEntry || !EDIT_SHEET[editEntry.kind]) return
    const row = editEntry.row
    setEditing(editEntry); setErr('')
    const timeCol = TIMED[EDIT_SHEET[editEntry.kind]]
    if (editEntry.kind === 'symptoms') setForm({ ...asText(row), felt_at: toLocalInput(row.felt_at), details: [] })
    else setForm({ ...asText(row), ...(timeCol ? { at: toLocalInput(row[timeCol]) } : {}) })
    setOpen(EDIT_SHEET[editEntry.kind])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editEntry])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // Any photo goes to Sparky. No `capture` attribute on the input, so phones
  // offer Take Photo or Photo Library.
  function onPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onPicture?.(file)
  }

  async function save(table, row) {
    setBusy(true); setErr('')
    const { data, error } = editing
      ? await supabase.from(table).update(row).eq('id', editing.row.id).eq('profile_id', profile.id).select().single()
      : await supabase.from(table).insert({ ...row, profile_id: profile.id }).select().single()
    setBusy(false)
    if (error) { setErr(error.message); return null }
    close()
    onLogged?.()
    return data
  }

  // After a new symptom: Sparky's follow-up questions about gaps in the log
  // (lib/followups.js). Not when the 988 card or the pregnancy warning signs
  // came up for it: those come first and nothing is stacked on them.
  async function askFollowUps(saved, safetyShown) {
    if (!saved || safetyShown) return
    try {
      const questions = await questionsFor(profile.id, saved)
      if (questions.length) setFollowUp({ symptom: saved, questions })
    } catch { /* no questions is fine */ }
  }

  // Blood pressure is checked on the phone before saving: a reading in the
  // severe range during pregnancy or the year after opens the alert at once,
  // even if the save then fails. With no connection the reading waits on the
  // phone and saves later.
  async function saveReading(row) {
    if (editing) { checkReading(row); return save('vitals', row) }
    checkReading(row)
    setBusy(true); setErr('')
    const r = await saveVitals(profile.id, row)
    setBusy(false)
    if (r.saved) { close(); onLogged?.(); return }
    setErr(r.queued ? 'No connection. This reading is kept on your phone and saves when you’re back online.' : (r.error?.message || 'Couldn’t save.'))
  }

  async function submit(e) {
    e.preventDefault()
    let at = null
    if (TIMED[open]) {
      const d = form.at ? new Date(form.at) : new Date()
      if (Number.isNaN(d.getTime())) { setErr('Check the time.'); return }
      if (d > new Date(Date.now() + 5 * 60000)) { setErr('That time is in the future.'); return }
      at = d.toISOString()
    }
    if (open === 'meal') {
      if (!form.description?.trim()) { setErr('Give the meal a short description.'); return }
      save('meals', {
        description: form.description.trim(),
        calories: num(form.calories),
        protein_g: num(form.protein_g),
        carbs_g: num(form.carbs_g),
        sugar_g: num(form.sugar_g),
        fiber_g: num(form.fiber_g),
        fat_g: num(form.fat_g),
        sodium_mg: num(form.sodium_mg),
        confidence: form.confidence || null,
        source: form.source || 'manual',
        trigger_watch: [...new Set([...(form.trigger_watch || []), ...matchTriggers(form.description, profile.watch_list)])],
        notes: form.notes?.trim() || null,
        eaten_at: at,
      })
    } else if (open === 'vitals') {
      saveReading({
        weight_lb: num(form.weight_lb),
        glucose_mgdl: num(form.glucose_mgdl),
        glucose_context: form.glucose_mgdl ? (form.glucose_context || 'random') : null,
        bp_systolic: num(form.bp_systolic),
        bp_diastolic: num(form.bp_diastolic),
        heart_rate: num(form.heart_rate),
        sleep_hr: num(form.sleep_hr),
        energy_1_5: num(form.energy_1_5),
        mood_1_5: num(form.mood_1_5),
        waist_in: num(form.waist_in),
        notes: form.notes?.trim() || null,
        taken_at: at,
      })
    } else if (open === 'exercise') {
      if (!form.activity?.trim()) { setErr('What was the activity?'); return }
      save('exercise', {
        activity: form.activity.trim(),
        duration_min: num(form.duration_min),
        intensity: form.intensity || null,
        notes: form.notes?.trim() || null,
        done_at: at,
      })
    } else if (open === 'symptom') {
      if (!form.symptom) { setErr('Pick a symptom.'); return }
      // No silent default: a guessed 3 would read as the person's own rating.
      if (!form.severity_1_5) { setErr('Tap how bad it is, 1 to 5.'); return }
      const felt = form.felt_at ? new Date(form.felt_at) : new Date()
      if (Number.isNaN(felt.getTime())) { setErr('Check the start time.'); return }
      if (felt > new Date(Date.now() + 5 * 60000)) { setErr('That start time is in the future.'); return }
      const sick = form.symptom === 'Morning sickness'
        ? [form.vomits !== undefined && form.vomits !== '' && `Threw up ${form.vomits} time${Number(form.vomits) === 1 ? '' : 's'} today`,
            form.fluids && `Keeping fluids down: ${form.fluids}`].filter(Boolean).join('. ')
        : ''
      const notes = [(form.details || []).join(', '), sick, form.notes?.trim()].filter(Boolean).join('. ')
      // During pregnancy, a headache, vision change or upper-belly pain brings
      // up the CDC warning signs, before (and whether or not) it saves.
      const signs = checkSymptom({ symptom: form.symptom, notes, felt_at: felt })
      const crisis = mentionsCrisis(`${form.symptom} ${notes} ${form.suspected_trigger || ''}`)
      const isNew = !editing
      const saved = await save('symptoms', {
        symptom: form.symptom,
        body_group: form.body_group || null,
        severity_1_5: Number(form.severity_1_5),
        duration_hr: num(form.duration_hr),
        suspected_trigger: form.suspected_trigger?.trim() || null,
        notes: notes || null,
        felt_at: felt.toISOString(),
      })
      if (isNew) askFollowUps(saved, signs || crisis)
    }
  }

  return (
    <>
      {/* Two plain choices instead of a row of unlabeled icons, plus the mic. */}
      <div className="dock">
        {/* The file picker must open inside this tap, or phones block it. */}
        <button className="photo" onClick={() => fileRef.current?.click()}>
          <Icon name="camera" /> <span className="long">Take a picture</span><span className="short">Picture</span>
        </button>
        <button className="manual" onClick={() => openSheet('choose')}>
          <Icon name="pen" /> <span className="long">Add manually</span><span className="short">Add</span>
        </button>
        <button className="talk" onClick={() => onTalk?.()} aria-label="Talk to Sparky" title="Talk to Sparky">
          <Icon name="mic" />
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
      </div>

      {open === 'paper' && (
        <PaperNotes profile={profile} onClose={close} onSaved={() => onLogged?.()} />
      )}

      {(open === 'phq9' || open === 'gad7') && (
        <Questionnaire profile={profile} kind={open} onClose={close} onSaved={() => onLogged?.()} />
      )}

      {open === 'meditation' && (
        <Meditation profile={profile} onClose={close} onSaved={() => onLogged?.()} />
      )}

      {open === 'checkin' && (
        <CheckIn profile={profile} onClose={close} onSaved={() => onLogged?.()} />
      )}

      {followUp && (
        <FollowUps profile={profile} symptom={followUp.symptom} questions={followUp.questions}
          onDone={() => { setFollowUp(null); onLogged?.() }}
          onLogDose={(id) => setDoseFor(meds.find((m) => m.id === id) || null)} />
      )}
      {doseFor && (
        <DoseSheet profile={profile} meds={meds} med={doseFor} onClose={() => setDoseFor(null)} onSaved={() => onLogged?.()} />
      )}

      {open === 'dose' && (
        <DoseSheet profile={profile} meds={meds} existing={editing?.kind === 'med_doses' ? editing.row : null}
          onClose={close} onSaved={() => onLogged?.()} />
      )}

      {open && !OWN_SHEETS.includes(open) && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && close()}>
          <form className="sheet" onSubmit={submit}>
            <h3>{editing ? SHEETS[open].replace(/^Log (a |an )?/, 'Edit ') : SHEETS[open]}</h3>
            {editing && <p className="note" style={{ marginTop: -8 }}>The earlier version stays in your record’s change history.</p>}

            {open === 'choose' && (
              <div className="choose">
                {CHOICES.map((c) => (
                  <button type="button" key={c.kind} className="choice"
                    // Talking opens Sparky; the mic must start inside this tap.
                    onClick={() => { if (c.kind === 'talk') { close(); onTalk?.() } else openSheet(c.kind) }}>
                    <span className="choice-ico"><Icon name={c.icon} /></span>
                    <span className="choice-text"><b>{c.label}</b><span>{c.hint}</span></span>
                  </button>
                ))}
              </div>
            )}

            {open === 'meal' && (
              <>
                <Field label="What did you eat?">
                  <input value={form.description || ''} onChange={set('description')} placeholder="Two eggs, toast, black coffee" autoFocus />
                </Field>
                <Field label="When did you eat it?"><input type="datetime-local" value={form.at || ''} onChange={set('at')} /></Field>
                <div className="row2">
                  <Field label="Calories"><input inputMode="numeric" value={form.calories || ''} onChange={set('calories')} /></Field>
                  <Field label="Protein (g)"><input inputMode="numeric" value={form.protein_g || ''} onChange={set('protein_g')} /></Field>
                </div>
                <div className="row2">
                  <Field label="Sugar (g)"><input inputMode="numeric" value={form.sugar_g || ''} onChange={set('sugar_g')} /></Field>
                  <Field label="Fiber (g)"><input inputMode="numeric" value={form.fiber_g || ''} onChange={set('fiber_g')} /></Field>
                </div>
                <div className="row2">
                  <Field label="Carbs (g)"><input inputMode="numeric" value={form.carbs_g || ''} onChange={set('carbs_g')} /></Field>
                  <Field label="Fat (g)"><input inputMode="numeric" value={form.fat_g || ''} onChange={set('fat_g')} /></Field>
                </div>
                <Field label="Notes"><textarea rows={2} value={form.notes || ''} onChange={set('notes')} /></Field>
              </>
            )}

            {open === 'vitals' && (
              <>
                <div className="row2">
                  <Field label="Weight (lb)"><input inputMode="decimal" value={form.weight_lb || ''} onChange={set('weight_lb')} autoFocus /></Field>
                  <Field label="Waist (in)"><input inputMode="decimal" value={form.waist_in || ''} onChange={set('waist_in')} /></Field>
                </div>
                <div className="row2">
                  <Field label="Glucose (mg/dL)"><input inputMode="numeric" value={form.glucose_mgdl || ''} onChange={set('glucose_mgdl')} /></Field>
                  <Field label="Before or after a meal?">
                    <select value={form.glucose_context || 'fasting'} onChange={set('glucose_context')}>
                      {GLUCOSE_CONTEXTS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="row2">
                  <Field label="BP systolic"><input inputMode="numeric" value={form.bp_systolic || ''} onChange={set('bp_systolic')} /></Field>
                  <Field label="BP diastolic"><input inputMode="numeric" value={form.bp_diastolic || ''} onChange={set('bp_diastolic')} /></Field>
                </div>
                <div className="row2">
                  <Field label="Sleep (hr)"><input inputMode="decimal" value={form.sleep_hr || ''} onChange={set('sleep_hr')} /></Field>
                  <Field label="Heart rate"><input inputMode="numeric" value={form.heart_rate || ''} onChange={set('heart_rate')} /></Field>
                </div>
                <div className="row2">
                  <Field label="Energy 1–5"><input inputMode="numeric" value={form.energy_1_5 || ''} onChange={set('energy_1_5')} /></Field>
                  <Field label="Mood 1–5"><input inputMode="numeric" value={form.mood_1_5 || ''} onChange={set('mood_1_5')} /></Field>
                </div>
                <Field label="When were these taken?"><input type="datetime-local" value={form.at || ''} onChange={set('at')} /></Field>
                <Field label="Notes"><textarea rows={2} value={form.notes || ''} onChange={set('notes')} /></Field>
              </>
            )}

            {open === 'exercise' && (
              <>
                <Field label="Activity">
                  <input value={form.activity || ''} onChange={set('activity')} placeholder="Walk, weights, swim" autoFocus />
                </Field>
                <Field label="When did you do it?"><input type="datetime-local" value={form.at || ''} onChange={set('at')} /></Field>
                <div className="row2">
                  <Field label="Minutes"><input inputMode="numeric" value={form.duration_min || ''} onChange={set('duration_min')} /></Field>
                  <Field label="Intensity">
                    <select value={form.intensity || 'moderate'} onChange={set('intensity')}>
                      {INTENSITIES.map((i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Notes"><textarea rows={2} value={form.notes || ''} onChange={set('notes')} /></Field>
              </>
            )}

            {open === 'symptom' && (
              <>
                <div className="field">
                  <span>Symptom</span>
                  <SymptomPicker profile={profile} value={{ symptom: form.symptom, group: form.body_group }}
                    onChange={({ symptom, group }) => setForm((f) => ({ ...f, symptom, body_group: group }))} />
                </div>
                <Field label={`How bad? ${form.severity_1_5 ? `— ${SEVERITY_WORDS[form.severity_1_5]}` : '(tap one)'}`}>
                  <div className="sev-pick" role="group" aria-label="Severity 1 to 5">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button type="button" key={v} aria-pressed={Number(form.severity_1_5) === v}
                        aria-label={`${v} — ${SEVERITY_WORDS[v]}`}
                        data-level={v}
                        style={{ '--sev': `var(--sev-${v})` }}
                        onClick={() => setForm((f) => ({ ...f, severity_1_5: v }))}>{v}</button>
                    ))}
                  </div>
                </Field>
                <Field label="When did it start?"><input type="datetime-local" value={form.felt_at || ''} onChange={set('felt_at')} /></Field>
                <Field label="How long did it last? (hours)"><input inputMode="decimal" value={form.duration_hr || ''} onChange={set('duration_hr')} placeholder="Leave empty if it's still going" /></Field>
                {/headache|migraine/i.test(form.symptom || '') && (
                  <Field label="Anything else? (tap all that fit)">
                    <div className="chips">
                      {HEADACHE_DETAILS.map((d) => {
                        const on = (form.details || []).includes(d)
                        return (
                          <button type="button" key={d} className="chip" aria-pressed={on}
                            onClick={() => setForm((f) => ({ ...f, details: on ? f.details.filter((x) => x !== d) : [...(f.details || []), d] }))}>
                            {d}
                          </button>
                        )
                      })}
                    </div>
                  </Field>
                )}
                {form.symptom === 'Morning sickness' && (
                  <div className="row2">
                    <Field label="Times you threw up today"><input inputMode="numeric" value={form.vomits ?? ''} onChange={set('vomits')} /></Field>
                    <Field label="Keeping fluids down?">
                      <div className="chips">
                        {['Yes', 'No'].map((v) => (
                          <button type="button" key={v} className="chip" aria-pressed={form.fluids === v}
                            onClick={() => setForm((f) => ({ ...f, fluids: f.fluids === v ? undefined : v }))}>{v}</button>
                        ))}
                      </div>
                    </Field>
                  </div>
                )}
                <Field label="Suspected trigger"><input value={form.suspected_trigger || ''} onChange={set('suspected_trigger')} placeholder="skipped lunch, poor sleep…" /></Field>
                <Field label="Notes"><textarea rows={2} value={form.notes || ''} onChange={set('notes')} /></Field>
              </>
            )}

            {err && <p className="err">{err}</p>}

            <div className="actions">
              <button type="button" className="btn ghost" onClick={close} disabled={busy}>Cancel</button>
              {open !== 'choose' && (
                <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  )
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
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

function num(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

// Flag a meal against the profile's watch list so the dashboard can surface it.
function matchTriggers(text, watchList) {
  if (!text || !watchList?.length) return []
  const lower = text.toLowerCase()
  return watchList.filter((w) => lower.includes(String(w).toLowerCase()))
}
