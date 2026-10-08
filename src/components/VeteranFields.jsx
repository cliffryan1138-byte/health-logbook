// "Are you a veteran?", and if so which branch and their VA disability rating.
// The person's own answers; Daybook doesn't verify them (yet). Used at sign-up,
// in the one-time questions, and in Settings. `value` is
// { veteran, service_branches, va_rating }.
export const BRANCHES = [['army', 'Army'], ['marine_corps', 'Marine Corps'], ['navy', 'Navy'], ['air_force', 'Air Force'],
  ['space_force', 'Space Force'], ['coast_guard', 'Coast Guard'], ['national_guard', 'National Guard'], ['reserve', 'Reserve']]
export const RATINGS = [['none', 'Not rated'], ['pending', 'Claim pending'],
  ...['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100'].map((r) => [r, `${r}%`])]

export default function VeteranFields({ value, onChange }) {
  const branches = value.service_branches || []
  const set = (patch) => onChange({ ...value, ...patch })
  return (
    <>
      <div className="field">
        <label id="vet-label">Are you a veteran?</label>
        <div className="sexpick" role="group" aria-labelledby="vet-label">
          <button type="button" aria-pressed={value.veteran === true} onClick={() => set({ veteran: true })}>Yes</button>
          <button type="button" aria-pressed={value.veteran === false}
            onClick={() => set({ veteran: false, service_branches: [], va_rating: null })}>No</button>
        </div>
      </div>
      {value.veteran && (
        <>
          <div className="field">
            <label>Branch of service (tap all that apply)</label>
            <div className="chips">
              {BRANCHES.map(([k, l]) => (
                <button type="button" key={k} className="chip" aria-pressed={branches.includes(k)}
                  onClick={() => set({ service_branches: branches.includes(k) ? branches.filter((b) => b !== k) : [...branches, k] })}>{l}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="va-rating">VA disability rating</label>
            <select id="va-rating" value={value.va_rating || ''} onChange={(e) => set({ va_rating: e.target.value || null })}>
              <option value="">Choose…</option>
              {RATINGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <p className="note">Your combined rating, as on your VA letter. Daybook doesn’t check it.</p>
          </div>
        </>
      )}
    </>
  )
}
