import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Calendar } from '../components/Icons'

export default function Appointments() {
  const [appts, setAppts] = useState([])
  const [scope, setScope] = useState('upcoming')
  const [loading, setLoading] = useState(true)

  const load = (s) => {
    setLoading(true)
    api.appointments(s).then(setAppts).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load(scope) }, [scope])

  const setStatus = async (id, status) => {
    const updated = await api.updateAppointment(id, { status })
    setAppts((list) => list.map((a) => (a.id === id ? updated : a)))
  }

  return (
    <>
      <div className="page-head row row--between wrap">
        <div>
          <h1 className="h2">Appointments</h1>
          <p className="dim small">Booked by Vera during calls, no data entry.</p>
        </div>
        <div className="row">
          {['upcoming', 'all'].map((s) => (
            <button key={s} className={`btn btn--sm ${scope === s ? '' : 'btn--ghost'}`} onClick={() => setScope(s)}>
              {s === 'upcoming' ? 'Upcoming' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : appts.length === 0 ? (
        <div className="card empty">
          <Calendar width={26} height={26} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <h3>Nothing booked</h3>
          <p className="small">
            When a caller agrees a time, Vera writes it here automatically.{' '}
            <Link to="/app/call" style={{ color: 'var(--accent)' }}>Try a call</Link>.
          </p>
        </div>
      ) : (
        <div className="stack">
          {appts.map((a) => (
            <div key={a.id} className="card row row--between wrap">
              <div>
                <div className="row" style={{ gap: 10 }}>
                  <strong>{a.title}</strong>
                  <span className={`tag ${a.status === 'cancelled' ? 'tag--negative' : a.status === 'completed' ? '' : 'tag--positive'}`}>
                    {a.status}
                  </span>
                </div>
                <div className="small dim" style={{ marginTop: 4 }}>
                  {a.customer_name || 'No name'} · {new Date(a.starts_at).toLocaleString()} · {a.duration_min} min
                </div>
                {a.notes && <div className="small faint" style={{ marginTop: 4 }}>{a.notes}</div>}
              </div>

              <div className="row wrap">
                {a.call_id && (
                  <Link className="btn btn--ghost btn--sm" to={`/app/calls/${a.call_id}`}>View call</Link>
                )}
                {a.status === 'confirmed' && (
                  <>
                    <button className="btn btn--ghost btn--sm" onClick={() => setStatus(a.id, 'completed')}>Mark done</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => setStatus(a.id, 'cancelled')}>Cancel</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
