import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icon from '../lib/icons'
import { shrinkToJpeg } from '../lib/images'
import PaperNotes from './PaperNotes'
import { DoseSheet } from './Medications'

// v1 quick-log: fast manual forms. The Photo button accepts an image and sends
// it to the `capture` edge function (Claude API) when deployed; until then it
// falls back to the manual meal form with a note.
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

const SYMPTOMS = ['Headache', 'Heartburn', 'Bloating', 'Hot flash', 'Fatigue', 'Nausea', 'Joint pain', 'Poor sleep', 'Other']

const CHOICES = [
  { kind: 'meal', icon: 'flame', label: 'Meal or drink', hint: 'What you ate, with calories if you know them' },
  { kind: 'symptom', icon: 'pulse', label: 'Symptom', hint: 'Headache, heartburn, bloating…' },
  { kind: 'vitals', icon: 'drop', label: 'Vitals', hint: 'Weight, blood sugar, blood pressure, sleep' },
  { kind: 'dose', icon: 'pill', label: 'Medicine taken', hint: 'A dose of something on your list, or anything else' },
  { kind: 'exercise', icon: 'dumbbell', label: 'Exercise', hint: 'Walk, weights, bike…' },
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

// "Take a picture" asks first: testers photographed headache notes with it and
// got a food estimate back.
const PICTURES = [
  { kind: 'food', icon: 'flame', label: 'Food or drink', hint: 'Sparky guesses the calories' },
  { kind: 'paper', icon: 'pulse', label: 'Headache notes or a PDF log', hint: 'Paper notes, or a PDF from another app — Sparky reads each headache' },
]

const SHEETS = {
  choose: 'What are you adding?',
  picture: 'What is the picture of?',
  meal: 'Log a meal',
  vitals: 'Log vitals',
  exercise: 'Log exercise',
  symptom: 'Log a symptom',
}

export default function QuickLog({ profile, meds = [], onLogged, openKind, onOpenChange, onTalk }) {
  const [openInner, setOpenInner] = useState(null) // 'meal' | 'vitals' | 'exercise' | 'symptom' | 'dose'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [aiNote, setAiNote] = useState('')
  const [form, setForm] = useState({})
  const fileRef = useRef(null)

  // Dashboard can drive the sheet from its "→ log a weigh-in" links; when it
  // doesn't, the dock manages its own state.
  const open = openKind !== undefined ? openKind : openInner
  const setOpen = (k) => { setOpenInner(k); onOpenChange?.(k) }

  function openSheet(kind) { setForm(kind === 'symptom' ? { felt_at: localNow() } : {}); setErr(''); setAiNote(''); setOpen(kind) }
  function close() { setOpen(null) }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // ── photo → capture edge function, falling back to the manual meal form ──
  // The capture function expects { kind: 'photo', image_b64, media_type,
  // focus_areas, watch_list } and replies { meal: {...} }. Phone photos are
  // shrunk first: a 12-megapixel shot is far past what the function and the
  // vision model accept, and a smaller one uploads in a second on cellular.
  async function onPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr(''); setAiNote('Sparky is looking at your photo…'); setBusy(true); setForm({ source: 'photo' }); setOpen('meal')
    try {
      const image_b64 = await shrinkToJpeg(file)
      const { data, error } = await supabase.functions.invoke('capture', {
        body: {
          kind: 'photo',
          image_b64,
          media_type: 'image/jpeg',
          focus_areas: (profile.focus_areas || []).map((f) => String(f).toLowerCase()),
          watch_list: profile.watch_list || [],
        },
      })
      const meal = data?.meal
      if (error || !meal || !meal.description) throw error || new Error('no estimate')
      setForm({
        description: meal.description ?? '',
        calories: meal.calories ?? '',
        protein_g: meal.protein_g ?? '',
        carbs_g: meal.carbs_g ?? '',
        sugar_g: meal.sugar_g ?? '',
        fiber_g: meal.fiber_g ?? '',
        fat_g: meal.fat_g ?? '',
        confidence: meal.confidence ?? 'low',
        trigger_watch: meal.trigger_watch || [],
        source: 'photo',
      })
      setAiNote(`${meal.summary ? `${meal.summary}. ` : ''}Estimated from the photo — check the numbers, then Save.`)
    } catch {
      setForm({ source: 'manual' })
      setAiNote('Couldn’t read the photo just now — type in what you ate instead.')
    } finally {
      setBusy(false)
    }
  }

  async function save(table, row) {
    setBusy(true); setErr('')
    const { error } = await supabase.from(table).insert({ ...row, profile_id: profile.id })
    setBusy(false)
    if (error) { setErr(error.message); return }
    close()
    onLogged?.()
  }

  function submit(e) {
    e.preventDefault()
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
      })
    } else if (open === 'vitals') {
      save('vitals', {
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
      })
    } else if (open === 'exercise') {
      if (!form.activity?.trim()) { setErr('What was the activity?'); return }
      save('exercise', {
        activity: form.activity.trim(),
        duration_min: num(form.duration_min),
        intensity: form.intensity || null,
        notes: form.notes?.trim() || null,
      })
    } else if (open === 'symptom') {
      if (!form.symptom) { setErr('Pick a symptom.'); return }
      // No silent default: a guessed 3 would read as the person's own rating.
      if (!form.severity_1_5) { setErr('Tap how bad it is, 1 to 5.'); return }
      const felt = form.felt_at ? new Date(form.felt_at) : new Date()
      if (Number.isNaN(felt.getTime())) { setErr('Check the start time.'); return }
      if (felt > new Date(Date.now() + 5 * 60000)) { setErr('That start time is in the future.'); return }
      const notes = [(form.details || []).join(', '), form.notes?.trim()].filter(Boolean).join('. ')
      save('symptoms', {
        symptom: form.symptom,
        severity_1_5: Number(form.severity_1_5),
        duration_hr: num(form.duration_hr),
        suspected_trigger: form.suspected_trigger?.trim() || null,
        notes: notes || null,
        felt_at: felt.toISOString(),
      })
    }
  }

  return (
    <>
      {/* Two plain choices instead of a row of unlabeled icons. No `capture`
          attribute on the input, so phones offer Take Photo or Photo Library. */}
      <div className="dock">
        <button className="photo" onClick={() => openSheet('picture')}>
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

      {open === 'dose' && (
        <DoseSheet profile={profile} meds={meds} onClose={close} onSaved={() => onLogged?.()} />
      )}

      {open && open !== 'paper' && open !== 'dose' && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && close()}>
          <form className="sheet" onSubmit={submit}>
            <h3>{SHEETS[open]}</h3>

            {open === 'picture' && (
              <div className="choose">
                {PICTURES.map((c) => (
                  <button
                    type="button"
                    key={c.kind}
                    className="choice"
                    // The file picker must open inside this tap, or phones block it.
                    onClick={() => { if (c.kind === 'food') { fileRef.current?.click(); close() } else openSheet('paper') }}
                  >
                    <span className="choice-ico"><Icon name={c.icon} /></span>
                    <span className="choice-text"><b>{c.label}</b><span>{c.hint}</span></span>
                  </button>
                ))}
              </div>
            )}

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
                  <Field label="When">
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
                <Field label="Notes"><textarea rows={2} value={form.notes || ''} onChange={set('notes')} /></Field>
              </>
            )}

            {open === 'exercise' && (
              <>
                <Field label="Activity">
                  <input value={form.activity || ''} onChange={set('activity')} placeholder="Walk, weights, swim" autoFocus />
                </Field>
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
                <Field label="Symptom">
                  <div className="chips">
                    {SYMPTOMS.map((sy) => (
                      <button
                        type="button"
                        key={sy}
                        className="chip"
                        aria-pressed={form.symptom === sy}
                        onClick={() => setForm((f) => ({ ...f, symptom: sy }))}
                      >
                        {sy}
                      </button>
                    ))}
                  </div>
                </Field>
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
                <Field label="Suspected trigger"><input value={form.suspected_trigger || ''} onChange={set('suspected_trigger')} placeholder="skipped lunch, poor sleep…" /></Field>
                <Field label="Notes"><textarea rows={2} value={form.notes || ''} onChange={set('notes')} /></Field>
              </>
            )}

            {aiNote && <p className="note">{aiNote}</p>}
            {err && <p className="err">{err}</p>}

            <div className="actions">
              <button type="button" className="btn ghost" onClick={close} disabled={busy}>Cancel</button>
              {open !== 'choose' && open !== 'picture' && (
                <button type="submit" className="btn" disabled={busy}>{busy ? (aiNote.startsWith('Sparky') ? 'Estimating…' : 'Saving…') : 'Save'}</button>
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
