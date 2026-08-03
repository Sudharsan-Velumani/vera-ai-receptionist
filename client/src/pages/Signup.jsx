import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { loadVoices, accentLabel, TONES, LANGUAGES } from '../voice/voices'
import { Arrow, Back, Play } from '../components/Icons'

/**
 * Two-step onboarding, straight from the spec: account first, then the
 * communication preferences that shape how Vera sounds on the phone.
 */
export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [voices, setVoices] = useState([])
  const [serviceDraft, setServiceDraft] = useState('')

  const [form, setForm] = useState({
    name: '', email: '', password: '', businessName: '',
    language: 'en-US', voiceName: '', tone: 'warm', rate: 1, pitch: 1,
    businessHours: 'Mon-Fri 9am-6pm',
    services: ['General enquiry'],
    escalateTo: '',
  })

  useEffect(() => { loadVoices().then(setVoices) }, [])

  const set = (k) => (e) => {
    const v = e.target.type === 'range' ? Number(e.target.value) : e.target.value
    setForm((f) => ({ ...f, [k]: v }))
    setError('')
  }

  const matching = voices.filter((v) => v.lang?.startsWith(form.language.slice(0, 2)))

  const preview = () => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(
      `Thanks for calling ${form.businessName || 'us'}, this is Vera. How can I help you today?`,
    )
    const chosen = voices.find((v) => v.name === form.voiceName) || matching[0]
    if (chosen) { u.voice = chosen; u.lang = chosen.lang }
    u.rate = form.rate
    u.pitch = form.pitch
    window.speechSynthesis.speak(u)
  }

  const next = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return setError('Your name is required')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return setError('Enter a valid email address')
    if (form.password.length < 8) return setError('Password must be at least 8 characters')
    setError('')
    setStep(1)
  }

  const addService = () => {
    const v = serviceDraft.trim()
    if (!v || form.services.includes(v)) return
    setForm((f) => ({ ...f, services: [...f.services, v].slice(0, 12) }))
    setServiceDraft('')
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signup({
        email: form.email, password: form.password, name: form.name,
        businessName: form.businessName,
        preferences: {
          language: form.language, accent: form.language, voiceName: form.voiceName,
          tone: form.tone, rate: form.rate, pitch: form.pitch,
          businessHours: form.businessHours, services: form.services,
          escalateTo: form.escalateTo,
        },
      })
      navigate('/app/call')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth__card card card--pad">
        <div className="brand"><span className="brand__mark">V</span>Vera</div>

        <div className="steps">
          <i className="on" />
          <i className={step >= 1 ? 'on' : ''} />
        </div>

        {error && <div className="alert">{error}</div>}

        {step === 0 ? (
          <form onSubmit={next} noValidate>
            <h1 className="h2" style={{ marginBottom: 6 }}>Create your account</h1>
            <p className="dim small" style={{ marginBottom: 22 }}>Two minutes, then you can talk to it.</p>

            <div className="field">
              <label htmlFor="name">Your name</label>
              <input id="name" value={form.name} onChange={set('name')} placeholder="Alex Rivera" autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="business">Business name</label>
              <input id="business" value={form.businessName} onChange={set('businessName')}
                     placeholder="Meridian Wellness Studio" autoComplete="organization" />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={form.email} onChange={set('email')}
                     placeholder="you@business.com" autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={form.password} onChange={set('password')}
                     placeholder="At least 8 characters" autoComplete="new-password" />
            </div>

            <button className="btn btn--block">
              Continue
              <Arrow width={17} height={17} />
            </button>
          </form>
        ) : (
          <form onSubmit={submit} noValidate>
            <h1 className="h2" style={{ marginBottom: 6 }}>How should Vera sound?</h1>
            <p className="dim small" style={{ marginBottom: 22 }}>
              All of this is editable later. Press preview to hear it.
            </p>

            <div className="field">
              <label htmlFor="language">Language and accent</label>
              <select id="language" value={form.language} onChange={set('language')}>
                {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>

            <div className="field">
              <label htmlFor="voice">Voice</label>
              <select id="voice" value={form.voiceName} onChange={set('voiceName')}>
                <option value="">Best available for this language</option>
                {matching.map((v) => (
                  <option key={v.name} value={v.name}>{v.name} — {accentLabel(v.lang)}</option>
                ))}
              </select>
              <span className="hint">
                {voices.length
                  ? `${voices.length} voices available from your system.`
                  : 'Loading the voices installed on your device…'}
              </span>
            </div>

            <div className="grid-2">
              <div className="field">
                <label htmlFor="rate">Speed · {form.rate.toFixed(1)}x</label>
                <input id="rate" type="range" min="0.6" max="1.6" step="0.1" value={form.rate} onChange={set('rate')} />
              </div>
              <div className="field">
                <label htmlFor="pitch">Pitch · {form.pitch.toFixed(1)}</label>
                <input id="pitch" type="range" min="0.5" max="1.6" step="0.1" value={form.pitch} onChange={set('pitch')} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="tone">Tone</label>
              <select id="tone" value={form.tone} onChange={set('tone')}>
                {TONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <span className="hint">{TONES.find((t) => t.id === form.tone)?.hint}</span>
            </div>

            <button type="button" className="btn btn--ghost btn--sm btn--block" onClick={preview} style={{ marginBottom: 18 }}>
              <Play width={15} height={15} />
              Preview this voice
            </button>

            <div className="field">
              <label htmlFor="hours">Opening hours</label>
              <input id="hours" value={form.businessHours} onChange={set('businessHours')} placeholder="Mon-Fri 9am-6pm" />
            </div>

            <div className="field">
              <label>Services you offer</label>
              <div className="row" style={{ gap: 8 }}>
                <input
                  value={serviceDraft}
                  onChange={(e) => setServiceDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addService() } }}
                  placeholder="e.g. Deep tissue massage"
                />
                <button type="button" className="btn btn--ghost btn--sm" onClick={addService}>Add</button>
              </div>
              <div className="chip-list" style={{ marginTop: 10 }}>
                {form.services.map((s) => (
                  <span key={s} className="chip">
                    {s}
                    <button type="button" aria-label={`Remove ${s}`}
                            onClick={() => setForm((f) => ({ ...f, services: f.services.filter((x) => x !== s) }))}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <span className="hint">Vera offers these by name and books against them.</span>
            </div>

            <div className="field">
              <label htmlFor="escalate">Transfer callers to</label>
              <input id="escalate" value={form.escalateTo} onChange={set('escalateTo')} placeholder="Alex on the front desk" />
              <span className="hint">Used when a caller asks for a human.</span>
            </div>

            <div className="row" style={{ gap: 10 }}>
              <button type="button" className="btn btn--ghost" onClick={() => setStep(0)}>
                <Back width={16} height={16} />
                Back
              </button>
              <button className="btn" style={{ flex: 1 }} disabled={busy}>
                {busy ? <span className="spinner" /> : 'Create account'}
              </button>
            </div>
          </form>
        )}

        <p className="small dim" style={{ marginTop: 18, textAlign: 'center' }}>
          Already have an account? <Link to="/login" className="link">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
