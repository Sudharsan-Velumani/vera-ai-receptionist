import 'dotenv/config'
import { initDb, adjustCredits, nowIso, closeDb } from './db/index.js'
import { hashPassword } from './auth.js'
import { generateReply, generateSummary } from './ai/index.js'

/**
 * Creates a demo account with call history, so the dashboard has something in
 * it the first time a prospect looks at it. Empty states are honest but they
 * do not sell.
 *
 *   npm run seed      ->  demo@vera.app / demo1234
 *
 * Works against whichever database is configured — SQLite locally, Postgres
 * when DATABASE_URL is set.
 */

const EMAIL = 'demo@vera.app'
const PASSWORD = 'demo1234'

const CONVERSATIONS = [
  { caller: 'Priya Sharma', lines: [
    'Hi, I was hoping to book a deep tissue massage.',
    'My name is Priya Sharma.',
    'Could I do tomorrow at 3?',
    "That's perfect, thank you so much. Bye.",
  ]},
  { caller: 'Tom Whitfield', lines: [
    'What time are you open until on a Saturday?',
    'Great, and how much is a sports massage?',
    'Okay, I will call back to book. Thanks, bye.',
  ]},
  { caller: 'Unknown caller', lines: [
    'I need to speak to a human please.',
    'It is about an invoice I was sent, I think it is wrong.',
    'Alright, thank you. Goodbye.',
  ]},
  { caller: 'Meera Iyer', lines: [
    'Can I book a facial for next friday 2pm?',
    'This is Meera Iyer.',
    'Yes that works. You can reach me on 555 018 2244.',
    "Lovely, that's all. Bye!",
  ]},
]

async function main() {
  const db = await initDb()

  await db.run('DELETE FROM users WHERE email = ?', [EMAIL])

  const hash = await hashPassword(PASSWORD)
  const created = await db.run(
    `INSERT INTO users (email, password_hash, name, business_name, created_at)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
    [EMAIL, hash, 'Alex Rivera', 'Meridian Wellness Studio', nowIso()],
  )
  const userId = Number(created.rows[0]?.id ?? created.lastId)

  const services = ['Deep tissue massage', 'Sports massage', 'Facial', 'Physiotherapy']
  await db.run(
    `INSERT INTO preferences
       (user_id, voice_name, language, accent, tone, rate, pitch, greeting,
        business_hours, services, escalate_to, barge_in, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId, '', 'en-GB', 'en-GB', 'warm', 1.0, 1.0,
      'Good morning, Meridian Wellness Studio — this is Vera. How can I help?',
      'Mon-Sat 8am-8pm, Sun closed',
      JSON.stringify(services),
      'Alex on the front desk',
      0,
      nowIso(),
    ],
  )

  await adjustCredits(db, userId, 500, 'Demo account credits')

  const business = {
    name: 'Meridian Wellness Studio',
    hours: 'Mon-Sat 8am-8pm, Sun closed',
    services,
    escalateTo: 'Alex on the front desk',
  }
  const prefs = {
    tone: 'warm',
    greeting: 'Good morning, Meridian Wellness Studio — this is Vera. How can I help?',
  }

  for (const convo of CONVERSATIONS) {
    const callRow = await db.run(
      'INSERT INTO calls (user_id, caller_name, transport, started_at) VALUES (?, ?, ?, ?) RETURNING id',
      [userId, convo.caller, 'browser', nowIso()],
    )
    const callId = Number(callRow.rows[0]?.id ?? callRow.lastId)

    const history = []
    const opening = await generateReply({ history, prefs, business })
    await db.run('INSERT INTO turns (call_id, role, text, created_at) VALUES (?, ?, ?, ?)', [
      callId, 'assistant', opening.text, nowIso(),
    ])
    history.push({ role: 'assistant', text: opening.text })

    for (const line of convo.lines) {
      await db.run('INSERT INTO turns (call_id, role, text, created_at) VALUES (?, ?, ?, ?)', [
        callId, 'caller', line, nowIso(),
      ])
      history.push({ role: 'caller', text: line })

      const reply = await generateReply({ history, prefs, business })
      await db.run(
        'INSERT INTO turns (call_id, role, text, latency_ms, created_at) VALUES (?, ?, ?, ?, ?)',
        [callId, 'assistant', reply.text, 120 + Math.round(Math.random() * 300), nowIso()],
      )
      history.push({ role: 'assistant', text: reply.text })

      if (reply.booking?.startsAt) {
        const already = await db.get('SELECT id FROM appointments WHERE call_id = ?', [callId])
        if (!already) {
          await db.run(
            `INSERT INTO appointments (user_id, call_id, title, customer_name, starts_at, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              userId, callId, reply.booking.title, reply.booking.customerName,
              reply.booking.startsAt, reply.booking.notes || '', nowIso(),
            ],
          )
        }
      }
    }

    const summary = await generateSummary({ turns: history, business })
    const durationMs = (60 + Math.round(Math.random() * 180)) * 1000
    const credits = Math.max(1, Math.ceil(durationMs / 60000))
    await adjustCredits(db, userId, -credits, `Call #${callId}`)

    await db.run(
      `UPDATE calls SET status = 'completed', ended_at = ?, duration_ms = ?, credits_used = ?,
         summary = ?, intent = ?, sentiment = ?, action_items = ?, provider = ? WHERE id = ?`,
      [
        nowIso(), durationMs, credits, summary.summary, summary.intent, summary.sentiment,
        JSON.stringify(summary.actionItems || []), summary.provider || 'mock', callId,
      ],
    )
  }

  console.log(`\n  Seeded ${CONVERSATIONS.length} calls.`)
  console.log(`  Sign in with  ${EMAIL}  /  ${PASSWORD}\n`)
  await closeDb()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
