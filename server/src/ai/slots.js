/**
 * Tiny natural-language slot extraction.
 *
 * This is what lets the offline receptionist feel like it's listening rather
 * than pattern-matching. When a real LLM is configured it does this job far
 * better, but the shapes it returns are identical, so everything downstream
 * (summaries, appointments, the UI) is provider-agnostic.
 */

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const NAME_PATTERNS = [
  /(?:my name is|the name is|the name's|my name's|this is|i am|i'm|it is|it's|its|call me)\s+([a-z][a-z'\-]+(?:\s+[a-z][a-z'\-]+)?)/i,
  /^([a-z][a-z'\-]+(?:\s+[a-z][a-z'\-]+)?)\s+(?:here|speaking)$/i,
]

const STOP_NAMES = new Set([
  'sorry', 'yes', 'no', 'okay', 'ok', 'hello', 'hi', 'hey', 'thanks', 'thank',
  'looking', 'calling', 'trying', 'wondering', 'just', 'good', 'fine', 'here',
  'not', 'sure', 'really', 'interested', 'available', 'free',
  // contractions and lead-ins that look like names to a naive matcher
  "it's", 'its', "that's", 'thats', "i'm", 'im', 'this', 'the', 'name', "name's",
  'my', 'call', 'speaking', 'yeah', 'yep', 'well', 'so', 'and', 'but',
])

export function extractName(text) {
  for (const re of NAME_PATTERNS) {
    const m = text.match(re)
    if (m) {
      const candidate = m[1].trim()
      const first = candidate.split(/\s+/)[0].toLowerCase()
      if (!STOP_NAMES.has(first)) return titleCase(candidate)
    }
  }
  return null
}

/**
 * Used when the assistant just asked "and your name?".
 *
 * Order matters: try the explicit patterns first, because "It's Daniel Okafor"
 * is a lead-in phrase, not a three-word name. Only fall back to treating the
 * whole utterance as the answer when no pattern matched.
 */
export function nameFromDirectAnswer(text) {
  const viaPattern = extractName(text)
  if (viaPattern) return viaPattern

  const cleaned = text.replace(/[.!?,]/g, '').trim()
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 3) return null
  if (words.some((w) => STOP_NAMES.has(w.toLowerCase()))) return null
  if (!words.every((w) => /^[a-z][a-z'\-]*$/i.test(w))) return null
  return titleCase(cleaned)
}

export function extractPhone(text) {
  const m = text.replace(/[^\d+]/g, ' ').match(/[+]?\d[\d ]{6,}\d/)
  return m ? m[0].replace(/\s+/g, '') : null
}

/**
 * Resolves relative and absolute times to an ISO string.
 * Handles: "tomorrow at 3", "monday morning", "next friday 2pm", "at 10:30am".
 */
export function extractWhen(text, now = new Date()) {
  const t = text.toLowerCase()
  let date = null
  let label = null

  if (/\btomorrow\b/.test(t)) {
    date = addDays(startOfDay(now), 1)
    label = 'tomorrow'
  } else if (/\btoday\b/.test(t)) {
    date = startOfDay(now)
    label = 'today'
  } else {
    for (let i = 0; i < DAYS.length; i++) {
      if (new RegExp(`\\b${DAYS[i]}\\b`).test(t)) {
        const base = startOfDay(now)
        let delta = (i - base.getDay() + 7) % 7
        if (delta === 0) delta = 7
        if (/\bnext\b/.test(t)) delta += (delta <= 7 ? 0 : 7)
        date = addDays(base, delta)
        label = titleCase(DAYS[i])
        break
      }
    }
  }

  const time = matchTime(t)
  if (!date && !time) return null
  if (!date) {
    // A bare time means the next occurrence of it.
    date = startOfDay(now)
    if (time.hour * 60 + time.minute <= now.getHours() * 60 + now.getMinutes()) {
      date = addDays(date, 1)
      label = 'tomorrow'
    } else {
      label = 'today'
    }
  }

  const hour = time ? time.hour : /morning/.test(t) ? 9 : /evening/.test(t) ? 17 : 14
  const minute = time ? time.minute : 0
  date.setHours(hour, minute, 0, 0)

  return { iso: date.toISOString(), label: `${label} at ${formatTime(hour, minute)}` }
}

function matchTime(t) {
  const m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|o'clock)?\b/)
  if (!m) return null
  let hour = parseInt(m[1], 10)
  const minute = m[2] ? parseInt(m[2], 10) : 0
  if (hour > 24 || minute > 59) return null
  const meridiem = m[3]
  if (meridiem === 'pm' && hour < 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0
  // "at 3" with no am/pm during business talk almost always means afternoon
  if (!meridiem && hour >= 1 && hour <= 7) hour += 12
  if (hour > 23) return null
  return { hour, minute }
}

export function extractService(text, services) {
  const t = text.toLowerCase()
  for (const s of services) {
    const words = s.toLowerCase().split(/[\s/&-]+/).filter((w) => w.length > 3)
    if (t.includes(s.toLowerCase()) || words.some((w) => t.includes(w))) return s
  }
  return null
}

/* ---------- helpers ---------- */

export const titleCase = (s) =>
  s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())

const startOfDay = (d) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function formatTime(hour, minute) {
  const suffix = hour >= 12 ? 'pm' : 'am'
  const h = hour % 12 === 0 ? 12 : hour % 12
  return minute ? `${h}:${String(minute).padStart(2, '0')}${suffix}` : `${h}${suffix}`
}

export function formatWhen(iso) {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}
