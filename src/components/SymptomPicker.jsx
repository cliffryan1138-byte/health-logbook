import { useState } from 'react'
import { commonFor, groupsFor, search } from '../lib/symptoms'

// Pick a symptom: common ones first, then search the whole library or browse
// it by body area, or type anything and use it as written. `value` is
// { symptom, group }; group is null for a typed-in symptom.
export default function SymptomPicker({ profile, value, onChange }) {
  const [text, setText] = useState('')
  const pick = (name, group) => onChange({ symptom: name, group: group ?? null })
  const chip = ({ name, group }) => (
    <button type="button" key={`${group}:${name}`} className="chip" aria-pressed={value.symptom === name}
      onClick={() => pick(name, group)}>{name}</button>
  )

  const found = search(profile, text)
  const typed = text.trim()
  const exact = found.some((s) => s.name.toLowerCase() === typed.toLowerCase())

  return (
    <div className="sympick">
      <div className="chips">{commonFor(profile).map(chip)}</div>

      <input className="sympick-search" value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Search all symptoms, or type your own" aria-label="Search symptoms" />
      {typed && (
        <div className="chips">
          {found.map(chip)}
          {!exact && (
            <button type="button" className="chip" aria-pressed={value.symptom === typed && !value.group}
              onClick={() => pick(typed, null)}>Use “{typed}”</button>
          )}
        </div>
      )}

      <div className="sympick-groups">
        {groupsFor(profile).map((g) => (
          <details key={g.key} open={g.symptoms.includes(value.symptom) && value.group === g.key ? true : undefined}>
            <summary>{g.label}</summary>
            <div className="chips">{g.symptoms.map((name) => chip({ name, group: g.key }))}</div>
          </details>
        ))}
      </div>

      {value.symptom && <p className="note">Picked: <b>{value.symptom}</b></p>}
    </div>
  )
}
