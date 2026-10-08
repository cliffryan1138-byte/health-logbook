import { supabase } from './supabase'

// GPS routes for runs, walks and rucks (see supabase/migrations/0016).
//
// A route is a list of points [lat, lon, seconds from start, elevation m |
// null, 1 if it starts a new stretch after a pause]. Distance, moving time and
// climb come from the full track; before saving, the first and last 200 m are
// cut off so the map never shows where someone starts and ends (usually home).
//
// A saved route is one `exercise` row (activity, minutes, distance, pack
// weight) plus one `exercise_routes` row for the map, so the Logbook, the
// printout and the change history treat it like any other workout.

export const ACTIVITIES = ['Run', 'Walk', 'Ruck']
export const PRIVACY_M = 200
const MAX_POINTS = 5000
const M_PER_MI = 1609.344

// Metres between two [lat, lon] points (haversine).
export function metres(a, b) {
  const R = 6371000, rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Distance, moving time and climb for a track. A stretch counts as moving at
// 0.5 m/s or more (a slow walk is ~1 m/s); a jump across a pause doesn't count.
export function trackStats(points) {
  let distance = 0, moving = 0, climb = 0, base = null
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    if (b[4]) continue
    const d = metres(a, b), dt = b[2] - a[2]
    distance += d
    if (dt > 0 && dt <= 120 && d / dt >= 0.5) moving += dt
  }
  // Climb with a 3 m dead band, so GPS jitter doesn't add up to a hill.
  for (const p of points) {
    if (p[3] == null) continue
    if (base == null || p[3] < base) base = p[3]
    else if (p[3] - base >= 3) { climb += p[3] - base; base = p[3] }
  }
  return { distance_m: Math.round(distance), moving_sec: Math.round(moving), elevation_gain_m: Math.round(climb) }
}

// Cut `m` metres off each end of the track.
export function trimEnds(points, m = PRIVACY_M) {
  const cut = (list) => {
    let run = 0
    for (let i = 1; i < list.length; i++) {
      run += metres(list[i - 1], list[i])
      if (run >= m) return list.slice(i)
    }
    return []
  }
  const front = cut(points)
  if (front.length) front[0] = front[0].slice(0, 4) // the first kept point never "starts a stretch"
  return cut(front.slice().reverse()).reverse()
}

// Fewer points for storage: drop points within 4 m of the last kept one, then
// thin evenly to MAX_POINTS. Pause markers are always kept.
export function thin(points) {
  const kept = []
  for (const p of points) {
    const last = kept[kept.length - 1]
    if (!last || p[4] || metres(last, p) >= 4) kept.push(p)
  }
  if (kept.length <= MAX_POINTS) return kept
  const step = kept.length / MAX_POINTS
  return kept.filter((p, i) => p[4] || Math.floor(i / step) !== Math.floor((i - 1) / step) || i === kept.length - 1)
}

const round = (p) => [+p[0].toFixed(6), +p[1].toFixed(6), Math.round(p[2]), p[3] == null ? null : Math.round(p[3] * 10) / 10, ...(p[4] ? [1] : [])]

// A GPX file (from a watch, Apple Health, Strava, Garmin…) as a track.
export function parseGpx(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('That file isn’t a GPX file Daybook can read.')
  const segs = [...doc.getElementsByTagName('trkseg')]
  const groups = segs.length ? segs.map((s) => [...s.getElementsByTagName('trkpt')]) : [[...doc.getElementsByTagName('rtept')]]
  const raw = []
  groups.forEach((pts, g) => pts.forEach((el, k) => {
    const lat = Number(el.getAttribute('lat')), lon = Number(el.getAttribute('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
    const ele = el.getElementsByTagName('ele')[0]?.textContent
    const time = el.getElementsByTagName('time')[0]?.textContent
    raw.push({ lat, lon, ele: ele != null && ele !== '' ? Number(ele) : null, t: time ? Date.parse(time) : null, newSeg: g > 0 && k === 0 })
  }))
  if (raw.length < 2) throw new Error('No route found in that file.')
  const start = raw.find((p) => p.t)?.t ?? null
  const points = raw.map((p) => [p.lat, p.lon, start != null && p.t != null ? (p.t - start) / 1000 : 0, Number.isFinite(p.ele) ? p.ele : null, ...(p.newSeg ? [1] : [])])
  const name = doc.querySelector('trk > name, metadata > name')?.textContent?.trim() || ''
  const type = doc.querySelector('trk > type')?.textContent?.trim().toLowerCase() || ''
  const activity = /run/.test(type + name.toLowerCase()) ? 'Run' : /ruck/.test(type + name.toLowerCase()) ? 'Ruck' : 'Walk'
  const last = points[points.length - 1][2]
  return { points, startedAt: start, elapsedSec: start != null ? Math.round(last) : null, name, activity }
}

export const miles = (m) => m / M_PER_MI
export const fmtMiles = (m) => `${miles(m).toFixed(2)} mi`
export function fmtPace(sec, m) {
  if (!m || m < 50 || !sec) return '–'
  const s = Math.round(sec / miles(m))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /mi`
}
export function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s % 60).padStart(2, '0')}`
}

// Save a finished or imported route: the exercise entry, then its map.
export async function saveRoute(profileId, { activity, startedAt, points, source, packLb, notes, minutes }) {
  const stats = trackStats(points)
  const mins = minutes ? Number(minutes) : Math.max(1, Math.round((stats.moving_sec || points[points.length - 1][2]) / 60))
  const { data: ex, error } = await supabase.from('exercise').insert({
    profile_id: profileId,
    activity,
    duration_min: mins,
    intensity: null,
    distance_m: stats.distance_m,
    pack_lb: activity === 'Ruck' && packLb !== '' && packLb != null ? Number(packLb) : null,
    notes: [`${fmtMiles(stats.distance_m)}, ${fmtPace(mins * 60, stats.distance_m)}${stats.elevation_gain_m ? `, ${Math.round(stats.elevation_gain_m * 3.28084)} ft climb` : ''}.`, notes?.trim()].filter(Boolean).join(' '),
    done_at: new Date(startedAt).toISOString(),
  }).select().single()
  if (error) throw error
  const kept = thin(trimEnds(points)).map(round)
  if (kept.length >= 2) {
    const { error: e2 } = await supabase.from('exercise_routes').insert({
      profile_id: profileId, exercise_id: ex.id, source, points: kept, trimmed_m: PRIVACY_M,
      moving_sec: stats.moving_sec, elevation_gain_m: stats.elevation_gain_m,
    })
    if (e2) throw new Error(`The ${activity.toLowerCase()} was saved, but its map wasn’t: ${e2.message}`)
  }
  return ex
}

export async function loadRoute(exerciseId) {
  const { data, error } = await supabase.from('exercise_routes').select('points, moving_sec, elevation_gain_m, trimmed_m')
    .eq('exercise_id', exerciseId).maybeSingle()
  if (error) throw error
  return data
}
