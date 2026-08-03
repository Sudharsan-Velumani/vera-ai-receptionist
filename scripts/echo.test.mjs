/**
 * Regression test for the microphone echo loop.
 *
 * The first case is the transcript that actually appeared in the app: Vera's
 * greeting, mangled by the recogniser hearing it through the laptop speakers.
 */
import { looksLikeEcho, similarity } from '../client/src/voice/echo.js'

const GREETING = 'Good morning, Meridian Wellness Studio — this is Vera. How can I help?'
const MENU = 'Of course. I can book appointments, check availability, answer questions about Deep tissue massage, Sports massage, Facial and Physiotherapy, or pass you to a colleague. What would be most useful?'

const cases = [
  // --- must be caught: the assistant's own voice coming back ---
  ['Good morning already in Wellness Studio this is Liam how can I help', GREETING, true,  'the exact bug reported'],
  ['good morning meridian wellness studio this is vera how can i help',   GREETING, true,  'clean echo'],
  ['this is Vera how can I help',                                          GREETING, true,  'partial tail echo'],
  ['I can book appointments check availability answer questions about deep tissue massage', MENU, true, 'echo of the menu line'],

  // --- must get through: a real caller ---
  ["Hi, I'd like to book a deep tissue massage",       GREETING, false, 'genuine booking request'],
  ["It's Priya Sharma",                                 GREETING, false, 'giving a name'],
  ['Could I do tomorrow at three?',                     GREETING, false, 'proposing a time'],
  ['Actually can I speak to a human please',            GREETING, false, 'escalation request'],
  ['What time do you close on Saturday',                GREETING, false, 'a question'],
  ['yes',                                               GREETING, false, 'one word — always let through'],
  ['no thanks',                                         GREETING, false, 'two words — always let through'],
  ['sorry, can you repeat that',                        GREETING, false, 'short and partially overlapping'],
  ['I need a sports massage booking for Friday',        MENU,     false, 'caller reusing service words'],
]

let fail = 0
console.log('\n\x1b[1mEcho rejection\x1b[0m\n')
for (const [heard, spoken, want, label] of cases) {
  const got = looksLikeEcho(heard, spoken)
  const ok = got === want
  if (!ok) fail++
  const score = similarity(heard, spoken).toFixed(2)
  console.log(
    `  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ` +
    `${(want ? 'reject' : 'accept').padEnd(6)} ${label.padEnd(34)} ` +
    `\x1b[90msim=${score} -> ${got ? 'echo' : 'caller'}\x1b[0m`,
  )
}

console.log(`\n  \x1b[1m${cases.length - fail} passed, ${fail} failed\x1b[0m\n`)
process.exit(fail ? 1 : 0)
