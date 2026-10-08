import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { shows } from '../lib/items'
import { dayKey, fmtDay } from '../lib/entries'

// The daily check-in (WG-PLAN-HEALTH-002, workstream 1): the quick things
// people track once a day, in one sheet. Every item is optional, and only the
// items this person sees are shown (period and menopause follow Settings).
// One row per day: saving again the same day updates it, and the earlier
// values are kept in the edit history.

const SCALE = { mood_1_5: ['Very low', 'Low', 'OK', 'Good', 'Great'], stress_1_5: ['None', 'A little', 'Some', 'A lot', 'Overwhelming'],
  energy_1_5: ['Drained', 'Low', 'OK', 'Good', 'High'], sleep_quality_1_5: ['Very poor', 'Poor', 'OK', 'Good', 'Great'],
  hot_flashes_1_5: ['Very mild', 'Mild', 'Moderate', 'Bad', 'Severe'], night_sweats_1_5: ['Very mild', 'Mild', 'Moderate', 'Bad', 'Severe'] }
const BOWEL = [['none', 'None'], ['hard', 'Hard'], ['normal', 'Normal'], ['loose', 'Loose']]
const PERIOD = [['none', 'No'], ['spotting', 'Spotting'], ['light', 'Light'], ['medium', 'Medium'], ['heavy', 'Heavy']]
const IMPACT = [['missed_work', 'Missed work or school'], ['bed_rest', 'Needed bed rest'], ['needed_help', 'Needed help with daily tasks'], ['couldnt_drive', 'Couldn’t drive']]
const NUMS = ['sleep_hr', 'water_glasses', 'caffeine_cups', 'alcohol_drinks']

export default function CheckIn({ profile, onClose, onSaved }) {
  const [day, setDay] = useState(dayKey(new Date()))
  const [form, setForm] = useState({})
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Load that day's check-in, if there is one, so saving updates it.
  useEffect(() => {
    let live = true
    setLoaded(false)
    supabase.from('daily_checkins').select('*').eq('profile_id', profile.id).eq('day', day).maybeSingle()
      .then(({ data }) => { if (live) { setForm(data ?? {}); setLoaded(true) } })
    return () => { live = false }
  }, [profile.id, day])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: f[k] === v ? null : v }))
  const setText = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save(e) {
    e.preventDefault()
    if (day > dayKey(new Date())) { setErr('That day hasn’t happened yet.'); return }
    const row = { profile_id: profile.id, day }
    for (const k of NUMS) {
      const v = form[k]
      if (v === '' || v == null) { row[k] = null; continue }
      const n = Number(v)
      if (Number.isNaN(n) || n < 0) { setErr('Numbers only, please, and none below zero.'); return }
      row[k] = k === 'sleep_hr' ? n : Math.round(n)
    }
    if (row.sleep_hr != null && row.sleep_hr > 24) { setErr('Sleep is in hours, up to 24.'); return }
    for (const k of [...Object.keys(SCALE), 'bowel', 'period', 'woke_at_night', 'bloating', 'reflux', ...IMPACT.map((i) => i[0])]) {
      row[k] = form[k] ?? null
    }
    row.alcohol_type = row.alcohol_drinks ? (form.alcohol_type?.trim() || null) : null
    row.notes = form.notes?.trim() || null
    setBusy(true); setErr('')
    const { error } = await supabase.from('daily_checkins').upsert(row, { onConflict: 'profile_id,day' })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved?.()
    onClose()
  }

  const scale = (k, label) => (
    <div className="field">
      <span>{label}{form[k] ? ` — ${SCALE[k][form[k] - 1]}` : ''}</span>
      <div className="sev-pick plain" role="group" aria-label={`${label}, 1 to 5`}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button type="button" key={v} aria-pressed={form[k] === v} aria-label={`${v} — ${SCALE[k][v - 1]}`}
            onClick={() => set(k, v)}>{v}</button>
        ))}
      </div>
    </div>
  )
  const choice = (k, label, options) => (
    <div className="field">
      <span>{label}</span>
      <div className="chips">
        {options.map(([v, l]) => (
          <button type="button" key={v} className="chip" aria-pressed={form[k] === v} onClick={() => set(k, v)}>{l}</button>
        ))}
      </div>
    </div>
  )
  const yes = (k, label) => (
    <button type="button" className="chip" aria-pressed={form[k] === true} onClick={() => set(k, true)}>{label}</button>
  )
  const number = (k, label, mode = 'numeric') => (
    <label className="field">
      <span>{label}</span>
      <input inputMode={mode} value={form[k] ?? ''} onChange={setText(k)} />
    </label>
  )

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={save} aria-label="Daily check-in">
        <h3>Daily check-in</h3>
        <label className="field">
          <span>Day</span>
          <input type="date" value={day} max={dayKey(new Date())} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </label>
        <p className="note checkin-lead">Fill in only what you track. {form.id ? `Updating ${fmtDay(`${day}T12:00`)}.` : ''}</p>

        {!loaded ? <p className="note">Loading…</p> : (
          <>
            <h4 className="checkin-h">Sleep last night</h4>
            <div className="row2">
              {number('sleep_hr', 'Hours', 'decimal')}
              <div className="field"><span>&nbsp;</span><div className="chips">{yes('woke_at_night', 'Woke up in the night')}</div></div>
            </div>
            {scale('sleep_quality_1_5', 'Sleep quality')}

            <h4 className="checkin-h">How you feel</h4>
            {scale('mood_1_5', 'Mood')}
            {scale('stress_1_5', 'Stress')}
            {scale('energy_1_5', 'Energy')}

            <h4 className="checkin-h">Drinks</h4>
            <div className="row2">
              {number('water_glasses', 'Water (glasses)')}
              {number('caffeine_cups', 'Caffeine (cups)')}
            </div>
            <div className="row2">
              {number('alcohol_drinks', 'Alcohol (drinks)')}
              {Number(form.alcohol_drinks) > 0 && (
                <label className="field"><span>What kind</span>
                  <input value={form.alcohol_type ?? ''} onChange={setText('alcohol_type')} placeholder="beer, wine…" /></label>
              )}
            </div>

            <h4 className="checkin-h">Stomach</h4>
            {choice('bowel', 'Bowel movements', BOWEL)}
            <div className="chips">{yes('bloating', 'Bloating')}{yes('reflux', 'Reflux or heartburn')}</div>

            {shows(profile, 'cycle') && (
              <>
                <h4 className="checkin-h">Period</h4>
                {choice('period', 'Bleeding today', PERIOD)}
              </>
            )}

            {shows(profile, 'menopause') && (
              <>
                <h4 className="checkin-h">Perimenopause and menopause</h4>
                {scale('hot_flashes_1_5', 'Hot flashes')}
                {scale('night_sweats_1_5', 'Night sweats')}
              </>
            )}

            <h4 className="checkin-h">How the day went</h4>
            <div className="chips">{IMPACT.map(([k, l]) => <span key={k}>{yes(k, l)}</span>)}</div>

            <label className="field checkin-notes"><span>Notes</span>
              <textarea rows={2} value={form.notes ?? ''} onChange={setText('notes')} /></label>
          </>
        )}

        {err && <p className="err">{err}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn" disabled={busy || !loaded}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
