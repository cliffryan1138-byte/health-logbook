import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLogs } from '../hooks/useLogs'
import Card from '../components/Card'
import Spark from '../components/Spark'
import QuickLog from '../components/QuickLog'
import InstallPrompt from '../components/InstallPrompt'
import FeedbackBox from '../components/FeedbackBox'
import Icon from '../lib/icons'
import {
  todayRows, sum, latest, dailySeries, glucoseByContext,
  symptomSummary, triggerMatches, fmt,
} from '../lib/stats'

// RECOVERY NOTE: the import list and the useMemo block below are the original
// file, recovered from the Vercel deployment. The markup after it was lost to a
// response limit and is rebuilt against screenshots of the running app, so the
// card order, headings and empty-state wording match what shipped.
//
// Cards that summarise data the profile has none of (symptoms, trigger matches)
// render nothing rather than an empty shell — same "gap, not zero" rule the
// stats helpers follow.

const CONTEXT_LABEL = {
  fasting: 'Fasting',
  'post-breakfast': 'After breakfast',
  'post-lunch': 'After lunch',
  'post-dinner': 'After dinner',
  random: 'Random',
}

export default function Dashboard() {
  const { profile, signOut } = useAuth()
  const { meals, vitals, exercise, symptoms, loading, refresh } = useLogs(profile.id)
  const [logKind, setLogKind] = useState(null)

  const focus = profile.focus_areas || []
  const watch = profile.watch_list || []

  const s = useMemo(() => {
    const mealsToday = todayRows(meals, 'eaten_at')
    const weightSeries = dailySeries(vitals, 'weight_lb', 'taken_at')
    const sleepSeries = dailySeries(vitals, 'sleep_hr', 'taken_at')
    const lastWeight = latest(vitals, 'weight_lb', 'taken_at')
    const lastFasting = latest(
      vitals.filter((v) => v.glucose_context === 'fasting'),
      'glucose_mgdl',
      'taken_at',
    )
    return {
      calToday: sum(mealsToday, 'calories'),
      protToday: sum(mealsToday, 'protein_g'),
      sugarToday: sum(mealsToday, 'sugar_g'),
      fiberToday: sum(mealsToday, 'fiber_g'),
      mealsToday,
      weightSeries,
      sleepSeries,
      lastWeight,
      lastFasting,
      weightDelta:
        weightSeries.length >= 2
          ? weightSeries[weightSeries.length - 1].value - weightSeries[0].value
          : null,
      glucose: glucoseByContext(vitals),
      symptoms: symptomSummary(symptoms),
      triggers: triggerMatches(meals, watch),
      sessionsThisWeek: exercise.filter(
        (e) => new Date(e.done_at) >= startOfWeek(),
      ).length,
    }
  }, [meals, vitals, exercise, symptoms, watch])

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="wrap">
      <header className="topbar">
        <div className="brand">
          <span className="glyph"><Icon name="logo" /></span>
          <h1>Health-Logbook</h1>
        </div>
        <button className="signout" onClick={signOut}>Sign out</button>
      </header>

      <div className="grid">
        {/* ── Profile summary ── */}
        <div className="card wide">
          <div className="who">
            <h2>{profile.display_name}</h2>
            {focus.length > 0 && <span className="focus">{focus.join(' · ')}</span>}
            <span className="when">{today}</span>
          </div>

          <div className="stat-grid">
            <Stat
              label="Weight"
              value={s.lastWeight ? fmt(s.lastWeight.weight_lb, 1) : '—'}
              unit="lb"
              action="log a weigh-in"
              onAction={() => setLogKind('vitals')}
            />
            <Stat
              label="Fasting glucose"
              value={s.lastFasting ? fmt(s.lastFasting.glucose_mgdl) : '—'}
              unit="mg/dL"
              action="log a reading"
              onAction={() => setLogKind('vitals')}
            />
            <Stat
              label="Protein today"
              value={fmt(s.protToday)}
              unit="g"
              action="today"
              onAction={() => setLogKind('meal')}
            />
            <Stat
              label="Calories today"
              value={fmt(s.calToday)}
              unit="kcal"
              action="today"
              onAction={() => setLogKind('meal')}
            />
          </div>
        </div>

        {/* ── Weight trend ── */}
        <Card icon="scale" title="Weight trend" tag="14 days">
          <div className="big">
            {s.lastWeight ? fmt(s.lastWeight.weight_lb, 1) : '—'}
            <span className="unit">lb</span>
          </div>
          <Spark series={s.weightSeries} />
        </Card>

        {/* ── Blood glucose by context ── */}
        <Card icon="drop" title="Blood glucose by context" tag="avg / 14d">
          {s.glucose ? (
            s.glucose.map((g) => (
              <div className="ctx" key={g.context}>
                <span className="name">{CONTEXT_LABEL[g.context] || g.context}</span>
                <span className="n">n={g.n}</span>
                <span className="val">{fmt(g.value)} mg/dL</span>
              </div>
            ))
          ) : (
            <div className="empty">
              Log glucose readings with their context (fasting, after meals) to see this.
            </div>
          )}
        </Card>

        {/* ── Today's intake ── */}
        <Card
          icon="flame"
          title="Today's intake"
          tag={s.mealsToday.length ? `${s.mealsToday.length} logged` : 'no meals yet'}
        >
          {s.mealsToday.length ? (
            <>
              <div className="big">
                {fmt(s.calToday)}<span className="unit">kcal</span>
              </div>
              <div className="ctx"><span className="name">Protein</span><span className="val">{fmt(s.protToday)} g</span></div>
              <div className="ctx"><span className="name">Sugar</span><span className="val">{fmt(s.sugarToday)} g</span></div>
              <div className="ctx"><span className="name">Fiber</span><span className="val">{fmt(s.fiberToday)} g</span></div>
            </>
          ) : (
            <div className="empty">Nothing logged today. Snap a photo or tap Meal below.</div>
          )}
        </Card>

        {/* ── Exercise ── */}
        <Card icon="dumbbell" title="Exercise" tag="this week">
          <div className="big">
            {s.sessionsThisWeek}<span className="unit">sessions</span>
          </div>
          {s.sessionsThisWeek === 0 && (
            <div className="empty">No sessions logged this week yet.</div>
          )}
        </Card>

        {/* ── Symptoms: only when there are any ── */}
        {s.symptoms && (
          <Card icon="pulse" title="Symptoms" tag="14 days">
            {s.symptoms.map((sy) => (
              <div className="ctx" key={sy.symptom}>
                <span className="name">{sy.symptom}</span>
                <span className="n">×{sy.count}</span>
                <span className="val">severity {fmt(sy.severity, 1)}</span>
              </div>
            ))}
          </Card>
        )}

        {/* ── Watch-list hits: only when there are any ── */}
        {s.triggers && (
          <Card icon="flame" title="Watch-list foods" tag={`${s.triggers.length} in 14d`}>
            {s.triggers.slice(0, 6).map((m) => (
              <div className="ctx" key={m.id}>
                <span className="name">{m.description}</span>
                <span className="val">{(m.trigger_watch || []).join(', ')}</span>
              </div>
            ))}
          </Card>
        )}
      </div>

      <footer className="foot">
        <p>
          Estimates, not measurements. Health-Logbook is a record and a pattern-finder —
          not medical advice.
        </p>
        <FeedbackBox profile={profile} />
      </footer>

      <QuickLog
        profile={profile}
        onLogged={refresh}
        openKind={logKind}
        onOpenChange={setLogKind}
      />
      <InstallPrompt />
    </div>
  )
}

function Stat({ label, value, unit, action, onAction }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}<span className="unit">{unit}</span>
      </div>
      <button className="stat-link" onClick={onAction}>→ {action}</button>
    </div>
  )
}

function startOfWeek() {
  const d = new Date()
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}
