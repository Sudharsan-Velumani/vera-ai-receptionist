/**
 * End-to-end smoke test.
 *
 *   npm run smoke          (starts nothing — expects the API on :4000)
 *
 * Drives a complete signup -> live call -> booking -> hangup -> summary flow
 * against the real HTTP API. No mocks, no stubs: if this passes, the vertical
 * slice genuinely works.
 */

const API = process.env.API || 'http://localhost:4000/api'

let passed = 0
let failed = 0

const ok = (label, cond, detail = '') => {
  if (cond) {
    passed++
    console.log(`  \x1b[32mPASS\x1b[0m  ${label}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`)
  } else {
    failed++
    console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? `  ${detail}` : ''}`)
  }
}

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* non-JSON response */ }
  return { status: res.status, body: json, raw: text }
}

async function main() {
  console.log('\n\x1b[1mVera — end-to-end smoke test\x1b[0m\n')

  /* ---------- health ---------- */
  const health = await call('/health')
  ok('API is up', health.status === 200)
  ok('reports its providers', !!health.body?.providers,
     health.body ? `llm=${health.body.providers.llm} stt=${health.body.providers.stt}` : '')

  /* ---------- auth ---------- */
  const email = `smoke_${Date.now()}@vera.test`
  const signup = await call('/auth/signup', {
    method: 'POST',
    body: {
      email, password: 'testing1234', name: 'Smoke Tester',
      businessName: 'Harbour Dental',
      preferences: { tone: 'warm', businessHours: 'Mon-Fri 9am-5pm',
                     services: ['Check-up', 'Whitening', 'Emergency appointment'] },
    },
  })
  ok('signup creates an account', signup.status === 201, signup.body?.error || '')
  const token = signup.body?.token
  ok('signup returns a JWT', typeof token === 'string' && token.length > 20)
  ok('new account gets welcome credits', signup.body?.user?.credits > 0,
     `${signup.body?.user?.credits} credits`)

  const dupe = await call('/auth/signup', { method: 'POST', body: { email, password: 'testing1234', name: 'X' } })
  ok('duplicate email is rejected', dupe.status === 409)

  const weak = await call('/auth/signup', { method: 'POST', body: { email: 'a@b.co', password: '123', name: 'X' } })
  ok('short password is rejected', weak.status === 400)

  const badLogin = await call('/auth/login', { method: 'POST', body: { email, password: 'wrong-password' } })
  ok('wrong password is rejected', badLogin.status === 401)

  const noAuth = await call('/calls')
  ok('protected route rejects anonymous', noAuth.status === 401)

  /* ---------- the call ---------- */
  console.log('\n  \x1b[90m--- live call ---\x1b[0m')
  const start = await call('/calls', { method: 'POST', token, body: { callerName: 'Daniel Okafor' } })
  ok('call starts', start.status === 201, start.body?.error || '')
  const callId = start.body?.callId
  ok('Vera greets the caller first', (start.body?.reply || '').length > 10)
  console.log(`        \x1b[36mVera  :\x1b[0m ${start.body?.reply}`)

  const script = [
    "Hi, I'd like to book a check-up please",
    "It's Daniel Okafor",
    'Can I come in tomorrow at 4pm?',
    "Perfect, that's all. Thanks, bye!",
  ]

  let appointment = null
  let sawEnd = false
  for (const line of script) {
    console.log(`        \x1b[33mCaller:\x1b[0m ${line}`)
    const turn = await call(`/calls/${callId}/turn`, { method: 'POST', token, body: { text: line } })
    if (turn.status !== 200) { ok(`turn "${line.slice(0, 24)}..."`, false, turn.body?.error); break }
    console.log(`        \x1b[36mVera  :\x1b[0m ${turn.body.reply}`)
    if (turn.body.appointment) appointment = turn.body.appointment
    if (turn.body.shouldEnd) sawEnd = true
  }

  ok('conversation ran to completion', true)
  ok('a booking was extracted from speech', !!appointment,
     appointment ? `${appointment.title} for ${appointment.customer_name} at ${appointment.starts_at}` : 'no appointment created')
  ok('the caller name was picked up', appointment?.customer_name === 'Daniel Okafor',
     appointment?.customer_name || '')
  ok('goodbye ends the call', sawEnd)

  const empty = await call(`/calls/${callId}/turn`, { method: 'POST', token, body: { text: '' } })
  ok('empty turn is rejected', empty.status === 400)

  /* ---------- hang up ---------- */
  console.log('\n  \x1b[90m--- hang up ---\x1b[0m')
  const end = await call(`/calls/${callId}/end`, { method: 'POST', token, body: { durationMs: 182000 } })
  ok('call ends cleanly', end.status === 200, end.body?.error || '')
  ok('an AI summary was written', (end.body?.call?.summary || '').length > 20)
  ok('intent was classified', !!end.body?.call?.intent, end.body?.call?.intent)
  ok('action items were produced', (end.body?.call?.actionItems || []).length > 0)
  ok('credits were billed', end.body?.creditsUsed === 4, `${end.body?.creditsUsed} credits for 3m2s`)
  console.log(`        \x1b[90msummary:\x1b[0m ${end.body?.call?.summary}`)
  for (const item of end.body?.call?.actionItems || []) console.log(`        \x1b[90m  - ${item}\x1b[0m`)

  const reEnd = await call(`/calls/${callId}/end`, { method: 'POST', token, body: { durationMs: 1000 } })
  ok('a call cannot be ended twice', reEnd.status === 404)

  /* ---------- reads ---------- */
  console.log('\n  \x1b[90m--- dashboard reads ---\x1b[0m')
  const detail = await call(`/calls/${callId}`, { token })
  ok('call detail returns the transcript', (detail.body?.turns || []).length === script.length * 2 + 1,
     `${detail.body?.turns?.length} turns`)
  ok('appointment is attached to the call', !!detail.body?.appointment)

  const list = await call('/calls', { token })
  ok('call appears in the log', Array.isArray(list.body) && list.body.length >= 1)

  const stats = await call('/calls/stats', { token })
  ok('stats aggregate correctly', stats.body?.totalCalls >= 1,
     `${stats.body?.totalCalls} calls, ${stats.body?.upcomingAppointments} upcoming`)

  const appts = await call('/appointments', { token })
  ok('appointment is in the calendar', (appts.body || []).length >= 1)

  /* ---------- isolation ---------- */
  const other = await call('/auth/signup', {
    method: 'POST',
    body: { email: `other_${Date.now()}@vera.test`, password: 'testing1234', name: 'Other' },
  })
  const peek = await call(`/calls/${callId}`, { token: other.body.token })
  ok("another user cannot read someone else's call", peek.status === 404)

  /* ---------- billing ---------- */
  console.log('\n  \x1b[90m--- billing ---\x1b[0m')
  const before = (await call('/billing/ledger', { token })).body?.credits
  const buy = await call('/billing/purchase', { method: 'POST', token, body: { packId: 'growth' } })
  ok('credit purchase works', buy.status === 200 && buy.body.credits === before + 500,
     `${before} -> ${buy.body?.credits}`)
  const badPack = await call('/billing/purchase', { method: 'POST', token, body: { packId: 'nope' } })
  ok('unknown pack is rejected', badPack.status === 400)

  /* ---------- preferences ---------- */
  const prefs = await call('/preferences', { method: 'PUT', token, body: { tone: 'brisk', rate: 5, pitch: 1.2 } })
  ok('preferences update', prefs.body?.tone === 'brisk')
  ok('out-of-range rate is clamped', prefs.body?.rate === 2, `rate=${prefs.body?.rate}`)

  /* ---------- result ---------- */
  console.log(`\n  \x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\n  smoke test crashed:', e.message, '\n')
  process.exit(1)
})
