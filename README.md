# Vera — AI receptionist

A full-stack voice AI application. Vera answers a call, holds a real
conversation, books the appointment, and writes the summary.

**It runs with zero API keys and costs nothing.** Clone, install, run.

```bash
npm install
npm run seed     # optional: demo account with call history
npm run dev      # client :5173  ·  api :4000
```

Sign in with **demo@vera.app** / **demo1234**, or create an account.
Then open **Live call** and press *Start call*. Talk into your microphone.

> Speech recognition needs Chrome or Edge. Everywhere else, the typed
> composer still works and Vera still answers out loud.

---

## What actually works

| | |
|---|---|
| **Voice conversation** | Real microphone capture, live interim transcript, spoken replies, and barge-in — talk over Vera and she stops. |
| **Slot filling** | Pulls the service, caller name, date and time out of natural speech. "It's Daniel, can I come in tomorrow at 4?" becomes a booked appointment. |
| **Auto-booking** | Appointments are written the moment they're agreed, not after the call, so a caller hanging up mid-sentence doesn't lose the booking. |
| **AI summaries** | Every call ends with a summary, classified intent, sentiment, and follow-up actions. |
| **Voice customisation** | Language, accent, voice, speed, pitch and tone — with live preview. |
| **Credits & billing** | Metered per minute, ledger, credit packs, simulated checkout. |
| **Auth** | bcrypt + JWT, per-user data isolation enforced at the query level. |
| **CRM** | Call log with search and intent filter, transcripts, exports, appointment management. |

---

## Zero-key architecture

The point of this design: **no key is a supported configuration, not an error
state.** You can demo it on a plane.

```
                    GROQ_API_KEY set?
                   ╱                 ╲
                 yes                  no
                  │                    │
    Llama 3.3 70B via Groq      Local slot-filling brain
    Whisper v3 transcription    Browser speech recognition
                  │                    │
                   ╲                 ╱
                    same response shape
                            │
                 routes, DB, UI unchanged
```

`server/src/ai/index.js` picks the provider at boot. Every call is wrapped in a
fallback — if Groq rate-limits you mid-demo, the offline brain finishes the
conversation and the UI shows a *"Provider fell back"* chip. The call does not
drop.

**To upgrade:** get a free key at [console.groq.com/keys](https://console.groq.com/keys)
(no credit card), put it in `.env`, restart. That's the whole migration.

### The offline brain

`server/src/ai/mockBrain.js` is a slot-filling state machine, not canned
responses. It tracks what it already knows across the whole conversation,
asks only for what's missing, and refuses to invent prices or availability.
`server/src/ai/slots.js` resolves "tomorrow at 3", "next friday 2pm" and
"monday morning" to real ISO timestamps.

It exists so the product survives contact with a client's meeting-room wifi.

---

## The transport seam

`client/src/voice/transport.js` defines `CallTransport` — five methods:
`start`, `onTranscript`, `speak`, `stopSpeaking`, `stop`.

`BrowserTransport` implements it with the microphone and the Web Speech API.
A `PstnTransport` backed by Twilio Media Streams implements the same five
methods and drops in without touching the state machine, the routes, or the UI.

This matters commercially. "We can put this on a real phone number" is a
sentence you can say in a sales call, backed by a seam that already exists —
rather than a rewrite you're quietly hoping nobody asks about.

Real phone numbers are the one piece with no free tier anywhere (~$1/month plus
per-minute, on every provider). The browser demo is better for selling anyway:
a prospect clicks and is talking to it in five seconds, no phone, no signup.

---

## Design language

Deep near-black under indigo and cyan. Glass surfaces with `backdrop-filter`,
generous rounded corners, gradient headlines, Inter throughout.

```css
--ink:      #07080f      --indigo: #6366f1
--panel:    #10121f      --cyan:   #22d3ee
--line:     rgba(255,255,255,0.09)
```

`--accent` and `--rule` are aliases pointing at `--indigo-2` and `--line`.
Components reference the semantic names, so a future re-theme only has to
repoint those two lines rather than sweep every file.

---

## The landing page

A marketing page that actually sells the product, not a feature list.

**A 3D voice orb** (`client/src/three/VoiceOrb.jsx`) — an icosahedron displaced
in a custom GLSL vertex shader by 3D simplex noise, wrapped in a fresnel rim, a
counter-rotating wireframe cage, a 72-bar radial equalizer and an additive
particle shell. Amplitude drives the noise, so it visibly *talks*.

**A playable demo call.** Press play and Vera speaks a real conversation out
loud through the browser while the orb reacts to her voice, the transcript
types in, and the appointment and AI summary appear at the moment they would in
the real product. It is deliberately not wired to the live API — an
unauthenticated LLM endpoint on a public page is an abuse vector and a bill
waiting to happen.

**The orb never overlaps the copy.** Each section that should show it contains
an empty box:

```jsx
<div className="lp-stage" data-stage aria-hidden="true" />
```

`measureStages()` finds whichever box is most visible each frame; the camera
stays fixed and the *orb* moves into it, scaled to fit. Overlap becomes a pure
layout problem — move the box in CSS and the orb follows. Below 900px the box
moves above the copy via `order: -1` and the orb goes with it.

Verified at ten viewport sizes: on every desktop width the outermost particle
shell starts 30–50px *after* the copy column ends.

### three.js stays off the dashboard

The landing route is `lazy()`-loaded, so WebGL never enters the bundle a
signed-in user downloads:

```
index.js      224 kB   (71 kB gzip)   every visitor
Landing.js     20 kB   ( 7 kB gzip)   marketing page only
VoiceOrb.js   827 kB   (223 kB gzip)  marketing page only, after first paint
```

Note the `vite.config.js` comment: adding `manualChunks` for three actually
makes this *worse*, because Vite then emits a `<link modulepreload>` for it
from `index.html` and every dashboard user downloads it anyway.

---

## Stack

```
React 18 + Vite + React Router        client, no UI library
three + react-three-fiber             landing page only, lazy-loaded
Node + Express                        API
SQLite (better-sqlite3)               zero-config database
bcrypt + JWT                          auth
Web Speech API                        STT + TTS, free, no key
Groq (optional)                       Llama 3.3 70B + Whisper v3
Gemini (optional)                     alternative free tier
```

Total monthly cost: **$0**.

### Two databases, one set of route handlers

```
DATABASE_URL set    ->  Postgres   (Vercel / Neon / Supabase / anywhere)
DATABASE_URL unset  ->  SQLite     (local dev, zero setup)
```

`server/src/db/` is the only place that knows the difference. SQL is written
once with `?` placeholders and the Postgres driver rewrites them to `$1..$n`;
schema DDL is dialect-aware; timestamps are ISO-8601 strings in TEXT columns in
both, which removes `datetime('now')` vs `now()` from the picture entirely and
means the client never has to guess a timezone.

SQLite is an **optional** dependency, so a native build failure on a serverless
host cannot break a production deploy that never uses it.

The port is proven, not assumed — `npm run smoke:postgres` boots the real
Express app against an in-memory Postgres and runs the *same* 32-assertion
suite used for SQLite.

---

## Layout

```
server/src/
├── app.js                builds the express app (no listener)
├── index.js              local dev server
├── db/
│   ├── index.js          driver selection, migrations, credit transactions
│   ├── sqlite.js         better-sqlite3, wrapped async
│   ├── postgres.js       pg, pooled — works with any Postgres
│   └── schema.js         dialect-aware DDL
├── auth.js               bcrypt, JWT, route guards
├── seed.js               demo account with realistic call history
├── ai/
│   ├── index.js          provider selection + fallback wrapper
│   ├── mockBrain.js      offline receptionist state machine
│   ├── slots.js          natural-language name/time/service extraction
│   ├── groq.js           Llama 3.3 70B + Whisper
│   └── gemini.js         alternative free tier
└── routes/               auth, preferences, calls, appointments, billing

client/src/
├── api.js                fetch wrapper, 401 auto-logout, SSR-safe
├── auth.jsx              session context
├── voice/
│   ├── transport.js      CallTransport interface + BrowserTransport
│   ├── useVoiceAgent.js  the call state machine
│   └── voices.js         OS voice catalogue
├── three/
│   ├── VoiceOrb.jsx      the landing-page 3D scene
│   ├── noise.js          simplex noise GLSL
│   └── orbState.js       amplitude + stage-box store (outside React)
├── landing/
│   ├── DemoCall.jsx      playable scripted call
│   └── useDemoCall.js    speech synthesis + amplitude envelope
├── components/
│   ├── Chart.jsx         dependency-free SVG bar chart
│   ├── Skeleton.jsx      loading skeletons
│   ├── Shell.jsx         sidebar, mobile drawer, topbar
│   └── Icons.jsx         inline SVGs, no icon library
└── pages/                landing, auth, overview, live call, logs,
                          detail, appointments, preferences, billing

api/index.js              Vercel function entry (the Express app)
api/[...path].js          catch-all so nested /api paths reach it
vercel.json               build config + SPA fallback

scripts/smoke.mjs         32-assertion end-to-end test
scripts/smoke.postgres.mjs  the same suite, on Postgres
scripts/postgres.test.mjs   dialect + transaction semantics
scripts/echo.test.mjs       microphone echo rejection
```

---

## The echo loop, and how it's held shut

Worth reading before you touch the voice code, because the failure is
non-obvious.

`SpeechRecognition` opens its **own** microphone capture, separate from the
`getUserMedia` stream we request with `echoCancellation: true`. That constraint
does not apply to it. On laptop speakers the recogniser therefore hears the
assistant and transcribes her as the caller:

```
Vera:  "Good morning, Meridian Wellness Studio — this is Vera. How can I help?"
heard: "Good morning already in Wellness Studio this is Liam how can I help"
```

Two things made it worse than a stray word:

1. **`recognition.stop()` flushes.** It finalises and *delivers* whatever is in
   the buffer. Pausing the mic before speaking was therefore handing over
   everything captured so far. It is now `abort()`, which discards.
2. **Level-based barge-in was self-triggering.** The meter heard the assistant
   through the speakers, decided the caller was interrupting, cancelled the
   speech and reopened the microphone — mid-sentence, with the `speaking` flag
   already cleared, so the guard that should have caught the echo was off.

Four layers now hold it shut:

| Layer | Where |
|---|---|
| `listen()` refuses to start while `speaking` is true | `transport.js` |
| A 350ms settle window after speech, during which results are discarded | `transport.js` |
| Echo detection — token overlap against the last thing we said | `voice/echo.js` |
| Barge-in off by default, and measured against a learned echo floor | `transport.js` |

The echo test uses the real garbled transcript above as its first case:

```bash
npm test
```

```
PASS  reject  the exact bug reported          sim=0.77 -> echo
PASS  accept  caller reusing service words    sim=0.50 -> caller
13 passed, 0 failed
```

The guard deliberately fails **open** — utterances under four words are always
let through, because silently swallowing a real caller is far worse than
occasionally logging an echo. The timing guards catch what it misses.

---

## Testing

```bash
npm test                # echo rejection + Postgres dialect, no server needed
npm run smoke:postgres  # full journey against Postgres, self-hosting

npm run dev             # in one terminal
npm run smoke           # in another — same journey against SQLite
```

Drives a real signup → live call → booking → hangup → summary flow over HTTP.
No mocks. 32 assertions covering auth, validation, the conversation, billing
maths, and cross-user data isolation.

```
32 passed, 0 failed     smoke        (SQLite, over HTTP)
32 passed, 0 failed     smoke:postgres (Postgres, over HTTP)
19 passed, 0 failed     postgres dialect + transaction semantics
13 passed, 0 failed     echo rejection
```

The Postgres suite deliberately verifies rollback against **SQLite**, not
pg-mem: pg-mem emulates the dialect but not transaction isolation — it accepts
`BEGIN`/`ROLLBACK` and ignores them. Against Postgres it asserts the driver
*issues* the right statements; against SQLite it asserts the data actually
reverts. Testing rollback on an emulator that cannot roll back would have been
a green tick meaning nothing.

Every page is also render-checked server-side, and the orb's fit geometry is
verified numerically at ten viewport sizes rather than eyeballed.

The render test includes a **CSS lint for descendant selectors**. A rule like
`.lp-stat span { font-size: 0.84rem }` was matching the counter's own `<span>`
nested inside its `<b>`, so the figure got styled as its own caption and ran
into the label — "62%of calls to small businesses go unanswered". The stat band
now uses `.lp-stat > b` / `.lp-stat > span`, the counter renders the digits and
their unit as one text node, and the test fails on any `.lp-* span` or
`.lp-* b` descendant rule. It caught three more the moment it was written.

---

## Deploying

**[DEPLOY.md](./DEPLOY.md)** covers Vercel + Neon end to end, including the two
non-obvious things that will otherwise bite you: the API needs a catch-all
function file rather than a rewrite, and the root `package.json` must keep
`"type": "module"`.

Locally, one process can serve both halves:

```bash
npm run build && npm start
```

---

## Wiring Stripe

`server/src/routes/billing.js` simulates purchases. Real Stripe:

```js
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{ price: pack.stripePriceId, quantity: 1 }],
  success_url: `${origin}/app/billing?ok=1`,
  cancel_url: `${origin}/app/billing`,
  metadata: { userId: req.user.id, packId: pack.id },
})
res.json({ url: session.url })
```

Then credit the account from the `checkout.session.completed` webhook, never
from the success redirect — the redirect is client-controlled and forgeable.
Stripe has no monthly fee, and test mode is free forever.

---

## Known limits

Honest list, because clients ask.

- **Speech recognition is Chrome/Edge only.** Firefox and Safari fall back to
  the typed composer. Server-side Whisper (`POST /api/calls/transcribe`) is
  wired and works with a Groq key if you want to close that gap.
- **Barge-in is off by default.** See below — it is only safe with headphones
  or hardware echo cancellation. The *Interrupt* button always works.
- **Tokens live in localStorage.** Fine for a demo, readable by XSS. Production
  wants httpOnly + SameSite=Strict cookies with CSRF tokens.
- **Free-tier LLMs are not HIPAA-eligible.** None of these providers will sign
  a BAA, and Google's free tier permits training on your prompts. Synthetic
  data only.
- **No call recording audio.** Transcripts are stored, waveforms aren't. Add
  `MediaRecorder` on the client and Supabase Storage (1 GB free) if a client
  needs playback.
- **Rate limiting isn't implemented.** Add `express-rate-limit` on `/api/auth`
  before this faces the public internet.
- **The landing demo is scripted, not live.** By design — see above. The real
  thing is one click away behind signup.
- **WebGL is required for the landing orb.** It degrades to an empty stage box
  rather than breaking, and `prefers-reduced-motion` freezes all animation.
  Particle count and mesh detail drop on narrow or low-core devices.
