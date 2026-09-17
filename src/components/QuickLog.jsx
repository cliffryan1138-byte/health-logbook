import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icon from '../lib/icons'

// v1 quick-log: fast manual forms. The Photo button accepts an image and sends
// it to the `capture` edge function (Claude API) when deployed; until then it
// falls back to the manual meal form with a note.
//
// RECOVERY NOTE: the header above, the SYMPTOMS list, the component signature
// and the speech-recognition setup are the original file, recovered from the
// Vercel deployment. The forms and submit handlers were lost to a response
// limit and are rebuilt against the live database schema, so every field and
// every CHECK constraint below matches the real columns.

const SYMPTOMS = ['Headache', 'Heartburn', 'Bloating', 'Hot flash', 'Fatigue', 'Nausea', 'Joint pain', 'Poor sleep', 'Other']

const GLUCOSE_CONTEXTS = ['fasting', 'post-breakfast', 'post-lunch', 'post-dinner', 'random']
const INTENSITIES = ['easy', 'moderate', 'hard']

const SHEETS = {
  meal: 'Log a meal',
  vitals: 'Log vitals',
  exercise: 'Log exercise',
  symptom: 'Log a symptom',
  talk: 'Talk it through',
}

export default function QuickLog({ profile, onLogged, openKind, onOpenChange }) {
  const [openInner, setOpenInner] = useState(null) // 'meal' | 'vitals' | 'exercise' | 'symptom' | 'talk'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [aiNote, setAiNote] = useState('')
  const [form, setForm] = useState({})
  const [transcript, setTranscript] = useState('')
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)
  const fileRef = useRef(null)

  // Dashboard can drive the sheet from its "→ log a weigh-in" links; when it
  // doesn't, the dock manages its own state.
  const open = openKind !== undefined ? openKind : openInner
  const setOpen = (k) => { setOpenInner(k); onOpenChange?.(k) }

  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => () => { recRef.current?.stop?.() }, [])

  function openSheet(kind) { setForm({}); setErr(''); setAiNote(''); setOpen(kind) }
  function close() { setOpen(null); setTranscript(''); setListening(false); recRef.current?.stop?.() }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function toggleListening() {
    if (listening) { recRef.current?.stop(); setListening(false); return }
    if (!SR) { setErr('This browser has no speech recognition. Type it instead.'); return }
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = false
    rec.lang = 'en-US'
    rec.onresult = (e) => {
      const chunk = Array.from(e.results).slice(e.resultIndex).map((r) => r[0].transcript).join(' ')
      setTranscript((t) => (t ? `${t} ${chunk}` : chunk).trim())
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  // ── photo → capture edge function, falling back to the manual meal form ──
  async function onPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr(''); setAiNote(''); setBusy(true); setOpen('meal')
    try {
      const b64 = await toBase64(file)
      const { data, error } = await supabase.functions.invoke('capture', {
        body: { image: b64, profile_id: profile.id },
      })
      if (error) throw error
      setForm({
        description: data.description ?? '',
        calories: data.calories ?? '',
        protein_g: data.protein_g ?? '',
        carbs_g: data.carbs_g ?? '',
        sugar_g: data.sugar_g ?? '',
        fiber_g: data.fiber_g ?? '',
        fat_g: data.fat_g ?? '',
        sodium_mg: data.sodium_mg ?? '',
        confidence: data.confidence ?? 'low',
        source: 'photo',
      })
      setAiNote('Estimated from the photo. Check the numbers before saving.')
    } catch {
      setForm({ source: 'manual' })
      setAiNote('Photo estimation is unavailable right now — enter the meal manually.')
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
        trigger_watch: matchTriggers(form.description, profile.watch_list),
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
      save('symptoms', {
        symptom: form.symptom,
        severity_1_5: num(form.severity_1_5) || 3,
        duration_hr: num(form.duration_hr),
        suspected_trigger: form.suspected_trigger?.trim() || null,
        notes: form.notes?.trim() || null,
      })
    } else if (open === 'talk') {
      const text = transcript.trim()
      if (!text) { setErr('Nothing captured yet — tap the mic and speak.'); return }
      save('meals', {
        description: text.slice(0, 120),
        source: 'voice',
        confidence: 'low',
        trigger_watch: matchTriggers(text, profile.watch_list),
        notes: text,
      })
    }
  }

  return (
    <>
      <div className="dock">
        <button className="photo" onClick={() => fileRef.current?.click()}>
          <Icon name="camera" /> Photo
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
        <DockBtn icon="mic" label="Talk" onClick={() => openSheet('talk')} />
        <DockBtn icon="flame" label="Meal" onClick={() => openSheet('meal')} />
        <DockBtn icon="drop" label="Vitals" onClick={() => openSheet('vitals')} />
        <DockBtn icon="dumbbell" label="Exercise" onClick={() => openSheet('exercise')} />
        <DockBtn icon="pulse" label="Symptom" onClick={() => openSheet('symptom')} />
      </div>

      {open && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && close()}>
          <form className="sheet" onSubmit={submit}>
            <h3>{SHEETS[open]}</h3>

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
                <div className="row2">
                  <Field label="Severity 1–5"><input inputMode="numeric" value={form.severity_1_5 || ''} onChange={set('severity_1_5')} placeholder="3" /></Field>
                  <Field label="Hours"><input inputMode="decimal" value={form.duration_hr || ''} onChange={set('duration_hr')} /></Field>
                </div>
                <Field label="Suspected trigger"><input value={form.suspected_trigger || ''} onChange={set('suspected_trigger')} /></Field>
                <Field label="Notes"><textarea rows={2} value={form.notes || ''} onChange={set('notes')} /></Field>
              </>
            )}

            {open === 'talk' && (
              <>
                <p className="note">
                  Tap the mic and say what you ate or how you feel. It saves as a
                  voice entry you can tidy up later.
                </p>
                <div className="actions">
                  <button type="button" className={listening ? 'btn' : 'btn ghost'} onClick={toggleListening}>
                    {listening ? 'Stop listening' : 'Start listening'}
                  </button>
                </div>
                <Field label="Captured">
                  <textarea rows={4} value={transcript} onChange={(e) => setTranscript(e.target.value)} />
                </Field>
              </>
            )}

            {aiNote && <p className="note">{aiNote}</p>}
            {err && <p className="err">{err}</p>}

            <div className="actions">
              <button type="button" className="btn ghost" onClick={close} disabled={busy}>Cancel</button>
              <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

function DockBtn({ icon, label, onClick }) {
  return (
    <button className="ic" onClick={onClick} title={label} aria-label={label}>
      <Icon name={icon} />
    </button>
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

async function toBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.onerror = reject
    r.readAsDataURL(file)
  })
}
