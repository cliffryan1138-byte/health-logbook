import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLogs } from '../hooks/useLogs'
import Card from '../components/Card'
import QuickLog from '../components/QuickLog'
import InstallPrompt from '../components/InstallPrompt'
import FeedbackBox from '../components/FeedbackBox'
import SymptomCalendar from '../components/SymptomCalendar'
import TrendChart from '../components/TrendChart'
import Logbook from './Logbook'
import Workouts from './Workouts'
import WorkoutHistory from '../components/WorkoutHistory'
import Medications from '../components/Medications'
import SparkyChat from '../components/SparkyChat'
import Settings from '../components/Settings'
import MindCard from '../components/MindCard'
import Icon from '../lib/icons'
import { avg, sum, triggerMatches, fmt } from '../lib/stats'
import { KINDS, toEntries, dayKey, fmtDay, fmtTime, entryClock, isHeadache } from '../lib/entries'

// Three views. Overview is the at-a-glance picture — one headline, at most four
// tiles, medications, a symptom calendar and ONE trend chart with tabs —
// replacing the stack of eight cards testers found crowded. Workouts is the
// training plan and past sessions (brought back from Sparky Fit, 2026-10-07).
// Logbook is every entry as logged, with the export a doctor or lawyer asked
// for. Sparky, by voice or text, is one tap away on the dock in every view.
//
// Every figure is a count or an average over logged rows; unlogged days are
// gaps, never zeros. Tiles only appear for things this person actually logs.

const RANGES = [[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, 'Year']]
const DAY = 86400000

function remembered(key, fallback, allowed) {
  try {
    const v = JSON.parse(localStorage.getItem('lb_view') || '{}')[key]
    return allowed.includes(v) ? v : fallback
  } catch { return fallback }
}

export default function Dashboard() {
  const { profile, signOut, refreshProfile } = useAuth()
  const [settings, setSettings] = useState(false)
  const [range, setRange] = useState(() => remembered('range', 30, RANGES.map((r) => r[0])))
  const [view, setView] = useState(() => remembered('view', 'overview', ['overview', 'workouts', 'logbook']))
  // The calendar always wants at least five weeks of context.
  const fetchDays = Math.max(range, 35)
  const logs = useLogs(profile.id, fetchDays)
  const [logKind, setLogKind] = useState(null)
  // null = closed; 'type', 'talk' (starts the mic straight away), or
  // { photo: File } from "Take a picture" (Sparky reads it straight away).
  const [chat, setChat] = useState(null)
  // Bumped when a workout is saved, so Past workouts reloads.
  const [workoutsSaved, setWorkoutsSaved] = useState(0)

  useEffect(() => {
    try { localStorage.setItem('lb_view', JSON.stringify({ range, view })) } catch { /* private mode */ }
  }, [range, view])

  const all = useMemo(() => toEntries(logs), [logs])
  const from = useMemo(() => { const d = new Date(Date.now() - (range - 1) * DAY); d.setHours(0, 0, 0, 0); return d }, [range])
  const entries = useMemo(() => all.filter((e) => e.at >= from), [all, from])

  return (
    <div className="wrap">
      <header className="topbar screen-only">
        <div className="brand">
          <img className="mark" src="/sparky.png" alt="" width="44" height="44" />
          <h1>Daybook</h1>
        </div>
        <button className="signout" onClick={() => setSettings(true)}>Settings</button>
        <button className="signout" onClick={signOut}>Sign out</button>
      </header>

      <div className="viewbar screen-only">
        <div className="seg" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view === 'overview'} onClick={() => setView('overview')}>Overview</button>
          <button role="tab" aria-selected={view === 'workouts'} onClick={() => setView('workouts')}>Workouts</button>
          <button role="tab" aria-selected={view === 'logbook'} onClick={() => setView('logbook')}>Logbook</button>
        </div>
        {view !== 'workouts' && (
          <div className="seg" role="group" aria-label="Time range">
            {RANGES.map(([v, l]) => (
              <button key={v} aria-pressed={range === v} onClick={() => setRange(v)}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {logs.loading ? (
        <div className="card empty">Loading your log…</div>
      ) : view === 'workouts' ? (
        <div className="grid">
          <Workouts profile={profile} onLogged={() => { logs.refresh(); setWorkoutsSaved((n) => n + 1) }} />
          <WorkoutHistory profile={profile} key={workoutsSaved} />
        </div>
      ) : view === 'logbook' ? (
        <Logbook entries={entries} days={range} profile={profile} medications={logs.medications} />
      ) : (
        <Overview
          profile={profile}
          logs={logs}
          all={all}
          entries={entries}
          range={range}
          fetchDays={fetchDays}
          from={from}
          onOpenLog={() => setView('logbook')}
          onCheckIn={() => setLogKind('checkin')}
          onAdd={setLogKind}
        />
      )}

      <footer className="foot screen-only">
        <p>Estimates, not measurements. Daybook is a record and a pattern-finder — not medical advice.</p>
        <FeedbackBox profile={profile} />
      </footer>

      <div className="screen-only">
        <QuickLog profile={profile} meds={logs.medications} onLogged={logs.refresh} openKind={logKind} onOpenChange={setLogKind}
          onTalk={() => setChat('talk')} onPicture={(photo) => setChat({ photo })} />
        {chat && (
          <SparkyChat profile={profile} meds={logs.medications} onLogged={logs.refresh}
            listenFirst={chat === 'talk'} firstPhoto={chat.photo} onClose={() => setChat(null)} />
        )}
        <InstallPrompt />
        {settings && <Settings profile={profile} onClose={() => setSettings(false)} onSaved={refreshProfile} />}
      </div>
    </div>
  )
}

function Overview({ profile, logs, all, entries, range, fetchDays, from, onOpenLog, onCheckIn, onAdd }) {
  const inRange = (rows, field) => rows.filter((r) => new Date(r[field]) >= from)
  const meals = inRange(logs.meals, 'eaten_at')
  const vitals = inRange(logs.vitals, 'taken_at')
  const exercise = inRange(logs.exercise, 'done_at')
  const focus = profile.focus_areas || []

  const loggedDays = new Set(entries.map((e) => dayKey(e.at)))
  const todayK = dayKey(new Date())
  const todayMeals = meals.filter((m) => dayKey(m.eaten_at) === todayK)
  const strip = Array.from({ length: 14 }, (_, i) => dayKey(new Date(Date.now() - (13 - i) * DAY)))
  const n = loggedDays.size

  // Per-day totals so "calories per day" averages over days that were logged.
  const perDay = (rows, field, key) => {
    const m = new Map()
    for (const r of rows) if (r[key] != null) m.set(dayKey(r[field]), (m.get(dayKey(r[field])) || 0) + Number(r[key]))
    return [...m.values()]
  }

  const tiles = []
  const syms = entries.filter((e) => e.kind === 'symptoms')
  const heads = syms.filter(isHeadache)
  if (heads.length) {
    tiles.push({ label: 'Headache days', value: new Set(heads.map((e) => dayKey(e.at))).size, sub: `avg severity ${fmt(avg(heads.map((e) => e.raw), 'severity_1_5'), 1)} / 5` })
  } else if (syms.length) {
    tiles.push({ label: 'Symptom days', value: new Set(syms.map((e) => dayKey(e.at))).size, sub: `${syms.length} entries` })
  }
  const weights = vitals.filter((v) => v.weight_lb != null).sort((a, b) => new Date(a.taken_at) - new Date(b.taken_at))
  if (weights.length) {
    const last = weights[weights.length - 1], delta = weights.length > 1 ? last.weight_lb - weights[0].weight_lb : null
    tiles.push({
      label: 'Weight', value: fmt(last.weight_lb, 1), unit: 'lb',
      sub: delta == null ? `logged ${fmtDay(last.taken_at)}` : `${delta < 0 ? '▼' : delta > 0 ? '▲' : ''} ${fmt(Math.abs(delta), 1)} lb since ${fmtDay(weights[0].taken_at, { month: 'short', day: 'numeric' })}`,
    })
  }
  const fasting = vitals.filter((v) => v.glucose_context === 'fasting' && v.glucose_mgdl != null)
  if (fasting.length) tiles.push({ label: 'Fasting glucose', value: fmt(avg(fasting, 'glucose_mgdl')), unit: 'mg/dL', sub: `avg of ${fasting.length} readings` })
  const cal = perDay(meals, 'eaten_at', 'calories')
  if (cal.length) tiles.push({ label: 'Calories / day', value: fmt(cal.reduce((a, b) => a + b, 0) / cal.length), unit: 'kcal', sub: `avg of ${cal.length} logged days` })
  const sleep = vitals.filter((v) => v.sleep_hr != null)
  if (sleep.length) tiles.push({ label: 'Sleep', value: fmt(avg(sleep, 'sleep_hr'), 1), unit: 'hr', sub: `avg of ${sleep.length} nights` })
  const mins = sum(exercise, 'duration_min')
  if (exercise.length) tiles.push({ label: 'Active', value: mins != null ? fmt(mins) : exercise.length, unit: mins != null ? 'min' : 'sessions', sub: `${exercise.length} sessions` })

  // Same meal logged five times is one line with a count, not five lines.
  const triggers = (() => {
    const hits = triggerMatches(meals, profile.watch_list)
    if (!hits) return null
    const by = new Map()
    for (const m of hits) {
      const k = m.description.trim().toLowerCase()
      const g = by.get(k) || { id: m.id, description: m.description, n: 0, foods: new Set() }
      g.n += 1
      for (const f of m.trigger_watch || []) g.foods.add(f)
      by.set(k, g)
    }
    return { total: hits.length, groups: [...by.values()].sort((a, b) => b.n - a.n) }
  })()
  const recent = entries.slice(0, 4)

  const meds = <Medications profile={profile} meds={logs.medications} doses={logs.med_doses} onChanged={logs.refresh} />

  if (!all.length) {
    return (
      <div className="grid">
        <div className="card empty-state hero-empty">
          <img src="/sparky.png" alt="" width="120" height="120" />
          <h2>Welcome, {profile.display_name}</h2>
          <p>Nothing logged yet. Snap a photo of your next meal, tap the mic to tell Sparky how you feel, or add the medicines you take below.</p>
        </div>
        {meds}
      </div>
    )
  }

  return (
    <div className="grid">
      <div className="card hero">
        <div className="hero-top">
          <h2>{profile.display_name}</h2>
          {focus.length > 0 && <span className="focus">{focus.join(' · ')}</span>}
        </div>
        <div className="hero-num">
          {n}<span> of {range} days logged</span>
        </div>
        <div className="dots" aria-label="Last 14 days">
          {strip.map((k) => <i key={k} className={loggedDays.has(k) ? 'on' : ''} title={k} />)}
        </div>
        <p className="hero-today">
          {todayMeals.length
            ? <>Today: {todayMeals.length} meal{todayMeals.length === 1 ? '' : 's'}{sum(todayMeals, 'calories') != null && <> · {fmt(sum(todayMeals, 'calories'))} kcal</>}</>
            : 'Nothing logged today yet.'}
        </p>
        <button type="button" className="checkin-link" onClick={onCheckIn}>
          {(logs.daily_checkins || []).some((c) => c.day === todayK) ? 'Update today’s check-in' : 'Check in for today: sleep, mood, drinks'}
        </button>
      </div>

      {tiles.length > 0 && (
        <div className="tiles">
          {tiles.slice(0, 4).map((t) => (
            <div className="tile" key={t.label}>
              <div className="tile-label">{t.label}</div>
              <div className="tile-value">{t.value}{t.unit && <span className="unit">{t.unit}</span>}</div>
              <div className="tile-sub">{t.sub}</div>
            </div>
          ))}
        </div>
      )}

      {meds}
      <MindCard assessments={inRange(logs.assessments || [], 'taken_at')} meditations={inRange(logs.meditations || [], 'done_at')} onAdd={onAdd} />

      <SymptomCalendar entries={all} days={fetchDays} range={range} />

      <TrendChart logs={logs} days={range} targets={profile.targets} />

      {triggers && (
        <Card icon="flame" title="Watch-list foods" tag={`${triggers.total} meals in range`}>
          {triggers.groups.slice(0, 5).map((g) => (
            <div className="ctx" key={g.id}>
              <span className="name">{g.description}</span>
              {g.n > 1 && <span className="n">×{g.n}</span>}
              <span className="val">{[...g.foods].join(', ')}</span>
            </div>
          ))}
        </Card>
      )}

      <Card icon="pen" title="Latest entries" tag={`${entries.length} in range`}>
        <ul className="feed">
          {recent.map((e) => (
            <li key={e.id}>
              <span className={`feed-ico k-${e.kind}`}><Icon name={KINDS[e.kind].icon} /></span>
              <div className="feed-body">
                <div className="feed-title">{e.title}{e.stats && <span className="feed-stats"> · {e.stats}</span>}</div>
              </div>
              <time className="feed-time">{fmtDay(e.at, { month: 'short', day: 'numeric' })}<br />{entryClock(e)}</time>
            </li>
          ))}
        </ul>
        <button type="button" className="btn ghost more" onClick={onOpenLog}>Open the full logbook — print or send it</button>
      </Card>
    </div>
  )
}
