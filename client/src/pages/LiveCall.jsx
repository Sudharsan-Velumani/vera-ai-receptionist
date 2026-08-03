import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { useVoiceAgent } from '../voice/useVoiceAgent'
import { Mic, PhoneOff, Phone, Pause, Arrow, Sparkle } from '../components/Icons'

const STATUS_LABEL = {
  idle: 'Ready',
  connecting: 'Connecting',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  ended: 'Call ended',
}

const fmt = (ms) => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function LiveCall() {
  const { preferences, patchUser, user } = useAuth()
  const [finished, setFinished] = useState(null)
  const [typed, setTyped] = useState('')
  const scroller = useRef(null)

  const agent = useVoiceAgent({
    preferences,
    onCallEnded: setFinished,
    onCreditsChanged: (credits) => patchUser({ credits }),
  })

  const { status, turns, interim, level, error, meta, appointment, elapsed, supported } = agent
  const live = status !== 'idle' && status !== 'ended'

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [turns, interim])

  const send = (e) => {
    e.preventDefault()
    if (!typed.trim()) return
    agent.submit(typed)
    setTyped('')
  }

  const begin = () => {
    setFinished(null)
    agent.startCall(user?.name ? `${user.name} (test)` : 'Web visitor')
  }

  return (
    <>
      <div className="page-head row row--between wrap">
        <div>
          <h1 className="h2">Live call</h1>
          <p className="dim small">Speak to your receptionist exactly as a customer would.</p>
        </div>
        <div className="row wrap">
          {meta.provider && (
            <span className="pill">
              {meta.provider === 'mock' ? 'Offline brain' : `Model: ${meta.provider}`}
            </span>
          )}
          {meta.latencyMs > 0 && <span className="pill">{meta.latencyMs} ms</span>}
          {meta.degraded && <span className="pill pill--warn">Provider fell back</span>}
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      {!supported.recognition && (
        <div className="alert alert--info">
          Your browser has no speech recognition, so the microphone is unavailable.
          Chrome or Edge will let you talk — meanwhile you can type to Vera below
          and she will still answer out loud.
        </div>
      )}

      {(user?.credits ?? 0) <= 0 && !live && (
        <div className="alert">
          You are out of credits. <Link to="/app/billing" style={{ textDecoration: 'underline' }}>Top up</Link> to take more calls.
        </div>
      )}

      <div className="call">
        {/* ---------- orb + controls ---------- */}
        <div className="card orb-wrap">
          <div className="orb" data-state={status}>
            <span className="orb__ring" style={{ transform: `scale(${1 + level * 0.35})`, opacity: live ? 1 : 0.35 }} />
            <span className="orb__ring" style={{ transform: `scale(${1 + level * 0.22})`, opacity: live ? 1 : 0.35 }} />
            <span className="orb__ring" style={{ transform: `scale(${1 + level * 0.12})`, opacity: live ? 1 : 0.35 }} />
            <span className="orb__core" style={{ transform: `scale(${1 + level * 0.3})` }} />
          </div>

          <div>
            <div className="orb-status">{STATUS_LABEL[status]}</div>
            <div className="orb-timer">{fmt(elapsed)}</div>
          </div>

          {live && (
            <div style={{ width: '100%' }}>
              <div className="levelbar"><i style={{ width: `${level * 100}%` }} /></div>
              <div className="small faint" style={{ marginTop: 6 }}>
                {status === 'speaking' ? 'Talk over her to interrupt' : 'Microphone open'}
              </div>
            </div>
          )}

          <div className="stack" style={{ width: '100%' }}>
            {!live ? (
              <button className="btn btn--lg btn--block" onClick={begin} disabled={(user?.credits ?? 0) <= 0}>
                <Phone width={18} height={18} />
                {status === 'ended' ? 'Start another call' : 'Start call'}
              </button>
            ) : (
              <>
                {status === 'speaking' && (
                  <button className="btn btn--ghost btn--block" onClick={agent.interrupt}>
                    <Pause width={16} height={16} />
                    Interrupt
                  </button>
                )}
                <button className="btn btn--danger btn--block" onClick={agent.hangUp}>
                  <PhoneOff width={18} height={18} />
                  Hang up
                </button>
              </>
            )}
          </div>

          {!live && status === 'idle' && (
            <p className="small faint">
              Vera greets you first. Try: <em>&ldquo;I&rsquo;d like to book an appointment.&rdquo;</em>
            </p>
          )}
        </div>

        {/* ---------- transcript ---------- */}
        <div className="card">
          <div className="row row--between" style={{ marginBottom: 14 }}>
            <h3 className="h3">Transcript</h3>
            {live && <span className="pill pill--live"><i className="dot dot--pulse" />Recording</span>}
          </div>

          <div className="transcript" ref={scroller}>
            {turns.length === 0 && !live && (
              <div className="empty">
                <Mic width={26} height={26} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                <h3>No call in progress</h3>
                <p className="small">Start a call and the conversation will appear here as it happens.</p>
              </div>
            )}

            {turns.map((t, i) => (
              <div key={i} className={`bubble bubble--${t.role}`}>
                <div className="bubble__who">{t.role === 'caller' ? 'You' : 'Vera'}</div>
                {t.text}
              </div>
            ))}

            {interim && (
              <div className="bubble bubble--interim">
                <div className="bubble__who">You</div>
                {interim}
              </div>
            )}

            {status === 'thinking' && (
              <div className="bubble bubble--assistant">
                <div className="bubble__who">Vera</div>
                <span className="dim">…</span>
              </div>
            )}
          </div>

          {live && (
            <form className="composer" onSubmit={send}>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={supported.recognition ? 'Or type instead of speaking…' : 'Type your message…'}
              />
              <button className="btn btn--sm" disabled={!typed.trim()}>
                <Arrow width={16} height={16} />
              </button>
            </form>
          )}

          {appointment && (
            <div className="alert alert--ok" style={{ marginTop: 16, marginBottom: 0 }}>
              <strong>Appointment booked</strong> — {appointment.title} for {appointment.customer_name} on{' '}
              {new Date(appointment.starts_at).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* ---------- post-call summary ---------- */}
      {finished && (
        <div className="card card--pad" style={{ marginTop: 24 }}>
          <div className="row row--between wrap" style={{ marginBottom: 16 }}>
            <div className="row">
              <Sparkle width={18} height={18} style={{ color: 'var(--accent)' }} />
              <h3 className="h3">Call summary</h3>
            </div>
            <div className="row wrap">
              {finished.intent && <span className="tag tag--booking">{finished.intent}</span>}
              {finished.sentiment && (
                <span className={`tag ${finished.sentiment === 'negative' ? 'tag--negative' : finished.sentiment === 'positive' ? 'tag--positive' : ''}`}>
                  {finished.sentiment}
                </span>
              )}
              <span className="tag">{finished.creditsUsed} credits</span>
            </div>
          </div>

          <p style={{ marginBottom: 18 }}>{finished.summary}</p>

          {finished.actionItems?.length > 0 && (
            <>
              <div className="small dim" style={{ marginBottom: 8 }}>Follow-up</div>
              <ul className="stack" style={{ gap: 8 }}>
                {finished.actionItems.map((item) => (
                  <li key={item} className="row small" style={{ alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--accent)' }}>—</span>
                    {item}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="row" style={{ marginTop: 20 }}>
            <Link className="btn btn--ghost btn--sm" to={`/app/calls/${finished.id}`}>Open full transcript</Link>
            <button className="btn btn--sm" onClick={begin}>Take another call</button>
          </div>
        </div>
      )}
    </>
  )
}
