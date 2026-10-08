import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildReport } from '../lib/medReport'
import { LABEL_SECTIONS, OPENFDA_DISCLAIMER, dailyMedUrl } from '../lib/refLibrary'
import { NIAAA_SOURCE, NIAAA_CAVEAT } from '../lib/niaaa'
import { loadPregnancy, inWindow } from '../lib/pregnancy'
import { medLine } from '../lib/meds'
import { logEvent } from '../lib/audit'

// "My medicines report": on screen and printable (plan, workstream 4).
// Quotes and counts only. It is rendered outside the app's layout so that
// printing it prints just the report (body.print-report in global.css).

const TITLE = Object.fromEntries(LABEL_SECTIONS)
const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '')
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const profileName = (p) => { const n = p?.display_name || ''; return n ? `${n} · ` : '' }
const WARN = ['boxed_warning', 'warnings_and_cautions', 'warnings', 'contraindications', 'do_not_use', 'ask_doctor', 'ask_doctor_or_pharmacist', 'when_using', 'stop_use']

export default function MedReport({ profile, meds, onClose }) {
  const [days, setDays] = useState(30)
  const [report, setReport] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let gone = false
    setReport(null); setErr('')
    ;(async () => {
      let pregnant = false
      try { const { pregnancy } = await loadPregnancy(profile.id); pregnant = inWindow(pregnancy) } catch { /* not tracking */ }
      const r = await buildReport(profile, meds, { days, pregnant })
      if (!gone) setReport(r)
    })().catch((e) => { if (!gone) setErr(e.message || 'Couldn’t build the report.') })
    return () => { gone = true }
  }, [profile, meds, days])

  useEffect(() => () => document.body.classList.remove('print-report'), [])

  function print() {
    const before = document.title
    document.title = `Daybook medicines report ${new Date().toISOString().slice(0, 10)}`
    document.body.classList.add('print-report')
    // Folded label sections print in full.
    const folded = [...document.querySelectorAll('.med-report details:not([open])')]
    folded.forEach((d) => { d.open = true })
    logEvent(profile.id, 'export_print', { report: 'medicines', count: report?.items.length ?? 0 })
    window.print()
    setTimeout(() => { document.body.classList.remove('print-report'); document.title = before; folded.forEach((d) => { d.open = false }) }, 500)
  }

  return createPortal(
    <div className="med-report-wrap">
      <div className="med-report">
        <div className="screen-only report-bar">
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
          <div className="chips" role="group" aria-label="Period">
            {[30, 90].map((d) => <button key={d} type="button" className="chip" aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</button>)}
          </div>
          <button type="button" className="btn" onClick={print} disabled={!report}>Print / Save PDF</button>
        </div>

        <h1>My medicines report</h1>
        <p className="rep-meta">{profileName(profile)}Made {fmtDate(new Date().toISOString())} · Your log: the last {days} days</p>
        <p className="statement">
          This report puts each medicine’s official label next to what you logged. The label text is quoted exactly from the
          U.S. Food and Drug Administration (via openFDA) and the National Institutes of Health. Daybook doesn’t grade, explain or
          interpret it. A side effect on a label and a symptom in your log are two facts side by side, not a cause.
        </p>

        {err && <p className="err">{err}</p>}
        {!report && !err && <p className="note">Putting your report together… this looks up each medicine’s label.</p>}

        {report && report.items.length === 0 && <p className="note">You have no current medicines on your list.</p>}

        {report && report.items.length > 0 && (
          <>
            <h2>Your medicines</h2>
            <ul className="rep-list">
              {report.items.map((it) => (
                <li key={it.med.id}><b>{it.med.name}</b>{medLine(it.med) ? `: ${medLine(it.med)}` : ''}{it.med.started_on ? `, since ${fmtDate(it.med.started_on)}` : ''}</li>
              ))}
            </ul>

            <h2>Alcohol and caffeine you logged</h2>
            {report.logged.checkinDays === 0
              ? <p>You didn’t do a daily check-in in the last {days} days, so Daybook has no alcohol or caffeine record for this period.</p>
              : (
                <p>
                  In the last {days} days you checked in on {plural(report.logged.checkinDays, 'day')}. You logged alcohol on {plural(report.logged.alcoholDays, 'day')}
                  {report.logged.alcoholDays ? ` (${plural(report.logged.drinks, 'drink')} in all)` : ''} and caffeine on {plural(report.logged.caffeineDays, 'day')}.
                </p>
              )}

            {report.between.length > 0 && (
              <>
                <h2>Where one label names another of your medicines</h2>
                <p className="note">Only exact names are found. A label that names a group of medicines (for example “NSAIDs” or “MAOIs”) isn’t matched here; read each label’s Drug Interactions in full.</p>
                {report.between.map(({ a, b, quotes }) => (
                  <div key={`${a.med.id}-${b.med.id}`} className="rep-block">
                    <p><b>The label for {a.med.name} names {b.med.name}:</b></p>
                    {quotes.map((q, i) => <blockquote key={i}>“{q.text}” <span className="rep-sec">({TITLE[q.section] || q.section})</span></blockquote>)}
                  </div>
                ))}
              </>
            )}

            {report.items.map((it) => <MedSection key={it.med.id} it={it} logged={report.logged} />)}

            <h2>Sources</h2>
            <ul className="rep-src">
              <li>Medicine labels: U.S. Food and Drug Administration, via openFDA (public domain); each label’s set id, version and the date Daybook fetched it are shown with it. openFDA says: “{OPENFDA_DISCLAIMER}”</li>
              <li>Medicine names: RxNorm, National Library of Medicine.</li>
              <li>Alcohol: {NIAAA_SOURCE.publisher}, “{NIAAA_SOURCE.title}”, {NIAAA_SOURCE.pub} ({NIAAA_SOURCE.url}), retrieved {NIAAA_SOURCE.retrieved}. Public domain.</li>
            </ul>
          </>
        )}

        <p className="rep-end"><b>Questions about these medicines? Ask your pharmacist or doctor.</b></p>
      </div>
    </div>,
    document.body,
  )
}

function MedSection({ it, logged }) {
  const l = it.label
  return (
    <section className="rep-med">
      <h2>{it.med.name}</h2>
      {it.status === 'not_matched' && <p>Not found. Daybook couldn’t match “{it.med.name}” to a medicine in RxNorm, so there is no label here. Edit the name to the one on the bottle or box.</p>}
      {it.status === 'no_label' && <p>Matched to {it.ref?.rx_name} (RxNorm). Not found: the FDA has no label for it on openFDA.</p>}
      {it.status === 'unavailable' && <p>The label lookup wasn’t available when this report was made.</p>}
      {l && (
        <>
          <p className="rep-meta">
            Matched to {it.ref?.rx_name} (RxNorm). Label: {l.title || l.generic_names?.[0]}{l.manufacturer ? `, ${l.manufacturer}` : ''}
            {l.effective_time ? `, effective ${fmtDate(l.effective_time)}` : ''}. Set id {l.set_id}{l.version ? `, version ${l.version}` : ''}.
            Fetched {fmtDate(l.retrieved_at)}. <a href={dailyMedUrl(l.set_id)} target="_blank" rel="noreferrer">Full label on DailyMed</a>.
            The label in your box is the one that applies to you.
          </p>

          {it.symptoms.length > 0 && (
            <div className="rep-block">
              <h3>Your symptoms that this label also lists</h3>
              {it.symptoms.map((s) => (
                <div key={s.name}>
                  <p>{s.name} is listed on the label for {it.med.name}. You logged {s.name.toLowerCase()} {plural(s.count, 'time')} {s.since ? `since starting it on ${fmtDate(s.since)}` : 'while taking it'}.</p>
                  <blockquote>“{s.quote.text}” <span className="rep-sec">({TITLE[s.quote.section] || s.quote.section})</span></blockquote>
                </div>
              ))}
            </div>
          )}

          {(it.alcohol.length > 0 || it.niaaa.length > 0) && (
            <div className="rep-block">
              <h3>Alcohol</h3>
              {logged.alcoholDays > 0 && <p><b>You logged alcohol on {plural(logged.alcoholDays, 'day')} in the last {logged.days} days.</b>{it.alcohol.length ? ` The label for ${it.med.name} says:` : ''}</p>}
              {it.alcohol.map((q, i) => <blockquote key={i}>“{q.text}” <span className="rep-sec">({TITLE[q.section] || q.section})</span></blockquote>)}
              {it.niaaa.map(([cond, brand, generic, reactions], i) => (
                <p key={i}>The NIH’s alcohol interactions list includes {generic} ({brand}), under “{cond}”. Some possible reactions with alcohol: “{reactions}”</p>
              ))}
              {it.niaaa.length > 0 && <p className="note">NIAAA: “{NIAAA_CAVEAT}”</p>}
            </div>
          )}

          {it.caffeineFood.length > 0 && (
            <div className="rep-block">
              <h3>Caffeine and food</h3>
              {it.caffeineFood.some((q) => /caffeine|coffee/i.test(q.text)) && logged.caffeineDays > 0 && <p><b>You logged caffeine on {plural(logged.caffeineDays, 'day')} in the last {logged.days} days.</b></p>}
              {it.caffeineFood.map((q, i) => <blockquote key={i}>“{q.text}” <span className="rep-sec">({TITLE[q.section] || q.section})</span></blockquote>)}
            </div>
          )}

          <Quoted title="Warnings" l={l} keys={WARN} />
          <Quoted title="Side effects" l={l} keys={['adverse_reactions']} />
          <Quoted title="Drug interactions" l={l} keys={['drug_interactions']} />
          {it.pregnancy.length > 0 && <Quoted title="Pregnancy and breastfeeding" l={l} keys={it.pregnancy} />}
        </>
      )}
    </section>
  )
}

// Whole label sections, quoted. Folded on screen; printed in full.
function Quoted({ title, l, keys }) {
  const present = keys.filter((k) => l.sections?.[k]?.length)
  if (!present.length) return null
  return (
    <details className="rep-block rep-quoted">
      <summary>{title} (from the label)</summary>
      {present.map((k) => (
        <div key={k}>
          <h4>{TITLE[k] || k}</h4>
          {l.sections[k].map((t, i) => <blockquote key={i}>{t}</blockquote>)}
        </div>
      ))}
    </details>
  )
}
