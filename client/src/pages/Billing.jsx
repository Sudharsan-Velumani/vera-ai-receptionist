import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Check } from '../components/Icons'

const money = (cents, currency = 'usd') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)

export default function Billing() {
  const { user, patchUser } = useAuth()
  const [packs, setPacks] = useState([])
  const [ledger, setLedger] = useState([])
  const [busy, setBusy] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState('')

  const load = () => {
    api.ledger().then((d) => { setLedger(d.ledger); patchUser({ credits: d.credits }) }).catch(() => {})
  }

  useEffect(() => {
    api.packs().then(setPacks).catch(() => {})
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const buy = async (packId) => {
    setBusy(packId)
    setError('')
    try {
      const res = await api.purchase(packId)
      patchUser({ credits: res.credits })
      setReceipt(res.receipt)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <div className="page-head">
        <h1 className="h2">Credits</h1>
        <p className="dim small">One credit covers one minute of call time.</p>
      </div>

      <div className="alert alert--info">
        Payments are simulated so the project runs with no Stripe account. Wiring
        this to a real Stripe Checkout Session is documented in the README —
        Stripe charges nothing monthly and test mode is free forever.
      </div>

      {error && <div className="alert">{error}</div>}
      {receipt && (
        <div className="alert alert--ok">
          <Check width={15} height={15} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
          {receipt.pack} pack added — {money(receipt.amount, receipt.currency)} (simulated, ref {receipt.reference})
        </div>
      )}

      <div className="card card--pad" style={{ marginBottom: 24 }}>
        <span className="small dim">Current balance</span>
        <div style={{ fontSize: '2.6rem', fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1.1 }}>
          {user?.credits ?? 0}
        </div>
        <span className="small faint">≈ {user?.credits ?? 0} minutes of calls</span>
      </div>

      <div className="grid-3" style={{ marginBottom: 28 }}>
        {packs.map((p) => (
          <div key={p.id} className="card card--pad" style={p.popular ? { borderColor: 'var(--accent)' } : undefined}>
            {p.popular && <span className="tag tag--booking" style={{ marginBottom: 10 }}>Most popular</span>}
            <h3 className="h3">{p.name}</h3>
            <div style={{ fontSize: '1.9rem', fontWeight: 600, letterSpacing: '-0.03em', margin: '8px 0 2px' }}>
              {money(p.price, p.currency)}
            </div>
            <span className="small dim">{p.credits} credits · {(p.price / p.credits / 100).toFixed(3)} per minute</span>
            <button className="btn btn--block" style={{ marginTop: 18 }} disabled={!!busy} onClick={() => buy(p.id)}>
              {busy === p.id ? <span className="spinner" /> : 'Buy credits'}
            </button>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px 0' }}>
          <h3 className="h3">History</h3>
        </div>
        {ledger.length === 0 ? (
          <div className="empty"><p className="small">No transactions yet.</p></div>
        ) : (
          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Description</th><th>Change</th><th>Balance</th><th>When</th></tr>
            </thead>
            <tbody>
              {ledger.map((row) => (
                <tr key={row.id} style={{ cursor: 'default' }}>
                  <td>{row.reason}</td>
                  <td style={{ color: row.delta >= 0 ? 'var(--green)' : 'var(--fg-dim)', fontWeight: 500 }}>
                    {row.delta >= 0 ? '+' : ''}{row.delta}
                  </td>
                  <td className="dim">{row.balance_after}</td>
                  <td className="faint small" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(row.created_at.replace(' ', 'T') + 'Z').toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
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
