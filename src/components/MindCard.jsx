import Card from './Card'
import { FORMS, band } from '../lib/questionnaires'
import { fmtDay } from '../lib/entries'

// Mental health at a glance: the latest PHQ-9 and GAD-7 (with the one before,
// so a change shows), and meditation in the range. Scores are screening
// scores with their published band, never a diagnosis.
export default function MindCard({ assessments = [], meditations = [], onAdd }) {
  const latest = (kind) => assessments.filter((a) => a.kind === kind).sort((a, b) => new Date(b.taken_at) - new Date(a.taken_at))
  const mins = meditations.reduce((s, m) => s + (m.minutes || 0), 0)
  return (
    <Card icon="mind" title="Mind" tag="screening scores, not a diagnosis">
      <ul className="mind-list">
        {['phq9', 'gad7'].map((kind) => {
          const [now, before] = latest(kind)
          return (
            <li key={kind}>
              <div>
                <b>{FORMS[kind].name}</b> <span className="note-inline">{FORMS[kind].about}</span>
                <div className="mind-score">
                  {now
                    ? <>{now.score} of {FORMS[kind].max} · {band(kind, now.score)} · {fmtDay(now.taken_at, { month: 'short', day: 'numeric' })}
                        {before && <> (was {before.score} on {fmtDay(before.taken_at, { month: 'short', day: 'numeric' })})</>}</>
                    : 'Not taken yet'}
                </div>
              </div>
              <button type="button" className="chip took" onClick={() => onAdd(kind)}>{now ? 'Take again' : 'Take it'}</button>
            </li>
          )
        })}
        <li>
          <div>
            <b>Meditation</b>
            <div className="mind-score">{meditations.length ? `${meditations.length} ${meditations.length === 1 ? 'session' : 'sessions'} · ${mins} min in this range` : 'None logged in this range'}</div>
          </div>
          <button type="button" className="chip took" onClick={() => onAdd('meditation')}>Log one</button>
        </li>
      </ul>
    </Card>
  )
}
