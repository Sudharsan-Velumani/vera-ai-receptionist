import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { initOrbState } from '../three/orbState'
import DemoCall from '../landing/DemoCall'
import { Arrow, Mic, Sparkle, Calendar, Check, Clock, Phone, User } from '../components/Icons'

// three.js is ~830kB. It belongs on the marketing page and nowhere near the
// dashboard, so it loads in its own chunk after first paint.
const VoiceOrb = lazy(() => import('../three/VoiceOrb'))

/* ------------------------------------------------------------------ */

const STEPS = [
  { n: '01', title: 'It picks up', body: 'First ring, every time. Nights, weekends, and while you are already on another call.' },
  { n: '02', title: 'It has the conversation', body: 'Not a phone tree. Vera asks what they need, answers questions about your services and hours, and knows when to fetch a human.' },
  { n: '03', title: 'It books the job', body: 'Service, name, day and time — pulled out of ordinary speech and written straight into your calendar.' },
  { n: '04', title: 'It writes it up', body: 'A summary, the caller intent, sentiment, and a follow-up list. Waiting for you before you have finished your coffee.' },
]

const FEATURES = [
  { Icon: Mic, title: 'Sounds like a person', body: 'Choose the voice, accent, speed and tone. Callers interrupt her mid-sentence and she stops, the way a person would.' },
  { Icon: Calendar, title: 'Books while you work', body: '"Can I come in tomorrow at four?" becomes a confirmed appointment. No forms, no callbacks, no lost jobs.' },
  { Icon: Sparkle, title: 'Writes the notes', body: 'Every call summarised and classified. Search six months of conversations in one box.' },
  { Icon: Clock, title: 'Answers in under a second', body: 'Fast enough that callers do not talk over it. Latency is the difference between convincing and uncanny.' },
  { Icon: User, title: 'Knows when to escalate', body: 'Ask for a human and she agrees immediately, transfers, and takes a message if nobody picks up.' },
  { Icon: Check, title: 'Never invents anything', body: 'She will not guess a price or promise a slot she has not been given. She says a colleague will confirm.' },
]

const STATS = [
  { value: '62%', label: 'of calls to small businesses go unanswered' },
  { value: '85%', label: 'of those callers never call back' },
  { value: '0.8s', label: 'average time for Vera to answer' },
  { value: '24/7', label: 'including the hours you are asleep' },
]

const COMPARISON = [
  ['Answers every call', false, true, true],
  ['Available at 2am', false, false, true],
  ['Books appointments', false, true, true],
  ['Written summary of every call', false, false, true],
  ['Never has an off day', false, false, true],
  ['Monthly cost', 'Free', '£2,000+', 'Pennies per call'],
]

const PLANS = [
  { name: 'Starter', price: '$9', credits: '100 credits', per: '9¢ / min',
    features: ['All voices and accents', 'Transcripts and summaries', 'Appointment booking'] },
  { name: 'Growth', price: '$39', credits: '500 credits', per: '7.8¢ / min', popular: true,
    features: ['Everything in Starter', 'Call search and filters', 'Transcript export', 'Priority latency'] },
  { name: 'Scale', price: '$129', credits: '2,000 credits', per: '6.5¢ / min',
    features: ['Everything in Growth', 'Multiple receptionists', 'Team roles', 'API access'] },
]

const NAV = [['#demo', 'Demo'], ['#how', 'How it works'], ['#features', 'Features'], ['#pricing', 'Pricing']]

/* ------------------------------------------------------------------ */

function useReveal() {
  useEffect(() => {
    const nodes = document.querySelectorAll('[data-reveal]:not(.in)')
    if (!nodes.length) return
    if (!('IntersectionObserver' in window)) {
      nodes.forEach((n) => n.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
      }),
      { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
    )
    nodes.forEach((n) => io.observe(n))
    return () => io.disconnect()
  })
}

/**
 * Counts up on first view.
 *
 * The digits and their unit are one text node on purpose. Splitting them meant
 * a `.lp-stat span` descendant rule could reach the counter's own span and
 * style the figure like its own caption — which is how the stat band once
 * rendered as "62%of calls to small businesses go unanswered". The CSS uses
 * child combinators now, and this keeps the markup safe regardless.
 */
function Figure({ value }) {
  const ref = useRef(null)
  const [text, setText] = useState(value)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const match = /^([\d.]+)(.*)$/.exec(value)
    if (!match) return

    const target = parseFloat(match[1])
    const decimals = (match[1].split('.')[1] || '').length
    const suffix = match[2]

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setText(`0${decimals ? '.' + '0'.repeat(decimals) : ''}${suffix}`)

    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / 1500)
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
        setText(`${(target * eased).toFixed(decimals)}${suffix}`)
        if (t < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, { threshold: 0.5 })

    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [value])

  return <b ref={ref}>{text}</b>
}

/** Pointer tilt written straight to the node, so hover never re-renders React. */
function TiltCard({ children, delay = 0 }) {
  const ref = useRef(null)
  const raf = useRef(0)

  const onMove = (e) => {
    const el = ref.current
    if (!el) return
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width
      const y = (e.clientY - r.top) / r.height
      el.style.setProperty('--mx', `${x * 100}%`)
      el.style.setProperty('--my', `${y * 100}%`)
      el.style.transform = `perspective(900px) rotateY(${(x - 0.5) * 9}deg) rotateX(${(0.5 - y) * 9}deg) translateY(-4px)`
    })
  }
  const onLeave = () => {
    cancelAnimationFrame(raf.current)
    if (ref.current) ref.current.style.transform = ''
  }

  return (
    <article ref={ref} className="lp-feature" data-reveal style={{ '--d': `${delay}ms` }}
             onPointerMove={onMove} onPointerLeave={onLeave}>
      <span className="lp-feature__spot" />
      {children}
    </article>
  )
}

function Cell({ v }) {
  if (v === true) return <Check width={17} height={17} style={{ color: 'var(--green)' }} />
  if (v === false) return <span className="faint">—</span>
  return <span className="small">{v}</span>
}

/* ------------------------------------------------------------------ */

export default function Landing() {
  const [providers, setProviders] = useState(null)
  const [stuck, setStuck] = useState(false)
  const [menu, setMenu] = useState(false)
  useReveal()

  useEffect(() => {
    const teardown = initOrbState()
    api.health().then((h) => setProviders(h.providers)).catch(() => {})
    const onScroll = () => setStuck(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); teardown() }
  }, [])

  return (
    <div className="lp">
      <Suspense fallback={null}>
        <VoiceOrb />
      </Suspense>

      {/* ---------- nav ---------- */}
      <header className={`lp-nav ${stuck ? 'stuck' : ''}`}>
        <div className="lp-shell lp-nav__inner">
          <Link to="/" className="brand">
            <span className="brand__mark">V</span>
            Vera
          </Link>

          <nav className="lp-nav__links">
            {NAV.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>

          <div className="lp-nav__cta">
            <Link className="btn btn--ghost btn--sm" to="/login">Sign in</Link>
            <Link className="btn btn--sm" to="/signup">Get started</Link>
            <button className="lp-burger" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
              <span /><span />
            </button>
          </div>
        </div>

        {menu && (
          <nav className="lp-drawer">
            {NAV.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenu(false)}>{label}</a>
            ))}
            <Link className="btn" to="/signup" onClick={() => setMenu(false)}>Get started</Link>
            <Link className="btn btn--ghost" to="/login" onClick={() => setMenu(false)}>Sign in</Link>
          </nav>
        )}
      </header>

      {/* ---------- hero ---------- */}
      <section className="lp-hero">
        <div className="lp-glow" />
        <div className="lp-shell lp-hero__grid">
          <div className="lp-hero__copy">
            <span className="lp-pill" data-reveal>
              <i className="dot dot--pulse" style={{ color: 'var(--green)' }} />
              Answers in under a second
            </span>

            <h1 className="h1" data-reveal style={{ '--d': '70ms' }}>
              Never miss a call.
              <br />
              <span className="grad">Never take a message.</span>
            </h1>

            <p className="lede" style={{ marginTop: 20 }} data-reveal>
              Vera picks up on the first ring, holds a real conversation, books
              the appointment, and hands you a written summary before the caller
              has put their phone down.
            </p>

            <div className="lp-cta" data-reveal style={{ '--d': '230ms' }}>
              <Link className="btn btn--lg" to="/signup">
                Try it with your voice
                <Arrow width={18} height={18} />
              </Link>
              <a className="btn btn--ghost btn--lg" href="#demo">Hear a call first</a>
            </div>

            <ul className="lp-trust" data-reveal style={{ '--d': '310ms' }}>
              <li><Check width={15} height={15} />No card required</li>
              <li><Check width={15} height={15} />Works in your browser</li>
              <li><Check width={15} height={15} />Set up in two minutes</li>
            </ul>

            {providers && (
              <p className="small faint lp-provider" data-reveal style={{ '--d': '380ms' }}>
                {providers.llm === 'mock'
                  ? 'Currently running the offline brain — no API key configured.'
                  : `Live model connected: ${providers.llm}.`}
              </p>
            )}
          </div>

          {/* The orb is fitted into this empty box. Move it, and it follows. */}
          <div className="lp-stage" data-stage aria-hidden="true" />
        </div>

        <div className="lp-scroll" aria-hidden="true">
          <span className="lp-scroll__rail" />
          Scroll
        </div>
      </section>

      {/* ---------- demo ---------- */}
      <section className="lp-section lp-section--glass" id="demo">
        <div className="lp-shell" data-reveal>
          <DemoCall />
        </div>
      </section>

      {/* ---------- stat band ---------- */}
      <section className="lp-band">
        <div className="lp-shell lp-band__grid" data-reveal>
          {STATS.map((s) => (
            <div key={s.label} className="lp-stat">
              <Figure value={s.value} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- how ---------- */}
      <section className="lp-section" id="how">
        <div className="lp-shell">
          <div className="lp-head" data-reveal>
            <span className="eyebrow">How it works</span>
            <h2 className="h2">Four things happen, and none of them need you.</h2>
          </div>

          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <article key={s.n} className="lp-step" data-reveal style={{ '--d': `${i * 80}ms` }}>
                <span className="lp-step__n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- features ---------- */}
      <section className="lp-section lp-section--alt" id="features">
        <div className="lp-shell">
          <div className="lp-head" data-reveal>
            <span className="eyebrow">Features</span>
            <h2 className="h2">Built like a receptionist, not a chatbot.</h2>
          </div>

          <div className="lp-features">
            {FEATURES.map(({ Icon, title, body }, i) => (
              <TiltCard key={title} delay={i * 60}>
                <span className="lp-feature__icon"><Icon width={19} height={19} /></span>
                <h3 className="h3">{title}</h3>
                <p>{body}</p>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- comparison ---------- */}
      <section className="lp-section">
        <div className="lp-shell">
          <div className="lp-head" data-reveal>
            <span className="eyebrow">The alternatives</span>
            <h2 className="h2">Voicemail loses jobs. Staff cost money.</h2>
          </div>

          <div className="lp-compare" data-reveal>
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Voicemail</th>
                  <th>Receptionist</th>
                  <th className="on">Vera</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([label, a, b, c]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td><Cell v={a} /></td>
                    <td><Cell v={b} /></td>
                    <td className="on"><Cell v={c} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ---------- pricing ---------- */}
      <section className="lp-section lp-section--alt" id="pricing">
        <div className="lp-shell">
          <div className="lp-head center" data-reveal>
            <span className="eyebrow">Pricing</span>
            <h2 className="h2">Pay for minutes, not seats.</h2>
            <p className="lede" style={{ marginInline: 'auto', marginTop: 14 }}>
              One credit is one minute of call time. No subscription, no per-user fee.
            </p>
          </div>

          <div className="lp-pricing">
            {PLANS.map((p, i) => (
              <article key={p.name} className={`lp-plan ${p.popular ? 'on' : ''}`} data-reveal style={{ '--d': `${i * 80}ms` }}>
                {p.popular && <span className="lp-plan__badge">Most popular</span>}
                <h3 className="h3">{p.name}</h3>
                <div className="lp-plan__price">{p.price}</div>
                <div className="small dim">{p.credits} · {p.per}</div>
                <ul className="lp-plan__list">
                  {p.features.map((f) => <li key={f}><Check width={15} height={15} />{f}</li>)}
                </ul>
                <Link className={`btn btn--block ${p.popular ? '' : 'btn--ghost'}`} to="/signup">Get started</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- final cta ---------- */}
      <section className="lp-section">
        <div className="lp-shell">
          <div className="lp-final" data-reveal>
            <Phone width={26} height={26} style={{ color: 'var(--accent)', margin: '0 auto 18px' }} />
            <h2 className="h2">Hear how you sound to a customer.</h2>
            <p className="lede" style={{ marginTop: 14 }}>
              Sign up, pick a voice, and talk to your own receptionist in about
              two minutes. No card, no sales call.
            </p>
            <div className="lp-cta" style={{ justifyContent: 'center', marginTop: 30 }}>
              <Link className="btn btn--lg" to="/signup">
                Get started free
                <Arrow width={18} height={18} />
              </Link>
              <Link className="btn btn--ghost btn--lg" to="/login">Sign in</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="lp-foot">
        <div className="lp-shell lp-foot__inner">
          <div className="brand">
            <span className="brand__mark">V</span>
            Vera
          </div>
          <p className="small faint">
            A full-stack demo build. Voice, transcripts and summaries run on free-tier
            infrastructure.
          </p>
          <div className="lp-foot__links">
            {NAV.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
            <Link to="/login">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
