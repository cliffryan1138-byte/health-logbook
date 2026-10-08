import { useEffect, useState } from 'react'
import { loadLabel, LABEL_SECTIONS, OPENFDA_DISCLAIMER, dailyMedUrl } from '../lib/refLibrary'

// A medicine's FDA label, quoted (plan, workstream 3–4: "quoted, never
// paraphrased", with the source and the date it was fetched). Daybook says
// which product's label it is, never what the label means for the person,
// and ends every view with "ask your pharmacist or doctor".

const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '')

export default function LabelSheet({ med, onClose }) {
  const [state, setState] = useState(null)

  useEffect(() => {
    let gone = false
    loadLabel(med).then((s) => { if (!gone) setState(s) }).catch(() => { if (!gone) setState({ status: 'unavailable' }) })
    return () => { gone = true }
  }, [med])

  const l = state?.label
  const shown = l ? LABEL_SECTIONS.filter(([k]) => l.sections?.[k]?.length) : []
  // A label that warns about suicidal thoughts gets the same 988 line the
  // crisis card uses (approved safety flow, 2026-10-08), shown, not hidden.
  const suicideWarning = shown.some(([k]) => l.sections[k].some((t) => /suicid/i.test(t)))

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet label-sheet">
        <h3>{med.name}: FDA label</h3>

        {!state && <p className="note">Looking up the label…</p>}

        {state?.status === 'unavailable' && (
          <p className="note">The label lookup isn’t available right now. Try again later. Nothing on your list has changed.</p>
        )}

        {state?.status === 'not_matched' && (
          <p className="note">
            Daybook couldn’t match “{med.name}” to a medicine in RxNorm, the National Library of Medicine’s list of medicine names.
            Check the spelling, or use the name on the bottle or box, for example “sertraline” or “Zoloft”. Daybook doesn’t guess.
          </p>
        )}

        {state?.status === 'no_label' && (
          <p className="note">
            Matched to <b>{state.ref.rx_name}</b> in RxNorm, but the FDA has no label for it on openFDA.
            Vitamins and supplements usually have none.
          </p>
        )}

        {state?.status === 'label' && (
          <>
            <p className="note" style={{ marginTop: 0 }}>
              Matched to <b>{state.ref.rx_name}</b> (RxNorm). Label shown: <b>{l.title || l.generic_names?.[0]}</b>
              {l.manufacturer ? `, ${l.manufacturer}` : ''}{l.effective_time ? `, effective ${fmtDate(l.effective_time)}` : ''}.
            </p>
            <p className="note">
              Many makers sell this medicine, each with its own label. This is the most recent one the FDA has for it;
              the label in your box is the one that applies to you. <a href={dailyMedUrl(l.set_id)} target="_blank" rel="noreferrer">See this label on DailyMed</a>.
            </p>
            {suicideWarning && (
              <p className="note label-988">
                <b>This label warns about suicidal thoughts.</b> If you’re having thoughts of suicide, call or text <a href="tel:988">988</a>, any time.
                Veterans: call 988, then press 1, or text <a href="sms:838255">838255</a>. In an emergency, call <a href="tel:911">911</a>.
              </p>
            )}
            {shown.length === 0 && <p className="note">This label has none of the sections Daybook shows. Open it on DailyMed.</p>}
            {shown.map(([k, title]) => (
              <details key={k} className="label-sec" open={k === 'boxed_warning'}>
                <summary>{title}</summary>
                {l.sections[k].map((t, i) => <blockquote key={i}>{t}</blockquote>)}
              </details>
            ))}
            <p className="src">
              Source: U.S. Food and Drug Administration drug label (set id {l.set_id}{l.version ? `, version ${l.version}` : ''}), via openFDA, public domain.
              Retrieved {fmtDate(l.retrieved_at)}. openFDA says: “{OPENFDA_DISCLAIMER}”
            </p>
          </>
        )}

        {state && <p className="note"><b>Questions about this medicine? Ask your pharmacist or doctor.</b></p>}
        <div className="actions"><button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
      </div>
    </div>
  )
}
