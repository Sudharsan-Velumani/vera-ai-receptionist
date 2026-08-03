import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { Back, Sparkle, Calendar, Clock } from '../components/Icons'

const fmtDuration = (ms) => {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export default function CallDetail() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getCall(id).then(setData).catch((e) => setError(e.message))
  }, [id])

  if (error) return <div className="alert">{error}</div>
  if (!data) return <div className="spinner" />

  const { call, turns, appointment } = data

  const exportTranscript = () => {
    const lines = [
      `Call with ${call.callerName}`,
      `${new Date(call.startedAt.replace(' ', 'T') + 'Z').toLocaleString()} · ${fmtDuration(call.durationMs)}`,
      '',
      `SUMMARY`,
      call.summary || '—',
      '',
      ...(call.actionItems?.length ? ['FOLLOW-UP', ...call.actionItems.map((a) => `- ${a}`), ''] : []),
      'TRANSCRIPT',
      ...turns.map((t) => `${t.role === 'caller' ? 'Caller' : 'Vera'}: ${t.text}`),
    ].join('\n')

    const blob = new Blob([lines], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vera-call-${call.id}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Link className="btn btn--ghost btn--sm" to="/app/calls" style={{ marginBottom: 18 }}>
        <Back width={16} height={16} />
        Back to call log
      </Link>

      <div className="page-head row row--between wrap">
        <div>
          <h1 className="h2">{call.callerName}</h1>
          <p className="dim small">
            {new Date(call.startedAt.replace(' ', 'T') + 'Z').toLocaleString()} ·{' '}
            <Clock width={13} height={13} style={{ display: 'inline', verticalAlign: -2 }} /> {fmtDuration(call.durationMs)} ·{' '}
            {call.creditsUsed} credits · via {call.transport}
          </p>
        </div>
        <div className="row wrap">
          {call.intent && <span className="tag tag--booking">{call.intent}</span>}
          {call.sentiment && (
            <span className={`tag ${call.sentiment === 'negative' ? 'tag--negative' : call.sentiment === 'positive' ? 'tag--positive' : ''}`}>
              {call.sentiment}
            </span>
          )}
          <button className="btn btn--ghost btn--sm" onClick={exportTranscript}>Export</button>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3 className="h3" style={{ marginBottom: 14 }}>Transcript</h3>
          <div className="transcript" style={{ maxHeight: 'none' }}>
            {turns.map((t) => (
              <div key={t.id} className={`bubble bubble--${t.role}`}>
                <div className="bubble__who">{t.role === 'caller' ? call.callerName : 'Vera'}</div>
                {t.text}
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="row" style={{ marginBottom: 12 }}>
              <Sparkle width={17} height={17} style={{ color: 'var(--accent)' }} />
              <h3 className="h3">AI summary</h3>
            </div>
            <p className="dim" style={{ fontSize: '0.94rem' }}>{call.summary || 'No summary available.'}</p>

            {call.actionItems?.length > 0 && (
              <>
                <div className="small dim" style={{ margin: '18px 0 8px' }}>Follow-up</div>
                <ul className="stack" style={{ gap: 8 }}>
                  {call.actionItems.map((item) => (
                    <li key={item} className="row small" style={{ alignItems: 'flex-start' }}>
                      <span style={{ color: 'var(--accent)' }}>—</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {appointment && (
            <div className="card">
              <div className="row" style={{ marginBottom: 12 }}>
                <Calendar width={17} height={17} style={{ color: 'var(--green)' }} />
                <h3 className="h3">Appointment booked</h3>
              </div>
              <div className="stack" style={{ gap: 6, fontSize: '0.92rem' }}>
                <div className="row row--between"><span className="dim">Service</span><span>{appointment.title}</span></div>
                <div className="row row--between"><span className="dim">Customer</span><span>{appointment.customer_name || '—'}</span></div>
                <div className="row row--between"><span className="dim">When</span><span>{new Date(appointment.starts_at).toLocaleString()}</span></div>
                <div className="row row--between"><span className="dim">Status</span><span className="tag tag--positive">{appointment.status}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
