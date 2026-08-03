import { Router } from 'express'
import { nowIso } from '../db/index.js'
import { requireAuth } from '../auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', async (req, res, next) => {
  try {
    if (req.query.scope === 'all') {
      const rows = await req.db.all(
        'SELECT * FROM appointments WHERE user_id = ? ORDER BY starts_at ASC LIMIT 100',
        [req.user.id],
      )
      return res.json(rows)
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const rows = await req.db.all(
      'SELECT * FROM appointments WHERE user_id = ? AND starts_at > ? ORDER BY starts_at ASC LIMIT 100',
      [req.user.id, since],
    )
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { title, customerName = '', startsAt, durationMin = 30, notes = '' } = req.body || {}
    if (!title || !startsAt) return res.status(400).json({ error: 'Title and start time are required' })
    if (Number.isNaN(Date.parse(startsAt))) return res.status(400).json({ error: 'Invalid start time' })

    const info = await req.db.run(
      `INSERT INTO appointments (user_id, title, customer_name, starts_at, duration_min, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        req.user.id, title, customerName, new Date(startsAt).toISOString(),
        Number(durationMin) || 30, notes, nowIso(),
      ],
    )
    const id = info.rows[0]?.id ?? info.lastId
    res.status(201).json(await req.db.get('SELECT * FROM appointments WHERE id = ?', [id]))
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const appt = await req.db.get('SELECT * FROM appointments WHERE id = ? AND user_id = ?', [
      req.params.id, req.user.id,
    ])
    if (!appt) return res.status(404).json({ error: 'Appointment not found' })

    const status = ['confirmed', 'cancelled', 'completed'].includes(req.body?.status)
      ? req.body.status
      : appt.status

    await req.db.run('UPDATE appointments SET status = ?, notes = ? WHERE id = ?', [
      status, req.body?.notes ?? appt.notes, appt.id,
    ])
    res.json(await req.db.get('SELECT * FROM appointments WHERE id = ?', [appt.id]))
  } catch (err) {
    next(err)
  }
})

export default router
