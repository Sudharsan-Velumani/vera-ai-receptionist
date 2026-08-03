import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useDemoCall } from './useDemoCall'
import { Play, Pause, Sparkle, Calendar, Check } from '../components/Icons'

export default function DemoCall() {
  const { script, index, playing, finished, play, stop } = useDemoCall()
  const scroller = useRef(null)

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [index])

  const visible = script.slice(0, index + 1)

  return (
    <div className="demo">
      <div className="demo__head">
        <div>
          <span className="eyebrow">Hear it for yourself</span>
          <h2 className="h2">This is a call, start to finish.</h2>
          <p className="lede" style={{ marginTop: 14 }}>
            Press play. Vera speaks out loud through your browser, the orb reacts
            to her voice, and the appointment appears the moment it is agreed.
          </p>
        </div>

        <button className={`btn btn--lg ${playing ? 'btn--ghost' : ''}`} onClick={playing ? stop : play}>
          {playing ? <Pause width={18} height={18} /> : <Play width={18} height={18} />}
          {playing ? 'Stop' : finished ? 'Play again' : 'Play the call'}
        </button>
      </div>

      <div className="demo__body">
        <div className="demo__transcript" ref={scroller}>
          {visible.length === 0 && (
            <div className="demo__idle">
              <div className="demo__idle-icon"><Play width={20} height={20} /></div>
              <p className="small dim">The transcript appears here as the call runs.</p>
            </div>
          )}

          {visible.map((line, i) => (
            <div key={i} className={`bubble bubble--${line.role} ${i === index && playing ? 'bubble--active' : ''}`}>
              <div className="bubble__who">{line.role === 'caller' ? 'Caller' : 'Vera'}</div>
              {line.text}
            </div>
          ))}
        </div>

        <div className="demo__side">
          <div className={`demo__card ${index >= 6 ? 'on' : ''}`}>
            <div className="row" style={{ marginBottom: 10 }}>
              <Calendar width={16} height={16} style={{ color: 'var(--green)' }} />
              <strong className="small">Appointment booked</strong>
            </div>
            {index >= 6 ? (
              <div className="stack" style={{ gap: 5 }}>
                <div className="row row--between small"><span className="dim">Service</span><span>Deep tissue massage</span></div>
                <div className="row row--between small"><span className="dim">Customer</span><span>Priya Sharma</span></div>
                <div className="row row--between small"><span className="dim">When</span><span>Tomorrow, 3:00 PM</span></div>
              </div>
            ) : (
              <p className="small faint">Waiting for the caller to confirm a time…</p>
            )}
          </div>

          <div className={`demo__card ${finished ? 'on' : ''}`}>
            <div className="row" style={{ marginBottom: 10 }}>
              <Sparkle width={16} height={16} style={{ color: 'var(--accent)' }} />
              <strong className="small">AI summary</strong>
            </div>
            {finished ? (
              <>
                <p className="small dim">
                  Priya Sharma called to book a deep tissue massage. An appointment was
                  agreed for tomorrow at 3:00 PM.
                </p>
                <div className="row wrap" style={{ marginTop: 12, gap: 6 }}>
                  <span className="tag tag--booking">booking</span>
                  <span className="tag tag--positive">positive</span>
                </div>
                <div className="row small" style={{ marginTop: 12, alignItems: 'flex-start', gap: 8 }}>
                  <Check width={14} height={14} style={{ color: 'var(--green)', marginTop: 3, flex: 'none' }} />
                  <span className="dim">Confirm deep tissue massage for tomorrow, 3:00 PM</span>
                </div>
              </>
            ) : (
              <p className="small faint">Written automatically when the call ends.</p>
            )}
          </div>

          {finished && <Link className="btn btn--block" to="/signup">Try it with your own voice</Link>}
        </div>
      </div>
    </div>
  )
}
