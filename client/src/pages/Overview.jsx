import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { BarChart, bucketByDay } from '../components/Chart'
import { SkeletonStats, SkeletonRows } from '../components/Skeleton'
import { Phone, Clock, Calendar, Sparkle, Check } from '../components/Icons'

const fmtDuration = (ms) => {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export default function Overview() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [calls, setCalls] = useState([])
  const [appts, setAppts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.stats(), api.listCalls(), api.appointments()])
      .then(([s, c, a]) => { setStats(s); setCalls(c); setAppts(a.slice(0, 5)) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <>
        <div className="page-head">
          <h1 className="h2">Overview</h1>
        </div>
        <SkeletonStats />
        <div style={{ height: 20 }} />
        <SkeletonRows n={5} />
      </>
    )
  }

  const cards = [
    { label: 'Calls handled', value: stats?.totalCalls ?? 0, hint: 'all time' },
    { label: 'Minutes answered', value: stats?.totalMinutes ?? 0, hint: `${stats?.creditsUsed ?? 0} credits spent` },
    { label: 'Appointments booked', value: stats?.bookings ?? 0, hint: `${stats?.upcomingAppointments ?? 0} upcoming` },
    { label: 'Avg. response', value: stats?.avgLatencyMs ? `${stats.avgLatencyMs}ms` : '—', hint: 'time to first word' },
  ]

  const chart = bucketByDay(calls, 14)
  const hasActivity = chart.some((b) => b.value > 0)

  return (
    <>
      <div className="page-head">
        <h1 className="h2">Good to see you, {user?.name?.split(' ')[0]}</h1>
        <p className="dim small">Here is what Vera has been doing.</p>
      </div>

      <div className="grid-4" style={{ marginBottom: 20 }}>
        {cards.map((c) => (
          <div key={c.label} className="card stat">
            <b>{c.value}</b>
            <span>{c.label}</span>
            <span className="faint" style={{ fontSize: '0.74rem', display: 'block', marginTop: 3 }}>{c.hint}</span>
          </div>
        ))}
      </div>

      {stats?.totalCalls === 0 ? (
        <div className="card card--pad empty-hero">
          <div className="empty-hero__icon"><Phone width={24} height={24} /></div>
          <h3 className="h3">Nothing here yet</h3>
          <p className="dim small">
            Take a call yourself to see the whole loop — Vera answers, books the
            appointment, and writes the summary before you hang up.
          </p>
          <Link className="btn" to="/app/call" style={{ marginTop: 20 }}>
            <Phone width={17} height={17} />
            Take your first call
          </Link>
        </div>
      ) : (
        <>
          {hasActivity && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="row row--between" style={{ marginBottom: 16 }}>
                <h3 className="h3">Call volume</h3>
                <span className="pill">Last 14 days</span>
              </div>
              <BarChart data={chart} format={(v) => `${v} call${v === 1 ? '' : 's'}`} />
            </div>
          )}

          <div className="grid-2">
            <div className="card">
              <div className="row row--between" style={{ marginBottom: 14 }}>
                <h3 className="h3">
                  <Sparkle width={16} height={16} className="h3__icon" />
                  Recent calls
                </h3>
                <Link className="small link" to="/app/calls">All calls</Link>
              </div>

              <div className="stack" style={{ gap: 8 }}>
                {calls.slice(0, 5).map((c) => (
                  <Link key={c.id} to={`/app/calls/${c.id}`} className="listrow">
                    <span className="listrow__av">{initials(c.callerName)}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="listrow__title">{c.callerName}</div>
                      <div className="listrow__sub">{c.summary || 'No summary'}</div>
                    </div>
                    <span className="small faint" style={{ flex: 'none' }}>
                      <Clock width={12} height={12} className="inline-icon" />
                      {fmtDuration(c.durationMs)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="row row--between" style={{ marginBottom: 14 }}>
                <h3 className="h3">
                  <Calendar width={16} height={16} className="h3__icon" />
                  Upcoming
                </h3>
                <Link className="small link" to="/app/appointments">All appointments</Link>
              </div>

              {appts.length === 0 ? (
                <p className="dim small">Nothing booked yet. Vera adds appointments here automatically.</p>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  {appts.map((a) => (
                    <div key={a.id} className="listrow">
                      <span className="listrow__av listrow__av--ok"><Check width={15} height={15} /></span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="listrow__title">{a.title}</div>
                        <div className="listrow__sub">{a.customer_name || 'No name given'}</div>
                      </div>
                      <span className="small faint" style={{ flex: 'none' }}>
                        {new Date(a.starts_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

    </>
  )
}

const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
