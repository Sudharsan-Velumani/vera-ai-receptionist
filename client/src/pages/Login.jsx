import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const onSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(form)
      navigate('/app')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const useDemo = () => setForm({ email: 'demo@vera.app', password: 'demo1234' })

  return (
    <div className="auth">
      <div className="auth__card card card--pad">
        <div className="brand">
          <span className="brand__mark">V</span>
          Vera
        </div>

        <h1 className="h2" style={{ marginBottom: 6 }}>Welcome back</h1>
        <p className="dim small" style={{ marginBottom: 22 }}>Sign in to your receptionist.</p>

        {error && <div className="alert">{error}</div>}

        <form onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={form.email} onChange={set('email')}
                   autoComplete="email" placeholder="you@business.com" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={form.password} onChange={set('password')}
                   autoComplete="current-password" placeholder="••••••••" />
          </div>

          <button className="btn btn--block" disabled={busy}>
            {busy ? <span className="spinner" /> : 'Sign in'}
          </button>
        </form>

        <button className="btn btn--ghost btn--sm btn--block" style={{ marginTop: 10 }} onClick={useDemo}>
          Use the demo account
        </button>

        <p className="small dim" style={{ marginTop: 18, textAlign: 'center' }}>
          No account? <Link className="link" to="/signup">Create one</Link>
        </p>
      </div>
    </div>
  )
}
