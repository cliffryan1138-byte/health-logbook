import { useEffect, useMemo, useState } from 'react'
import Icon from '../lib/icons'
import {
  KINDS, isHeadache, toCSV, download, slug, dayKey, fmtDay, fmtTime, fmtStamp, describe,
} from '../lib/entries'
import { sha256, logEvent, loadHistory } from '../lib/audit'
import Activity from '../components/Activity'
import { medLine } from '../lib/meds'

// Everything that was logged, as it was logged — the answer to "where do I see
// my headache log?" — plus the file to hand a doctor or a lawyer.
//
// The printable record is plain HTML with print CSS rather than a PDF library:
// every phone and desktop browser can "Save as PDF" from the print dialog, and it
// adds nothing to the bundle. It reproduces entries verbatim and interprets
// nothing; the only arithmetic on it is counting.
//
// Every export is fingerprinted: the SHA-256 of the spreadsheet for the same
// selection is printed on the record and logged with the export, so a printout
// and a CSV can be matched to each other and to the log. Entries changed after
// they were recorded are marked, and their earlier versions (and any removed
// entries) are listed at the end of the printed record.

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
      'Suspected triggers are the person’s guesses at the time. Entries changed after they were ' +
      'recorded are marked “edited”, and every earlier version, like every removed entry, is listed ' +
      'under “Changes after recording”. The fingerprint is the SHA-256 of the spreadsheet (CSV) export ' +
      'of the same entries. This record was generated from a personal tracking app and contains no ' +
      'medical diagnosis or interpretation.',
  },
}

export default function Logbook({ entries, days, profile, medications = [] }) {
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

  // The exact spreadsheet text for this selection, and its fingerprint.
  const csvText = useMemo(() => toCSV(shown), [shown])
  const [fp, setFp] = useState({ for: null, hash: '' })
  useEffect(() => {
    let live = true
    sha256(csvText).then((hash) => { if (live) setFp({ for: csvText, hash }) })
    return () => { live = false }
  }, [csvText])
  const hash = fp.for === csvText ? fp.hash : ''

  // Earlier versions of edited entries and removed entries (rare: the app never
  // edits or deletes, but the database keeps a trail if anything ever does).
  const [history, setHistory] = useState([])
  useEffect(() => { loadHistory(profile.id).then(setHistory).catch(() => setHistory([])) }, [profile.id])
  const changes = useMemo(() => {
    const ids = new Set(shown.map((e) => e.id))
    // Changes to the medication list itself show in its own section, not here.
    return history.filter((h) => {
      if (!KINDS[h.table_name]) return false
      if (ids.has(`${h.table_name}:${h.row_id}`)) return true
      if (h.op !== 'delete') return false
      const at = new Date(h.old_row[KINDS[h.table_name].time])
      const e = { kind: h.table_name, raw: h.old_row }
      if (at < new Date(Date.now() - (days - 1) * 86400000)) return false
      if (headOnly) return isHeadache(e)
      return kind === 'all' || kind === h.table_name
    })
  }, [history, shown, headOnly, kind, days])

  const [done, setDone] = useState('')
  const record = (event, verb) => {
    logEvent(profile.id, event, {
      purpose, days, filter: kind, searched: Boolean(q.trim()), count: shown.length, sha256: hash,
    })
    setDone(`${verb} ${shown.length} ${shown.length === 1 ? 'entry' : 'entries'} · fingerprint ${hash.slice(0, 12)}…`)
  }

  const csv = () => { download(`${base}.csv`, csvText); record('export_csv', 'Downloaded') }
  const print = () => {
    const before = document.title
    document.title = base
    record('export_print', 'Printed')
    window.print()
    setTimeout(() => { document.title = before }, 500)
  }
  const canShare = typeof navigator !== 'undefined' && navigator.canShare &&
    navigator.canShare({ files: [new File([''], 'x.csv', { type: 'text/csv' })] })
  const share = async () => {
    const file = new File([csvText], `${base}.csv`, { type: 'text/csv' })
    try {
      await navigator.share({ files: [file], title: PURPOSES[purpose].title })
      record('export_share', 'Shared')
    } catch { /* cancelled */ }
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
              <button type="button" className="btn" onClick={print} disabled={!shown.length || !hash}>Print / Save PDF</button>
              <button type="button" className="btn ghost" onClick={csv} disabled={!shown.length || !hash}>Spreadsheet (CSV)</button>
              {canShare && <button type="button" className="btn ghost" onClick={share} disabled={!shown.length || !hash}>Share</button>}
            </div>
            {done && <p className="saved-note" role="status">✓ {done}</p>}
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
                        {e.edited && <div className="feed-late">Edited · {fmtStamp(e.edited)}</div>}
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

        <Activity profileId={profile.id} refreshKey={done} />
      </div>

      <PrintRecord entries={shown} purpose={PURPOSES[purpose]} who={profile.display_name} period={period}
        filterText={filterText} hash={hash} changes={changes} medications={medications} from={from} />
    </>
  )
}

// The page that prints. Hidden on screen; oldest first, numbered, verbatim.
function PrintRecord({ entries, purpose, who, period, filterText, hash, changes, medications, from }) {
  const rows = [...entries].sort((a, b) => a.at - b.at)
  const days = new Set(rows.map((e) => dayKey(e.at))).size
  const sev = rows.map((e) => e.raw.severity_1_5).filter((v) => v != null)
  const tally = [1, 2, 3, 4, 5].map((s) => [s, sev.filter((v) => v === s).length]).filter(([, c]) => c)
  // Medicines on the list at any point in the period, as listed.
  const fromDay = dayKey(from)
  const meds = medications.filter((m) => !m.stopped_on || m.stopped_on >= fromDay)
  return (
    <div className="print-only record">
      <h1>{purpose.title}</h1>
      <p><b>Person:</b> {who}</p>
      <p><b>Period:</b> {period}</p>
      <p><b>Showing:</b> {filterText}</p>
      <p><b>Generated:</b> {fmtStamp(new Date())}</p>
      <p><b>Fingerprint (SHA-256 of the matching CSV):</b> <span className="rec-hash">{hash}</span></p>
      <div className="statement">{purpose.statement}</div>
      <ul className="counts">
        <li>{rows.length} {rows.length === 1 ? 'entry' : 'entries'} on {days} {days === 1 ? 'day' : 'days'}</li>
        {tally.length > 0 && <li>Severity ratings: {tally.map(([s, c]) => `${s} (${c}×)`).join(', ')}</li>}
      </ul>
      {meds.length > 0 && (
        <>
          <h2>Medications during this period</h2>
          <table>
            <thead><tr><th>Medicine</th><th>As listed</th><th>Started</th><th>Stopped</th></tr></thead>
            <tbody>
              {meds.map((m) => (
                <tr key={m.id}>
                  <td><b>{m.name}</b></td>
                  <td>{medLine(m)}{m.notes && <div className="rec-detail">{m.notes}</div>}</td>
                  <td>{m.started_on || ''}</td>
                  <td>{m.stopped_on || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>Entries</h2>
        </>
      )}
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
              <td>
                {fmtStamp(e.recorded)}
                {e.late && <div><i>entered later</i></div>}
                {e.edited && <div><i>edited {fmtStamp(e.edited)}</i></div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {changes.length > 0 && (
        <>
          <h2>Changes after recording</h2>
          <p>Each row is an entry as it stood before it was edited or removed. The database copies it here
            automatically; nobody can change or delete this list.</p>
          <table>
            <thead>
              <tr><th>Changed</th><th>What happened</th><th>Log</th><th>Entry before the change</th><th>Originally recorded</th></tr>
            </thead>
            <tbody>
              {changes.map((h, i) => {
                const d = describe(h.table_name, h.old_row)
                return (
                  <tr key={i}>
                    <td>{fmtStamp(new Date(h.changed_at))}</td>
                    <td>{h.op === 'delete' ? 'Removed' : 'Edited'}</td>
                    <td>{KINDS[h.table_name].one}</td>
                    <td>
                      <b>{d.title}</b>{d.stats && ` · ${d.stats}`}
                      <div className="rec-detail">{fmtStamp(new Date(h.old_row[KINDS[h.table_name].time]))}{d.detail && ` — ${d.detail}`}</div>
                    </td>
                    <td>{h.old_row.created_at ? fmtStamp(new Date(h.old_row.created_at)) : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
      <p className="rec-foot">Daybook · {who} · {purpose.title} · SHA-256 {hash}</p>
    </div>
  )
}
