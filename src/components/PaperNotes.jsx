import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { shrinkToJpeg } from '../lib/images'

// "Old notes or PDF log": photograph a page of a handwritten headache diary, or
// pick a PDF exported from another app or a patient portal. Get back draft
// entries, check and fix each one, then save the ones you keep.
//
// Nothing is saved until the person taps Save. Each saved entry gets the date
// and time written on the paper (felt_at), while created_at stays "now" — so the
// doctor/lawyer export marks it "entered later", which is the honest record.

const today = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

const MAX_PDF_MB = 8

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

// The function answers errors with { error: "..." }; show that line when there is one.
async function reasonOf(error) {
  try { return (await error?.context?.json?.())?.error || '' } catch { return '' }
}

export default function PaperNotes({ profile, onClose, onSaved }) {
  const fileRef = useRef(null)
  const [stage, setStage] = useState('pick') // pick | reading | review
  const [drafts, setDrafts] = useState([])
  const [pageNote, setPageNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [source, setSource] = useState('From paper notes.')

  async function onPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    if (isPdf && file.size > MAX_PDF_MB * 1024 * 1024) {
      setErr(`That PDF is over ${MAX_PDF_MB} MB. Save a shorter date range from the other app and try again.`)
      return
    }
    setErr(''); setPageNote(''); setStage('reading')
    setSource(isPdf ? `Imported from ${file.name}.` : 'From paper notes.')
    try {
      // Handwriting needs a little more resolution than a meal photo.
      const body = isPdf
        ? { pdf_b64: await fileToBase64(file), today: today() }
        : { image_b64: await shrinkToJpeg(file, 2000), media_type: 'image/jpeg', today: today() }
      const { data, error } = await supabase.functions.invoke('read-notes', { body })
      if (error) {
        const why = await reasonOf(error)
        throw new Error(why || 'unreadable')
      }
      if (!data?.entries) throw new Error('unreadable')
      setDrafts(data.entries.map((x, i) => ({
        key: i,
        keep: true,
        date: x.date || '',
        time: x.time || '',
        symptom: x.symptom || 'Headache',
        severity_1_5: x.severity_1_5 ?? '',
        duration_hr: x.duration_hr ?? '',
        suspected_trigger: x.suspected_trigger || '',
        notes: x.notes || '',
        unsure: x.unsure || '',
      })))
      setPageNote(data.page_note || '')
      setStage('review')
    } catch (e) {
      setStage('pick')
      setErr(e?.message && e.message !== 'unreadable'
        ? e.message
        : isPdf
          ? 'Couldn’t read that PDF. Check it opens and shows your log, or type the entries in with Add manually → Symptom.'
          : 'Couldn’t read that photo. Try again in good light, or type the entries in with Add manually → Symptom.')
    }
  }

  const set = (key, field) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, [field]: v } : d)))
  }

  const kept = drafts.filter((d) => d.keep)
  const missing = kept.filter((d) => !d.date || !d.severity_1_5 || !d.symptom.trim())

  async function save() {
    if (!kept.length) { onClose(); return }
    if (missing.length) { setErr('Each kept entry needs a date, a symptom and a severity.'); return }
    const now = Date.now()
    const rows = kept.map((d) => {
      const felt = new Date(`${d.date}T${d.time || '12:00'}`)
      return {
        profile_id: profile.id,
        symptom: d.symptom.trim(),
        severity_1_5: Number(d.severity_1_5),
        duration_hr: d.duration_hr === '' ? null : Number(d.duration_hr),
        suspected_trigger: d.suspected_trigger.trim() || null,
        notes: [source, d.time ? '' : 'Time not written (saved as noon).', d.notes.trim()]
          .filter(Boolean).join(' '),
        felt_at: felt.toISOString(),
      }
    })
    if (rows.some((r) => new Date(r.felt_at).getTime() > now + 5 * 60000)) {
      setErr('One of the dates is in the future — check the year.'); return
    }
    setBusy(true); setErr('')
    const { error } = await supabase.from('symptoms').insert(rows)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved?.(rows.length)
    onClose()
  }

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="sheet">
        <h3>Old notes or PDF log</h3>

        <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" hidden onChange={onPhoto} />

        {stage === 'pick' && (
          <>
            <p className="note" style={{ marginTop: 0 }}>
              Take a photo of one page of your paper notes, or choose a PDF log exported from another
              app or your doctor’s portal. Sparky reads it and shows you each entry to check. Nothing is
              saved until you tap Save.
            </p>
            <ol className="paper-tips">
              <li>Paper: lay the page flat in good light, one page per photo.</li>
              <li>PDF: under {MAX_PDF_MB} MB. For a long history, export a few months at a time.</li>
            </ol>
            {err && <p className="err">{err}</p>}
            <div className="actions">
              <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Choose photo or PDF</button>
            </div>
          </>
        )}

        {stage === 'reading' && (
          <div className="paper-reading">
            <img src="/sparky.png" alt="" width="64" height="64" />
            <p>Sparky is reading your log… this can take a minute or two.</p>
          </div>
        )}

        {stage === 'review' && (
          <>
            {drafts.length === 0 ? (
              <p className="note" style={{ marginTop: 0 }}>{pageNote || 'No entries found on that page.'}</p>
            ) : (
              <p className="note" style={{ marginTop: 0 }}>
                Found {drafts.length} {drafts.length === 1 ? 'entry' : 'entries'}. Check each one against the original and fix
                anything wrong. Untick any you don’t want.
              </p>
            )}

            {drafts.map((d, i) => {
              const bad = d.keep && (!d.date || !d.severity_1_5 || !d.symptom.trim())
              return (
                <fieldset key={d.key} className={`draft${d.keep ? '' : ' off'}${bad ? ' bad' : ''}`}>
                  <label className="draft-keep">
                    <input type="checkbox" checked={d.keep} onChange={set(d.key, 'keep')} />
                    <b>Entry {i + 1}</b>
                  </label>
                  {d.unsure && <p className="draft-unsure">Check this: {d.unsure}</p>}
                  <div className="row2">
                    <label className="field"><span>Date</span>
                      <input type="date" value={d.date} max={today()} onChange={set(d.key, 'date')} /></label>
                    <label className="field"><span>Time</span>
                      <input type="time" value={d.time} onChange={set(d.key, 'time')} /></label>
                  </div>
                  <div className="row2">
                    <label className="field"><span>Symptom</span>
                      <input value={d.symptom} onChange={set(d.key, 'symptom')} /></label>
                    <label className="field"><span>Severity 1–5</span>
                      <select value={d.severity_1_5} onChange={set(d.key, 'severity_1_5')}>
                        <option value="">Pick…</option>
                        {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
                      </select></label>
                  </div>
                  <div className="row2">
                    <label className="field"><span>Hours</span>
                      <input inputMode="decimal" value={d.duration_hr} onChange={set(d.key, 'duration_hr')} /></label>
                    <label className="field"><span>Suspected trigger</span>
                      <input value={d.suspected_trigger} onChange={set(d.key, 'suspected_trigger')} /></label>
                  </div>
                  <label className="field"><span>Notes</span>
                    <textarea rows={2} value={d.notes} onChange={set(d.key, 'notes')} /></label>
                </fieldset>
              )
            })}

            {err && <p className="err">{err}</p>}
            <div className="actions">
              <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
              {drafts.length > 0 ? (
                <button type="button" className="btn" onClick={save} disabled={busy}>
                  {busy ? 'Saving…' : `Save ${kept.length} ${kept.length === 1 ? 'entry' : 'entries'}`}
                </button>
              ) : (
                <button type="button" className="btn" onClick={() => { setStage('pick'); setErr('') }}>Try another photo</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
