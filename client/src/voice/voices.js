/**
 * The browser exposes every voice the operating system has installed —
 * usually 20-60, across accents and languages. That is the free replacement
 * for Amazon Polly's voice catalogue.
 *
 * Voices load asynchronously in Chrome, hence the subscribe helper.
 */

export function loadVoices() {
  if (!('speechSynthesis' in window)) return Promise.resolve([])

  const read = () => window.speechSynthesis.getVoices()
  const immediate = read()
  if (immediate.length) return Promise.resolve(immediate)

  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve(read())
    }
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true })
    setTimeout(done, 1200)
  })
}

const REGION_NAMES = {
  'en-US': 'American', 'en-GB': 'British', 'en-AU': 'Australian',
  'en-IN': 'Indian', 'en-IE': 'Irish', 'en-ZA': 'South African',
  'en-CA': 'Canadian', 'en-NZ': 'New Zealand',
}

export const accentLabel = (lang = '') =>
  REGION_NAMES[lang] || (lang.includes('-') ? lang.split('-')[1] : lang)

/** Groups voices by language so the picker isn't a wall of 60 options. */
export function groupVoices(voices) {
  const groups = new Map()
  for (const v of voices) {
    const key = (v.lang || 'other').slice(0, 2)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(v)
  }
  // English first — it's the demo language — then everything else alphabetically.
  return [...groups.entries()].sort(([a], [b]) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)))
}

export const TONES = [
  { id: 'warm', label: 'Warm', hint: 'Friendly and personable. Best for clinics, salons, hospitality.' },
  { id: 'formal', label: 'Formal', hint: 'Polite and precise. Best for legal, financial, medical.' },
  { id: 'brisk', label: 'Brisk', hint: 'Efficient and direct. Best for trades and high call volume.' },
]

export const LANGUAGES = [
  { id: 'en-US', label: 'English (US)' },
  { id: 'en-GB', label: 'English (UK)' },
  { id: 'en-AU', label: 'English (Australia)' },
  { id: 'en-IN', label: 'English (India)' },
  { id: 'es-ES', label: 'Spanish' },
  { id: 'fr-FR', label: 'French' },
  { id: 'de-DE', label: 'German' },
  { id: 'hi-IN', label: 'Hindi' },
]
