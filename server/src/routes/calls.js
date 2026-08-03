import { Router } from 'express'
import { adjustCredits, nowIso } from '../db/index.js'
import { requireAuth } from '../auth.js'
import { shapePrefs, safeJson } from './auth.js'
import { generateReply, generateSummary, transcribe, providers } from '../ai/index.js'

const router = Router()
router.use(requireAuth)

/** Pulls the caller's business context out of preferences, once per request. */
async function contextFor(db, userId) {
  const row = await db.get('SELECT * FROM preferences WHERE user_id = ?', [userId])
  const user = await db.get('SELECT business_name FROM users WHERE id = ?', [userId])
  const prefs = row ? shapePrefs(row) : {}
  return {
    prefs,
    business: {
      name: user?.business_name || '',
      hours: prefs.businessHours,
      services: prefs.services || [],
      escalateTo: prefs.escalateTo,
    },
  }
}

const historyFor = (db, callId) =>
  db.all('SELECT role, text FROM turns WHERE call_id = ? ORDER BY id', [callId])

/* ------------------------------------------------------------------
   POST /api/calls — start a call and get the opening line
------------------------------------------------------------------ */
router.post('/', async (req, res, next) => {
  try {
    if (req.user.credits <= 0) {
      return res.status(402).json({ error: 'Out of credits. Top up to take more calls.' })
    }

    const { callerName = 'Web visitor', callerPhone = '', transport = 'browser' } = req.body || {}
    const { prefs, business } = await contextFor(req.db, req.user.id)

    const created = await req.db.run(
      `INSERT INTO calls (user_id, caller_name, caller_phone, transport, started_at)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
      [req.user.id, callerName, callerPhone, transport, nowIso()],
    )
    const callId = Number(created.rows[0]?.id ?? created.lastId)

    const reply = await generateReply({ history: [], prefs, business })
    await req.db.run(
      'INSERT INTO turns (call_id, role, text, created_at) VALUES (?, ?, ?, ?)',
      [callId, 'assistant', reply.text, nowIso()],
    )
    await req.db.run('UPDATE calls SET provider = ? WHERE id = ?', [reply.provider, callId])

    res.status(201).json({
      callId,
      reply: reply.text,
      provider: reply.provider,
      degraded: !!reply.degraded,
      providers: providers(),
    })
  } catch (err) {
    next(err)
  }
})

/* ------------------------------------------------------------------
   POST /api/calls/:id/turn — caller says something, Vera answers
------------------------------------------------------------------ */
router.post('/:id/turn', async (req, res, next) => {
  try {
    const call = await req.db.get(
      "SELECT * FROM calls WHERE id = ? AND user_id = ? AND status = 'live'",
      [req.params.id, req.user.id],
    )
    if (!call) return res.status(404).json({ error: 'No live call with that id' })

    const text = String(req.body?.text || '').trim()
    if (!text) return res.status(400).json({ error: 'Nothing was said' })
    if (text.length > 2000) return res.status(400).json({ error: 'Turn too long' })

    await req.db.run('INSERT INTO turns (call_id, role, text, created_at) VALUES (?, ?, ?, ?)', [
      call.id, 'caller', text, nowIso(),
    ])

    const { prefs, business } = await contextFor(req.db, req.user.id)
    const started = Date.now()
    const reply = await generateReply({ history: await historyFor(req.db, call.id), prefs, business })
    const latency = Date.now() - started

    await req.db.run(
      'INSERT INTO turns (call_id, role, text, latency_ms, created_at) VALUES (?, ?, ?, ?, ?)',
      [call.id, 'assistant', reply.text, latency, nowIso()],
    )

    // The brain can decide a booking was agreed — persist it immediately so it
    // shows up in the CRM even if the caller hangs up mid-sentence.
    let appointment = null
    if (reply.booking?.startsAt) {
      const already = await req.db.get('SELECT id FROM appointments WHERE call_id = ?', [call.id])
      if (!already) {
        const info = await req.db.run(
          `INSERT INTO appointments (user_id, call_id, title, customer_name, starts_at, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [
            req.user.id, call.id, reply.booking.title,
            reply.booking.customerName || call.caller_name,
            reply.booking.startsAt, reply.booking.notes || '', nowIso(),
          ],
        )
        const apptId = info.rows[0]?.id ?? info.lastId
        appointment = await req.db.get('SELECT * FROM appointments WHERE id = ?', [apptId])
      }
    }

    res.json({
      reply: reply.text,
      latencyMs: latency,
      provider: reply.provider,
      degraded: !!reply.degraded,
      shouldEnd: !!reply.done,
      appointment,
    })
  } catch (err) {
    next(err)
  }
})

/* ------------------------------------------------------------------
   POST /api/calls/:id/end — hang up, summarise, bill
------------------------------------------------------------------ */
router.post('/:id/end', async (req, res, next) => {
  try {
    const call = await req.db.get(
      "SELECT * FROM calls WHERE id = ? AND user_id = ? AND status = 'live'",
      [req.params.id, req.user.id],
    )
    if (!call) return res.status(404).json({ error: 'No live call with that id' })

    const turns = await historyFor(req.db, call.id)
    const durationMs = Math.max(0, Number(req.body?.durationMs) || 0)
    const { business } = await contextFor(req.db, req.user.id)

    let summary = { summary: '', intent: '', sentiment: '', actionItems: [], provider: 'none' }
    if (turns.filter((t) => t.role === 'caller').length > 0) {
      summary = await generateSummary({ turns, business })
    } else {
      summary.summary = 'Call connected but the caller did not speak.'
      summary.intent = 'general'
      summary.sentiment = 'neutral'
    }

    // 1 credit per started minute, minimum 1.
    const credits = Math.max(1, Math.ceil(durationMs / 60000))
    const balance = await adjustCredits(req.db, req.user.id, -credits, `Call #${call.id}`)

    await req.db.run(
      `UPDATE calls SET status = 'completed', ended_at = ?,
         duration_ms = ?, credits_used = ?, summary = ?, intent = ?, sentiment = ?, action_items = ?
       WHERE id = ?`,
      [
        nowIso(), durationMs, credits, summary.summary, summary.intent,
        summary.sentiment, JSON.stringify(summary.actionItems || []), call.id,
      ],
    )

    const updated = await req.db.get('SELECT * FROM calls WHERE id = ?', [call.id])
    res.json({
      call: shapeCall(updated),
      creditsUsed: credits,
      creditsRemaining: balance,
      provider: summary.provider,
      degraded: !!summary.degraded,
    })
  } catch (err) {
    next(err)
  }
})

/* ------------------------------------------------------------------
   POST /api/calls/transcribe — server-side Whisper (needs GROQ_API_KEY)
------------------------------------------------------------------ */
router.post('/transcribe', async (req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', async () => {
    try {
      const text = await transcribe(Buffer.concat(chunks), 'audio.webm')
      res.json({ text })
    } catch (err) {
      res.status(503).json({ error: err.message })
    }
  })
})

/* ------------------------------------------------------------------
   Reads
------------------------------------------------------------------ */
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
    const rows = await req.db.all(
      'SELECT * FROM calls WHERE user_id = ? ORDER BY id DESC LIMIT ?',
      [req.user.id, limit],
    )
    res.json(rows.map(shapeCall))
  } catch (err) {
    next(err)
  }
})

router.get('/stats', async (req, res, next) => {
  try {
    const s = await req.db.get(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(duration_ms), 0) AS totalms,
              COALESCE(SUM(credits_used), 0) AS credits,
              COALESCE(SUM(CASE WHEN intent = 'booking' THEN 1 ELSE 0 END), 0) AS bookings,
              COALESCE(SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END), 0) AS negative
       FROM calls WHERE user_id = ? AND status = 'completed'`,
      [req.user.id],
    )

    const latency = await req.db.get(
      `SELECT COALESCE(AVG(latency_ms), 0) AS avglatency FROM turns
       WHERE latency_ms > 0 AND call_id IN (SELECT id FROM calls WHERE user_id = ?)`,
      [req.user.id],
    )

    const upcoming = await req.db.get(
      'SELECT COUNT(*) AS n FROM appointments WHERE user_id = ? AND starts_at > ?',
      [req.user.id, nowIso()],
    )

    // Postgres returns COUNT/SUM as strings; SQLite returns numbers.
    const n = (v) => Number(v ?? 0)

    res.json({
      totalCalls: n(s.total),
      totalMinutes: Math.round(n(s.totalms) / 60000),
      creditsUsed: n(s.credits),
      bookings: n(s.bookings),
      negative: n(s.negative),
      avgLatencyMs: Math.round(n(latency.avglatency)),
      upcomingAppointments: n(upcoming.n),
    })
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const call = await req.db.get('SELECT * FROM calls WHERE id = ? AND user_id = ?', [
      req.params.id, req.user.id,
    ])
    if (!call) return res.status(404).json({ error: 'Call not found' })

    const turns = await req.db.all('SELECT * FROM turns WHERE call_id = ? ORDER BY id', [call.id])
    const appointment = await req.db.get('SELECT * FROM appointments WHERE call_id = ?', [call.id])

    res.json({ call: shapeCall(call), turns, appointment: appointment || null })
  } catch (err) {
    next(err)
  }
})

export const shapeCall = (c) => ({
  id: c.id,
  callerName: c.caller_name,
  callerPhone: c.caller_phone,
  transport: c.transport,
  direction: c.direction,
  status: c.status,
  intent: c.intent,
  sentiment: c.sentiment,
  summary: c.summary,
  actionItems: safeJson(c.action_items, []),
  durationMs: Number(c.duration_ms),
  creditsUsed: Number(c.credits_used),
  provider: c.provider,
  startedAt: c.started_at,
  endedAt: c.ended_at,
})

export default router
