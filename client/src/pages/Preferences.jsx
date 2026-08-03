import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { loadVoices, accentLabel, TONES, LANGUAGES } from '../voice/voices'
import { Play } from '../components/Icons'

export default function Preferences() {
  const { preferences, setPreferences, user } = useAuth()
  const [form, setForm] = useState(null)
  const [voices, setVoices] = useState([])
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { loadVoices().then(setVoices) }, [])
  useEffect(() => {
    if (preferences) setForm(preferences)
    else api.getPreferences().then(setForm).catch((e) => setError(e.message))
  }, [preferences])

  if (error) return <div className="alert">{error}</div>
  if (!form) return <div className="spinner" />

  const set = (k) => (e) => {
    const v = e.target.type === 'range' ? Number(e.target.value) : e.target.value
    setForm((f) => ({ ...f, [k]: v }))
    setSaved(false)
  }

  const matching = voices.filter((v) => v.lang?.startsWith((form.language || 'en').slice(0, 2)))

  const preview = () => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(
      form.greeting?.trim() ||
        `Thanks for calling ${user?.business_name || 'us'}, this is Vera. How can I help you today?`,
    )
    const chosen = voices.find((v) => v.name === form.voiceName) || matching[0]
    if (chosen) { u.voice = chosen; u.lang = chosen.lang }
    u.rate = form.rate ?? 1
    u.pitch = form.pitch ?? 1
    window.speechSynthesis.speak(u)
  }

  const addService = () => {
    const v = draft.trim()
    if (!v || form.services?.includes(v)) return
    setForm((f) => ({ ...f, services: [...(f.services || []), v].slice(0, 12) }))
    setDraft('')
    setSaved(false)
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const updated = await api.savePreferences(form)
      setForm(updated)
      setPreferences(updated)
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <h1 className="h2">Voice &amp; business</h1>
        <p className="dim small">How Vera sounds, and what she knows about you.</p>
      </div>

      {saved && <div className="alert alert--ok">Saved. The next call will use these settings.</div>}
      {error && <div className="alert">{error}</div>}

      <form onSubmit={save} className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card card--pad">
          <h3 className="h3" style={{ marginBottom: 18 }}>Voice</h3>

          <div className="field">
            <label htmlFor="language">Language and accent</label>
            <select id="language" value={form.language || 'en-US'} onChange={set('language')}>
              {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="voice">Voice</label>
            <select id="voice" value={form.voiceName || ''} onChange={set('voiceName')}>
              <option value="">Best available for this language</option>
              {matching.map((v) => (
                <option key={v.name} value={v.name}>{v.name} — {accentLabel(v.lang)}</option>
              ))}
            </select>
            <span className="hint">
              {voices.length
                ? `${voices.length} voices installed on this device. They come from your operating system, so they cost nothing.`
                : 'Loading voices…'}
            </span>
          </div>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="rate">Speed · {(form.rate ?? 1).toFixed(1)}x</label>
              <input id="rate" type="range" min="0.6" max="1.6" step="0.1" value={form.rate ?? 1} onChange={set('rate')} />
            </div>
            <div className="field">
              <label htmlFor="pitch">Pitch · {(form.pitch ?? 1).toFixed(1)}</label>
              <input id="pitch" type="range" min="0.5" max="1.6" step="0.1" value={form.pitch ?? 1} onChange={set('pitch')} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="tone">Tone</label>
            <select id="tone" value={form.tone || 'warm'} onChange={set('tone')}>
              {TONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <span className="hint">{TONES.find((t) => t.id === form.tone)?.hint}</span>
          </div>

          <button type="button" className="btn btn--ghost btn--sm btn--block" onClick={preview}>
            <Play width={15} height={15} />
            Preview
          </button>

          <label className="toggle" style={{ marginTop: 20 }}>
            <input
              type="checkbox"
              checked={!!form.bargeIn}
              onChange={(e) => { setForm((f) => ({ ...f, bargeIn: e.target.checked })); setSaved(false) }}
            />
            <span>
              <strong>Let callers interrupt</strong>
              <em>
                Vera stops mid-sentence when someone talks over her. Needs headphones
                or hardware echo cancellation — on laptop speakers the microphone hears
                Vera herself and cuts her off. The Interrupt button always works.
              </em>
            </span>
          </label>
        </div>

        <div className="card card--pad">
          <h3 className="h3" style={{ marginBottom: 18 }}>Business</h3>

          <div className="field">
            <label htmlFor="greeting">Opening line</label>
            <textarea id="greeting" value={form.greeting || ''} onChange={set('greeting')}
                      placeholder="Leave blank and Vera will write her own greeting." />
          </div>

          <div className="field">
            <label htmlFor="hours">Opening hours</label>
            <input id="hours" value={form.businessHours || ''} onChange={set('businessHours')} placeholder="Mon-Fri 9am-6pm" />
          </div>

          <div className="field">
            <label>Services</label>
            <div className="row" style={{ gap: 8 }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addService() } }}
                     placeholder="Add a service" />
              <button type="button" className="btn btn--ghost btn--sm" onClick={addService}>Add</button>
            </div>
            <div className="chip-list" style={{ marginTop: 10 }}>
              {(form.services || []).map((s) => (
                <span key={s} className="chip">
                  {s}
                  <button type="button" aria-label={`Remove ${s}`}
                          onClick={() => { setForm((f) => ({ ...f, services: f.services.filter((x) => x !== s) })); setSaved(false) }}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="escalate">Transfer callers to</label>
            <input id="escalate" value={form.escalateTo || ''} onChange={set('escalateTo')} placeholder="Alex on the front desk" />
          </div>

          <button className="btn btn--block" disabled={busy}>
            {busy ? <span className="spinner" /> : 'Save changes'}
          </button>
        </div>
      </form>
    </>
  )
}
