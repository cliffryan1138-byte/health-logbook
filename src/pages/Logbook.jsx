import { useMemo, useState } from 'react'
import Icon from '../lib/icons'
import {
  KINDS, isHeadache, toCSV, download, slug, dayKey, fmtDay, fmtTime, fmtStamp,
} from '../lib/entries'

// Everything that was logged, as it was logged — the answer to "where do I see
// my headache log?" — plus the file to hand a doctor or a lawyer.
//
// The printable record is plain HTML with print CSS rather than a PDF library:
// every phone and desktop browser can "Save as PDF" from the print dialog, and it
// adds nothing to the bundle. It reproduces entries verbatim and interprets
// nothing; the only arithmetic on it is counting.

const PURPOSES = {
  personal: {
    label: 'For me',
    title: 'Health log',
    statement: 'Entries are reproduced exactly as they were logged.',
  },
  doctor: {
    label: 'For my doctor',
    title: 'Health log for clinical review',
    statement:
      'Self-recorded log, reproduced exactly as logged. Severity is the person’s own 1–5 rating. Food ' +
      'quantities are estimates from photos and recall; vitals are self-taken with home equipment. ' +
      'Suspected triggers are the person’s guesses at the time, not confirmed causes. Nothing here is a ' +
      'diagnosis or an interpretation.',
  },
  legal: {
    label: 'For my lawyer',
    title: 'Record of self-logged health entries',
    statement:
      'Every entry in the stated period that matches the stated filter is reproduced verbatim, in date ' +
      'order, without editing, omission, or summary. “Date” and “Time” are when the person reported the ' +
      'event occurred. “Recorded” is when the entry was written to the log; entries written more than ' +
      '24 hours after the event are marked “entered later”. Severity is the person’s own 1–5 rating. ' +
      'Suspected triggers are the person’s guesses at the time. This record was generated from a ' +
      'personal tracking app and contains no medical diagnosis or interpretation.',
  },
}

export default function Logbook({ entries, days, profile }) {
  const hasHead = entries.some(isHeadache)
  const kinds = Object.keys(KINDS).filter((k) => entries.some((e) => e.kind === k))
  const [kind, setKind] = useState('all')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(40)
  const [purpose, setPurpose] = useState('personal')

  const headOnly = kind === 'headaches'
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return entries.filter((e) => {
      if (headOnly) { if (!isHeadache(e)) return false }
      else if (kind !== 'all' && e.kind !== kind) return false
      if (!needle) return true
      return [e.title, e.stats, e.detail].join(' ').toLowerCase().includes(needle)
    })
  }, [entries, kind, q, headOnly])

  const filterText = [
    headOnly ? 'headaches and migraines' : kind === 'all' ? 'all entries' : KINDS[kind].label.toLowerCase(),
    q.trim() && `containing “${q.trim()}”`,
  ].filter(Boolean).join(' ')
  const from = new Date(Date.now() - (days - 1) * 86400000)
  const period = `${fmtDay(from, { month: 'long', day: 'numeric', year: 'numeric' })} – ${fmtDay(new Date(), { month: 'long', day: 'numeric', year: 'numeric' })}`
  const base = `${slug(profile.display_name)}-${headOnly ? 'headache-log' : 'health-log'}-${dayKey(new Date())}`

  const csv = () => download(`${base}.csv`, toCSV(shown))
  const print = () => {
    const before = document.title
    document.title = base
    window.print()
    setTimeout(() => { document.title = before }, 500)
  }
  const canShare = typeof navigator !== 'undefined' && navigator.canShare &&
    navigator.canShare({ files: [new File([''], 'x.csv', { type: 'text/csv' })] })
  const share = async () => {
    const file = new File([toCSV(shown)], `${base}.csv`, { type: 'text/csv' })
    try { await navigator.share({ files: [file], title: PURPOSES[purpose].title }) } catch { /* cancelled */ }
  }

  // Group the visible slice by day for the screen view.
  const groups = []
  for (const e of shown.slice(0, limit)) {
    const k = dayKey(e.at)
    const g = groups[groups.length - 1]
    if (g && g.k === k) g.items.push(e)
    else groups.push({ k, d: e.at, items: [e] })
  }
  const todayK = dayKey(new Date()), yestK = dayKey(new Date(Date.now() - 86400000))
  const dayName = (g) => g.k === todayK ? 'Today' : g.k === yestK ? 'Yesterday' : fmtDay(g.d, { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <>
      <div className="screen-only">
        <div className="card">
          <div className="chips tight" role="group" aria-label="Show">
            <button type="button" className="chip" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>All</button>
            {hasHead && <button type="button" className="chip" aria-pressed={headOnly} onClick={() => setKind('headaches')}>Headaches</button>}
            {kinds.map((k) => (
              <button type="button" key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{KINDS[k].label}</button>
            ))}
          </div>
          <input className="search" type="search" placeholder="Search notes, foods, symptoms…" value={q} onChange={(e) => setQ(e.target.value)} />

          <div className="export">
            <div className="export-head">
              <strong>Save or send {shown.length} {shown.length === 1 ? 'entry' : 'entries'}</strong>
              <span className="note">{period}</span>
            </div>
            <div className="chips tight" role="group" aria-label="Who is it for">
              {Object.entries(PURPOSES).map(([k, p]) => (
                <button type="button" key={k} className="chip" aria-pressed={purpose === k} onClick={() => setPurpose(k)}>{p.label}</button>
              ))}
            </div>
            <div className="actions">
              <button type="button" className="btn" onClick={print} disabled={!shown.length}>Print / Save PDF</button>
              <button type="button" className="btn ghost" onClick={csv} disabled={!shown.length}>Spreadsheet (CSV)</button>
              {canShare && <button type="button" className="btn ghost" onClick={share} disabled={!shown.length}>Share</button>}
            </div>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="card empty-state">
            <img src="/sparky.png" alt="" width="88" height="88" />
            <p>{entries.length ? 'Nothing matches that filter in this range.' : 'Nothing logged in this range yet. Tap Photo or a button below to add your first entry.'}</p>
          </div>
        ) : (
          <div className="card feed-card">
            {groups.map((g) => (
              <section key={g.k}>
                <h4 className="day-h">{dayName(g)}</h4>
                <ul className="feed">
                  {g.items.map((e) => (
                    <li key={e.id}>
                      <span className={`feed-ico k-${e.kind}`}><Icon name={KINDS[e.kind].icon} /></span>
                      <div className="feed-body">
                        <div className="feed-title">{e.title}{e.stats && <span className="feed-stats"> · {e.stats}</span>}</div>
                        {e.detail && <div className="feed-detail">{e.detail}</div>}
                        {e.late && <div className="feed-late">Entered later · {fmtStamp(e.recorded)}</div>}
                      </div>
                      <time className="feed-time">{fmtTime(e.at)}</time>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {shown.length > limit && (
              <button type="button" className="btn ghost more" onClick={() => setLimit(limit + 60)}>
                Show more ({shown.length - limit} left)
              </button>
            )}
          </div>
        )}
      </div>

      <PrintRecord entries={shown} purpose={PURPOSES[purpose]} who={profile.display_name} period={period} filterText={filterText} />
    </>
  )
}

// The page that prints. Hidden on screen; oldest first, numbered, verbatim.
function PrintRecord({ entries, purpose, who, period, filterText }) {
  const rows = [...entries].sort((a, b) => a.at - b.at)
  const days = new Set(rows.map((e) => dayKey(e.at))).size
  const sev = rows.map((e) => e.raw.severity_1_5).filter((v) => v != null)
  const tally = [1, 2, 3, 4, 5].map((s) => [s, sev.filter((v) => v === s).length]).filter(([, c]) => c)
  return (
    <div className="print-only record">
      <h1>{purpose.title}</h1>
      <p><b>Person:</b> {who}</p>
      <p><b>Period:</b> {period}</p>
      <p><b>Showing:</b> {filterText}</p>
      <p><b>Generated:</b> {fmtStamp(new Date())}</p>
      <div className="statement">{purpose.statement}</div>
      <ul className="counts">
        <li>{rows.length} {rows.length === 1 ? 'entry' : 'entries'} on {days} {days === 1 ? 'day' : 'days'}</li>
        {tally.length > 0 && <li>Severity ratings: {tally.map(([s, c]) => `${s} (${c}×)`).join(', ')}</li>}
      </ul>
      <table>
        <thead>
          <tr><th>#</th><th>Date</th><th>Time</th><th>Log</th><th>Entry</th><th>Recorded</th></tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={e.id}>
              <td>{i + 1}</td>
              <td>{dayKey(e.at)}</td>
              <td>{fmtTime(e.at)}</td>
              <td>{KINDS[e.kind].one}</td>
              <td>
                <b>{e.title}</b>{e.stats && ` · ${e.stats}`}
                {e.detail && <div className="rec-detail">{e.detail}</div>}
              </td>
              <td>{fmtStamp(e.recorded)}{e.late && <div><i>entered later</i></div>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="rec-foot">Health-Logbook · {who} · {purpose.title}</p>
    </div>
  )
}
