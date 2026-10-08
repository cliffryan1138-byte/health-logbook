import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ACTIVITIES, PRIVACY_M, metres, trackStats, trimEnds, parseGpx, saveRoute, fmtMiles, fmtPace, fmtClock } from '../lib/routes'

// Run, walk or ruck with GPS, or bring one in from a watch as a GPX file.
//
// Daybook is a web app, so the phone only hands it GPS while Daybook is open
// and the screen is on. While tracking it asks the phone to keep the screen
// awake (Wake Lock), says so plainly, and notes any stretch where GPS stopped.
// The track in progress is kept on the phone after every point, so closing
// the app by accident doesn't lose it.
//
// Nothing is saved until the review step's Save: a live track and an
// imported file both land there, the same way a plan read from a photo does.

const RouteMap = lazy(() => import('./RouteMap'))
const MAX_ACCURACY_M = 35 // fixes vaguer than this are skipped
const MIN_STEP_M = 3      // ignore jitter while standing still
const MAX_SPEED = 15      // m/s; anything faster is a GPS jump (or a car)

const keyOf = (uid) => `lb_track_${uid}`
function loadTrack(uid) { try { return JSON.parse(localStorage.getItem(keyOf(uid))) } catch { return null } }
function keepTrack(uid, t) { try { t ? localStorage.setItem(keyOf(uid), JSON.stringify(t)) : localStorage.removeItem(keyOf(uid)) } catch { /* storage off */ } }

function toLocalInput(ms) {
  const d = new Date(ms)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const geoError = (e) => (e?.code === 1
  ? 'Daybook isn’t allowed to use your location. Turn on Location for Daybook (on iPhone: Settings › Privacy & Security › Location Services › Safari Websites, “While Using”), then try again.'
  : 'Can’t get a GPS fix yet. Step outside, away from tall buildings, and wait a moment.')

export default function RouteTracker({ profile, onLogged }) {
  const uid = profile.id
  const [track, setTrack] = useState(() => loadTrack(uid))
  const [review, setReview] = useState(null)
  const [activity, setActivity] = useState('Run')
  const [packLb, setPackLb] = useState('')
  const [fix, setFix] = useState(null) // { accuracy } of the latest reading
  const [now, setNow] = useState(Date.now())
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const newStretch = useRef(false)

  useEffect(() => { keepTrack(uid, track) }, [uid, track])

  // GPS while tracking and not paused.
  const tracking = Boolean(track && !track.pausedAt)
  useEffect(() => {
    if (!tracking) return
    if (!navigator.geolocation) { setErr('This phone or browser doesn’t give Daybook GPS.'); return }
    const id = navigator.geolocation.watchPosition((pos) => {
      const { latitude, longitude, altitude, accuracy } = pos.coords
      setFix({ accuracy }); setErr('')
      if (accuracy > MAX_ACCURACY_M) return
      setTrack((t) => {
        if (!t || t.pausedAt) return t
        const p = [latitude, longitude, Math.max(0, (pos.timestamp - t.startedAt) / 1000), altitude ?? null]
        const last = t.points[t.points.length - 1]
        if (last && !newStretch.current) {
          const d = metres(last, p), dt = p[2] - last[2]
          if (d < MIN_STEP_M) return t
          if (dt > 0 && d / dt > MAX_SPEED) return t
        }
        if (last && newStretch.current) p[4] = 1
        newStretch.current = false
        return { ...t, points: [...t.points, p] }
      })
    }, (e) => setErr(geoError(e)), { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [tracking])

  // Keep the screen on while tracking; note any time spent in the background.
  useEffect(() => {
    if (!track) return
    let lock = null
    const ask = async () => { try { lock = await navigator.wakeLock?.request('screen') } catch { /* not allowed now */ } }
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        ask()
        setTrack((t) => {
          if (!t?.hiddenAt) return t
          const gap = Date.now() - t.hiddenAt
          return { ...t, hiddenAt: null, gapSec: (t.gapSec || 0) + (t.pausedAt ? 0 : gap / 1000) }
        })
      } else setTrack((t) => (t ? { ...t, hiddenAt: Date.now() } : t))
    }
    ask()
    document.addEventListener('visibilitychange', onVis)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(tick); lock?.release?.().catch(() => {}) }
  }, [Boolean(track)]) // eslint-disable-line react-hooks/exhaustive-deps

  const elapsed = track ? (now - track.startedAt - (track.pausedMs || 0) - (track.pausedAt ? now - track.pausedAt : 0)) / 1000 : 0

  function start() {
    setSaved(''); setErr('')
    if (!navigator.geolocation) { setErr('This phone or browser doesn’t give Daybook GPS.'); return }
    if (activity === 'Ruck' && packLb !== '' && !(Number(packLb) >= 0 && Number(packLb) <= 300)) { setErr('Enter the pack weight in pounds.'); return }
    newStretch.current = false
    setTrack({ activity, packLb, startedAt: Date.now(), points: [], pausedMs: 0, pausedAt: null, gapSec: 0 })
  }
  const pause = () => setTrack((t) => ({ ...t, pausedAt: Date.now() }))
  function resume() {
    newStretch.current = true
    setTrack((t) => ({ ...t, pausedMs: (t.pausedMs || 0) + (Date.now() - t.pausedAt), pausedAt: null }))
  }
  function finish() {
    const t = track
    const secs = Math.round((Date.now() - t.startedAt - (t.pausedMs || 0) - (t.pausedAt ? Date.now() - t.pausedAt : 0)) / 1000)
    if (!t.pausedAt) pause() // Back from the review returns to a paused track
    setReview({
      source: 'live', activity: t.activity, packLb: t.packLb ?? '', points: t.points, at: toLocalInput(t.startedAt),
      minutes: String(Math.max(1, Math.round(secs / 60))), notes: '', gapSec: t.gapSec || 0,
    })
  }
  function discard() {
    if (!confirm('Throw away this track? Nothing from it will be saved.')) return
    setTrack(null); setReview(null)
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr(''); setSaved('')
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error('That file is over 15 MB.')
      const g = parseGpx(await file.text())
      setReview({
        source: 'gpx', activity: g.activity, packLb: '', points: g.points,
        at: toLocalInput(g.startedAt ?? Date.now()), notes: '',
        minutes: g.elapsedSec ? String(Math.max(1, Math.round(g.elapsedSec / 60))) : '',
        noTimes: g.startedAt == null,
      })
    } catch (x) { setErr(x.message || 'Couldn’t read that file.') }
  }

  async function save() {
    const r = review
    const at = new Date(r.at).getTime()
    if (Number.isNaN(at)) { setErr('Enter when you started.'); return }
    if (at > Date.now() + 5 * 60000) { setErr('That time is in the future.'); return }
    if (!(Number(r.minutes) > 0)) { setErr('Enter how many minutes it took.'); return }
    if (r.activity === 'Ruck' && r.packLb !== '' && !(Number(r.packLb) >= 0 && Number(r.packLb) <= 300)) { setErr('Enter the pack weight in pounds.'); return }
    setBusy(true); setErr('')
    try {
      await saveRoute(uid, { activity: r.activity, startedAt: at, points: r.points, source: r.source, packLb: r.packLb, notes: r.notes, minutes: r.minutes })
      const s = trackStats(r.points)
      setSaved(`${r.activity} saved: ${fmtMiles(s.distance_m)} in ${r.minutes} min.`)
      setReview(null)
      if (r.source === 'live') setTrack(null)
      onLogged?.()
    } catch (x) {
      setErr(x.message || 'Couldn’t save it. Check your connection; the track stays on this phone until it saves.')
    } finally { setBusy(false) }
  }

  // ------------------------------------------------------------ review
  if (review) {
    const r = review
    const s = trackStats(r.points)
    const shown = trimEnds(r.points)
    const set = (k) => (e) => setReview((x) => ({ ...x, [k]: e.target.value }))
    const tooShort = r.points.length < 2
    return (
      <div className="card route">
        <div className="card-head"><h3>{r.source === 'gpx' ? 'Check the imported route' : 'Check your track'}</h3></div>
        {tooShort
          ? <p className="note">No GPS points were recorded{r.source === 'live' ? ', so there’s no route to save. You can still log it from + Add › Exercise.' : '.'}</p>
          : (
            <>
              <div className="route-stats">
                <div><span>Distance</span><b>{fmtMiles(s.distance_m)}</b></div>
                <div><span>Pace</span><b>{fmtPace(Number(r.minutes) * 60, s.distance_m)}</b></div>
                <div><span>Climb</span><b>{s.elevation_gain_m ? `${Math.round(s.elevation_gain_m * 3.28084)} ft` : '–'}</b></div>
              </div>
              {shown.length > 1
                ? <Suspense fallback={<div className="route-map" style={{ height: 220 }} />}><RouteMap points={shown} height={220} /></Suspense>
                : <p className="note">This route is shorter than {PRIVACY_M * 2} m, so no map is saved; the distance still is.</p>}
              <p className="note">The first and last {PRIVACY_M} m are left off the saved map so it doesn’t show where you start and finish. Distance and pace count the whole route.</p>
              {r.gapSec >= 30 && <p className="note">GPS stopped for about {Math.round(r.gapSec / 60) || 1} min while Daybook was in the background, so the distance may be short.</p>}
            </>
          )}
        {!tooShort && (
          <>
            <div className="chips" role="group" aria-label="Activity">
              {ACTIVITIES.map((a) => <button key={a} type="button" className="chip" aria-pressed={r.activity === a} onClick={() => setReview((x) => ({ ...x, activity: a }))}>{a}</button>)}
            </div>
            {r.activity === 'Ruck' && <label className="field"><span>Pack weight (lb)</span><input inputMode="decimal" value={r.packLb} onChange={set('packLb')} /></label>}
            <label className="field"><span>When did you start?</span><input type="datetime-local" value={r.at} onChange={set('at')} /></label>
            <label className="field"><span>Minutes{r.noTimes ? ' (this file has no times)' : ''}</span><input inputMode="numeric" value={r.minutes} onChange={set('minutes')} /></label>
            <label className="field"><span>Notes (how it felt, pain, terrain)</span><textarea rows={2} value={r.notes} onChange={set('notes')} /></label>
          </>
        )}
        {err && <p className="err">{err}</p>}
        <div className="actions">
          {r.source === 'live'
            ? <button type="button" className="btn ghost" onClick={tooShort ? discard : () => setReview(null)} disabled={busy}>{tooShort ? 'Discard' : 'Back'}</button>
            : <button type="button" className="btn ghost" onClick={() => { setReview(null); setErr('') }} disabled={busy}>Cancel</button>}
          {!tooShort && <button type="button" className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>}
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------ tracking
  if (track) {
    const s = trackStats(track.points)
    return (
      <div className="card route">
        <div className="card-head"><h3>{track.activity}{track.pausedAt ? ' · paused' : ''}</h3></div>
        <div className="route-stats big">
          <div><span>Time</span><b>{fmtClock(elapsed)}</b></div>
          <div><span>Distance</span><b>{fmtMiles(s.distance_m)}</b></div>
          <div><span>Pace</span><b>{fmtPace(s.moving_sec, s.distance_m)}</b></div>
        </div>
        <Suspense fallback={<div className="route-map" style={{ height: 240 }} />}><RouteMap points={track.points} follow height={240} /></Suspense>
        <p className="note">
          {!track.pausedAt && !track.points.length && !err && 'Finding you… '}
          {fix && fix.accuracy > MAX_ACCURACY_M && !track.pausedAt && `Weak GPS (±${Math.round(fix.accuracy)} m). `}
          Keep Daybook open with the screen on: the phone stops sending GPS to it when the screen locks.
        </p>
        {err && <p className="err">{err}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={discard}>Discard</button>
          {track.pausedAt
            ? <button type="button" className="btn ghost" onClick={resume}>Resume</button>
            : <button type="button" className="btn ghost" onClick={pause}>Pause</button>}
          <button type="button" className="btn" onClick={finish}>Finish</button>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------ start
  return (
    <div className="card route">
      <div className="card-head"><h3>Run, walk or ruck with GPS</h3></div>
      {saved && <p className="saved-note">✓ {saved}</p>}
      <div className="chips" role="group" aria-label="Activity">
        {ACTIVITIES.map((a) => <button key={a} type="button" className="chip" aria-pressed={activity === a} onClick={() => setActivity(a)}>{a}</button>)}
      </div>
      {activity === 'Ruck' && <label className="field"><span>Pack weight (lb)</span><input inputMode="decimal" value={packLb} onChange={(e) => setPackLb(e.target.value)} /></label>}
      <p className="note">Tracks your route, distance and pace on a map. Keep Daybook open with the screen on while you go.</p>
      <input ref={fileRef} type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden onChange={onFile} />
      {err && <p className="err">{err}</p>}
      <div className="actions">
        <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>Import a GPX file</button>
        <button type="button" className="btn" onClick={start}>Start {activity.toLowerCase()}</button>
      </div>
    </div>
  )
}
