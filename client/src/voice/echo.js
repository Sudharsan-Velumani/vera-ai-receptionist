/**
 * Echo rejection.
 *
 * The browser's SpeechRecognition opens its own microphone capture, separate
 * from the getUserMedia stream we request with `echoCancellation: true`. That
 * constraint therefore does not apply to it: without hardware AEC, the
 * recogniser hears the speakers and happily transcribes the assistant.
 *
 * Observed in the wild — Vera said:
 *   "Good morning, Meridian Wellness Studio — this is Vera. How can I help?"
 * and the recogniser returned:
 *   "Good morning already in Wellness Studio this is Liam how can I help"
 *
 * Note the mangling: proper nouns get mauled, common words survive. So an exact
 * comparison is useless and token overlap is the right measure.
 *
 * This is the last line of defence. The transport also refuses to listen while
 * speaking and drops anything captured inside a settle window — but on a laptop
 * with speakers, belt and braces is the honest engineering choice.
 */

const tokenise = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

/** Bag-of-words overlap: what fraction of `heard` also appears in `spoken`. */
export function similarity(heard, spoken) {
  const a = tokenise(heard)
  const b = tokenise(spoken)
  if (!a.length || !b.length) return 0

  const pool = new Map()
  for (const w of b) pool.set(w, (pool.get(w) || 0) + 1)

  let hits = 0
  for (const w of a) {
    const left = pool.get(w)
    if (left) {
      hits++
      pool.set(w, left - 1)
    }
  }
  return hits / a.length
}

/**
 * True when a transcript is probably the assistant's own voice coming back.
 *
 * Tuned to fail *open*: short utterances are always let through, because
 * silently swallowing a real caller is far worse than occasionally logging an
 * echo. The transport's timing guards catch what this deliberately misses.
 */
export function looksLikeEcho(heard, spoken, { threshold = 0.6, minWords = 4 } = {}) {
  if (!heard || !spoken) return false
  if (tokenise(heard).length < minWords) return false
  return similarity(heard, spoken) >= threshold
}
