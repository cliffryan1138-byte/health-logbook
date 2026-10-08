// "Male or female?" — two large buttons. Used at sign-up, in the one-time
// question for people who signed up before it existed, and in Settings.
export default function SexChoice({ value, onChange, inSettings = false }) {
  return (
    <div className="field">
      <label id="sex-label">Male or female?</label>
      <div className="sexpick" role="group" aria-labelledby="sex-label">
        <button type="button" aria-pressed={value === 'male'} onClick={() => onChange('male')}>Male</button>
        <button type="button" aria-pressed={value === 'female'} onClick={() => onChange('female')}>Female</button>
      </div>
      <p className="note">{inSettings
        ? 'This sets which items below show to start with. Your own choices below always win.'
        : 'This sets which items Daybook shows to start with. You can turn any item on or off in Settings.'}</p>
    </div>
  )
}
