import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

const fmtDuration = (ms) => {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export default function CallLogs() {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const navigate = useNavigate()

  useEffect(() => {
    api.listCalls().then(setCalls).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return calls.filter((c) => {
      if (filter !== 'all' && c.intent !== filter) return false
      if (!q) return true
      return (
        c.callerName.toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q) ||
        c.intent.toLowerCase().includes(q)
      )
    })
  }, [calls, query, filter])

  const intents = useMemo(
    () => ['all', ...new Set(calls.map((c) => c.intent).filter(Boolean))],
    [calls],
  )

  if (loading) return <div className="spinner" />

  return (
    <>
      <div className="page-head row row--between wrap">
        <div>
          <h1 className="h2">Call log</h1>
          <p className="dim small">{calls.length} call{calls.length === 1 ? '' : 's'} recorded.</p>
        </div>
        <div className="row wrap">
          <input
            className="small"
            style={{ padding: '9px 14px', borderRadius: 999, border: '1px solid var(--rule)', background: 'rgba(255,255,255,0.03)', minWidth: 200 }}
            placeholder="Search callers or summaries…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="small"
            style={{ padding: '9px 14px', borderRadius: 999, border: '1px solid var(--rule)', background: 'rgba(255,255,255,0.03)', colorScheme: 'dark' }}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {intents.map((i) => <option key={i} value={i}>{i === 'all' ? 'All intents' : i}</option>)}
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {visible.length === 0 ? (
          <div className="empty">
            <h3>{calls.length ? 'Nothing matches that' : 'No calls yet'}</h3>
            <p className="small">
              {calls.length ? 'Try a different search or filter.' : 'Take a call and it will show up here with a transcript and summary.'}
            </p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Caller</th>
                <th>Summary</th>
                <th>Intent</th>
                <th>Sentiment</th>
                <th>Duration</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} onClick={() => navigate(`/app/calls/${c.id}`)}>
                  <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{c.callerName}</td>
                  <td className="dim" style={{ maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.summary || '—'}
                  </td>
                  <td>{c.intent ? <span className="tag tag--booking">{c.intent}</span> : '—'}</td>
                  <td>
                    {c.sentiment
                      ? <span className={`tag ${c.sentiment === 'negative' ? 'tag--negative' : c.sentiment === 'positive' ? 'tag--positive' : ''}`}>{c.sentiment}</span>
                      : '—'}
                  </td>
                  <td className="dim" style={{ whiteSpace: 'nowrap' }}>{fmtDuration(c.durationMs)}</td>
                  <td className="faint small" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(c.startedAt.replace(' ', 'T') + 'Z').toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
