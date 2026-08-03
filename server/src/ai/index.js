import { mockReply, mockSummary } from './mockBrain.js'
import { groqReply, groqSummary, groqTranscribe } from './groq.js'
import { geminiReply, geminiSummary } from './gemini.js'

/**
 * Provider selection.
 *
 * Everything degrades instead of failing. No key at all is a supported,
 * fully-working configuration — not an error state — which is what lets the
 * project be cloned and demoed with zero setup.
 */
export function providers() {
  const hasGroq = !!process.env.GROQ_API_KEY
  const hasGemini = !!process.env.GEMINI_API_KEY
  return {
    llm: hasGroq ? 'groq' : hasGemini ? 'gemini' : 'mock',
    stt: hasGroq ? 'groq-whisper' : 'browser',
    tts: 'browser',
    live: hasGroq || hasGemini,
  }
}

/** Wraps a live call so a provider outage can never break a demo. */
async function withFallback(primary, fallback, label) {
  try {
    return await primary()
  } catch (err) {
    console.warn(`[ai] ${label} provider failed, using offline brain:`, err.message)
    const result = await fallback()
    return { ...result, degraded: true }
  }
}

export async function generateReply({ history, prefs, business }) {
  const p = providers().llm
  const offline = () => mockReply({ history, prefs, business })

  if (p === 'groq') {
    return { ...(await withFallback(() => groqReply({ history, prefs, business }), offline, 'groq')), provider: 'groq' }
  }
  if (p === 'gemini') {
    return { ...(await withFallback(() => geminiReply({ history, prefs, business }), offline, 'gemini')), provider: 'gemini' }
  }
  return { ...offline(), provider: 'mock' }
}

export async function generateSummary({ turns, business }) {
  const p = providers().llm
  const offline = () => mockSummary({ turns, business })

  if (p === 'groq') {
    return { ...(await withFallback(() => groqSummary({ turns, business }), offline, 'groq')), provider: 'groq' }
  }
  if (p === 'gemini') {
    return { ...(await withFallback(() => geminiSummary({ turns, business }), offline, 'gemini')), provider: 'gemini' }
  }
  return { ...offline(), provider: 'mock' }
}

export async function transcribe(buffer, filename) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('Server-side transcription needs GROQ_API_KEY. The browser recogniser is used instead.')
  }
  return groqTranscribe(buffer, filename)
}
