import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { BODY_ITEMS, shows, focusFor, COMMON_TRIGGERS } from '../lib/items'
import SexChoice from './SexChoice'

// Everything sign-up asked, changeable later, plus which body-specific items
// show. Turning an item off only hides it: nothing logged is deleted, and
// turning it back on brings it all back.
export default function Settings({ profile, onClose, onSaved }) {
  const [name, setName] = useState(profile.display_name || '')
  const [sex, setSex] = useState(profile.sex)
  const [focus, setFocus] = useState(profile.focus_areas || [])
  const [watch, setWatch] = useState(profile.watch_list || [])
  // Only the items the person has set themselves; the rest follow `sex`.
  const [own, setOwn] = useState(profile.shown_items || {})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const draft = { sex, shown_items: own }
  const toggle = (list, setList) => (v) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  // Keep anything already on their lists (Sparky or the skill may have added
  // more than the starter chips), so saving never drops it.
  const focusChoices = [...new Set([...focusFor(draft), ...focus])]
  const watchChoices = [...new Set([...COMMON_TRIGGERS, ...watch])]

  async function save(e) {
    e.preventDefault()
    if (!name.trim()) { setErr('What should the logbook call you?'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.from('profiles').update({
      display_name: name.trim(),
      sex,
      focus_areas: focus,
      watch_list: watch,
      shown_items: own,
    }).eq('id', profile.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved?.()
    onClose()
  }

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={save} aria-label="Settings">
        <h3>Settings</h3>

        <div className="field">
          <label htmlFor="set-name">Your name</label>
          <input id="set-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <SexChoice value={sex} onChange={setSex} inSettings />

        <div className="field">
          <label id="items-label">Items to show</label>
          <ul className="itemlist" aria-labelledby="items-label">
            {BODY_ITEMS.map((i) => {
              const on = shows(draft, i.key)
              return (
                <li key={i.key}>
                  <span>{i.label}</span>
                  <button type="button" className="chip" aria-pressed={on}
                    onClick={() => setOwn({ ...own, [i.key]: !on })}>{on ? 'Shown' : 'Hidden'}</button>
                </li>
              )
            })}
          </ul>
          <p className="note">Hiding an item never deletes what you logged. Turn it back on and it’s all there.</p>
        </div>

        <div className="field">
          <label>What are you watching?</label>
          <div className="chips">
            {focusChoices.map((f) => (
              <button type="button" key={f} className="chip" aria-pressed={focus.includes(f)}
                onClick={() => toggle(focus, setFocus)(f)}>{f}</button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Foods that tend to set you off</label>
          <div className="chips">
            {watchChoices.map((t) => (
              <button type="button" key={t} className="chip" aria-pressed={watch.includes(t)}
                onClick={() => toggle(watch, setWatch)(t)}>{t}</button>
            ))}
          </div>
        </div>

        {err && <p className="err">{err}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
