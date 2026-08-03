import { Router } from 'express'
import { adjustCredits } from '../db/index.js'
import { requireAuth } from '../auth.js'

const router = Router()
router.use(requireAuth)

/**
 * Credit packs.
 *
 * Purchases are simulated. Stripe charges nothing to integrate and nothing in
 * test mode, so wiring this to a real Checkout Session is a small change —
 * see README "Wiring Stripe". Kept simulated by default so the project runs
 * with no keys and no account.
 */
export const PACKS = [
  { id: 'starter', name: 'Starter', credits: 100, price: 900, currency: 'usd' },
  { id: 'growth', name: 'Growth', credits: 500, price: 3900, currency: 'usd', popular: true },
  { id: 'scale', name: 'Scale', credits: 2000, price: 12900, currency: 'usd' },
]

router.get('/packs', (_req, res) => res.json(PACKS))

router.get('/ledger', async (req, res, next) => {
  try {
    const rows = await req.db.all(
      'SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 100',
      [req.user.id],
    )
    res.json({ credits: req.user.credits, ledger: rows })
  } catch (err) {
    next(err)
  }
})

router.post('/purchase', async (req, res, next) => {
  try {
    const pack = PACKS.find((p) => p.id === req.body?.packId)
    if (!pack) return res.status(400).json({ error: 'Unknown credit pack' })

    const balance = await adjustCredits(req.db, req.user.id, pack.credits, `${pack.name} pack (simulated payment)`)
    res.json({
      credits: balance,
      receipt: {
        pack: pack.name,
        amount: pack.price,
        currency: pack.currency,
        simulated: true,
        reference: `sim_${Date.now().toString(36)}`,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
