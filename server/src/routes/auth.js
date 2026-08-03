import { Router } from 'express'
import { adjustCredits, nowIso } from '../db/index.js'
import { hashPassword, verifyPassword, signToken, requireAuth } from '../auth.js'

const router = Router()
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, name, businessName, preferences = {} } = req.body || {}

    if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'Enter a valid email address' })
    if ((password || '').length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
    if (!(name || '').trim()) return res.status(400).json({ error: 'Name is required' })

    const exists = await req.db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()])
    if (exists) return res.status(409).json({ error: 'An account with that email already exists' })

    const hash = await hashPassword(password)
    const created = await req.db.run(
      `INSERT INTO users (email, password_hash, name, business_name, created_at)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
      [email.toLowerCase(), hash, name.trim(), (businessName || '').trim(), nowIso()],
    )
    const userId = created.rows[0]?.id ?? created.lastId

    await req.db.run(
      `INSERT INTO preferences
         (user_id, voice_name, language, accent, tone, rate, pitch, greeting,
          business_hours, services, escalate_to, barge_in, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        preferences.voiceName || '',
        preferences.language || 'en-US',
        preferences.accent || preferences.language || 'en-US',
        preferences.tone || 'warm',
        preferences.rate ?? 1.0,
        preferences.pitch ?? 1.0,
        preferences.greeting || '',
        preferences.businessHours || 'Mon-Fri 9am-6pm',
        JSON.stringify(preferences.services || ['General enquiry']),
        preferences.escalateTo || '',
        preferences.bargeIn ? 1 : 0,
        nowIso(),
      ],
    )

    await adjustCredits(req.db, userId, Number(process.env.SIGNUP_CREDITS || 60), 'Welcome credits')

    const user = await req.db.get(
      'SELECT id, email, name, business_name, role, credits FROM users WHERE id = ?',
      [userId],
    )
    res.status(201).json({ token: signToken(user), user })
  } catch (err) {
    next(err)
  }
})

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {}
    const row = await req.db.get('SELECT * FROM users WHERE email = ?', [(email || '').toLowerCase()])

    // Same message and comparable timing for both failure modes, so the
    // endpoint can't be used to enumerate which emails have accounts.
    const ok = row && (await verifyPassword(password || '', row.password_hash))
    if (!ok) return res.status(401).json({ error: 'Email or password is incorrect' })

    const { password_hash, ...user } = row
    res.json({ token: signToken(user), user })
  } catch (err) {
    next(err)
  }
})

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const prefs = await req.db.get('SELECT * FROM preferences WHERE user_id = ?', [req.user.id])
    res.json({ user: req.user, preferences: prefs ? shapePrefs(prefs) : null })
  } catch (err) {
    next(err)
  }
})

export const shapePrefs = (p) => ({
  voiceName: p.voice_name,
  language: p.language,
  accent: p.accent,
  tone: p.tone,
  rate: Number(p.rate),
  pitch: Number(p.pitch),
  greeting: p.greeting,
  businessHours: p.business_hours,
  services: safeJson(p.services, []),
  escalateTo: p.escalate_to,
  bargeIn: !!p.barge_in,
})

export const safeJson = (raw, fallback) => {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw ?? fallback
  } catch {
    return fallback
  }
}

export default router
