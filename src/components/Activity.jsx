import { useEffect, useState } from 'react'
import { EVENT_LABELS, loadActivity } from '../lib/audit'
import { fmtStamp } from '../lib/entries'

// "Sign-ins and exports": the person's own access log, newest first. If a
// sign-in or an export here wasn't them, that's the moment to change their
// password. Collapsed by default; it's there to be checked, not read daily.

const PURPOSE = { personal: 'for me', doctor: 'for my doctor', legal: 'for my lawyer' }

function describe(ev) {
  const d = ev.detail || {}
  if (ev.event === 'sign_in') {
    const ua = d.user_agent || ''
    const device = /iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Android/.test(ua) ? 'Android'
      : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : ua ? 'another device' : ''
    return device ? `on ${device}` : ''
  }
  return [
    d.count != null && `${d.count} ${d.count === 1 ? 'entry' : 'entries'}`,
    PURPOSE[d.purpose],
    d.sha256 && `fingerprint ${d.sha256.slice(0, 12)}…`,
  ].filter(Boolean).join(' · ')
}

export default function Activity({ profileId, refreshKey }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    loadActivity(profileId).then(setRows).catch((e) => { setErr(e.message || 'Couldn’t load activity.'); setRows([]) })
  }, [open, profileId, refreshKey])

  return (
    <details className="card activity" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <b>Sign-ins and exports</b>
        <span className="note">Your record’s access log</span>
      </summary>
      {rows === null ? <p className="note">Loading…</p>
        : rows.length === 0 ? <p className="note">{err || 'Nothing yet. Sign-ins and every print, download or share will show here.'}</p>
          : (
            <ul className="activity-list">
              {rows.map((ev, i) => (
                <li key={i}>
                  <span className="activity-what">{EVENT_LABELS[ev.event] || ev.event}</span>
                  <span className="activity-detail">{describe(ev)}</span>
                  <time>{fmtStamp(new Date(ev.at))}</time>
                </li>
              ))}
            </ul>
          )}
      <p className="note" style={{ marginBottom: 0 }}>Don’t recognise something here? Change your password from the sign-in page (“Forgot password?”).</p>
    </details>
  )
}
