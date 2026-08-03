import { Router } from 'express'
import { nowIso } from '../db/index.js'
import { requireAuth } from '../auth.js'
import { shapePrefs } from './auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', async (req, res, next) => {
  try {
    const row = await req.db.get('SELECT * FROM preferences WHERE user_id = ?', [req.user.id])
    res.json(row ? shapePrefs(row) : {})
  } catch (err) {
    next(err)
  }
})

router.put('/', async (req, res, next) => {
  try {
    const b = req.body || {}
    const current = await req.db.get('SELECT * FROM preferences WHERE user_id = ?', [req.user.id])
    if (!current) return res.status(404).json({ error: 'No preferences found' })

    const clamp = (n, lo, hi, dflt) => {
      const v = Number(n)
      return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt
    }

    const services = Array.isArray(b.services)
      ? b.services.filter(Boolean).slice(0, 12)
      : JSON.parse(current.services)

    await req.db.run(
      `UPDATE preferences SET
         voice_name = ?, language = ?, accent = ?, tone = ?, rate = ?, pitch = ?,
         greeting = ?, business_hours = ?, services = ?, escalate_to = ?, barge_in = ?,
         updated_at = ?
       WHERE user_id = ?`,
      [
        b.voiceName ?? current.voice_name,
        b.language ?? current.language,
        b.accent ?? current.accent,
        ['warm', 'formal', 'brisk'].includes(b.tone) ? b.tone : current.tone,
        clamp(b.rate, 0.5, 2, current.rate),
        clamp(b.pitch, 0, 2, current.pitch),
        b.greeting ?? current.greeting,
        b.businessHours ?? current.business_hours,
        JSON.stringify(services),
        b.escalateTo ?? current.escalate_to,
        b.bargeIn === undefined ? current.barge_in : (b.bargeIn ? 1 : 0),
        nowIso(),
        req.user.id,
      ],
    )

    const updated = await req.db.get('SELECT * FROM preferences WHERE user_id = ?', [req.user.id])
    res.json(shapePrefs(updated))
  } catch (err) {
    next(err)
  }
})

export default router
