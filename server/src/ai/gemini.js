/**
 * Google Gemini adapter — the fallback free tier if you would rather not use
 * Groq. Larger daily quota, slightly higher latency.
 * https://aistudio.google.com/apikey
 *
 * Note: Google's free tier permits training on your prompts. Do not send real
 * customer data through it.
 */

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

async function generate(systemInstruction, contents, { json = false } = {}) {
  const res = await fetch(`${BASE}/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        temperature: json ? 0.2 : 0.6,
        maxOutputTokens: json ? 400 : 120,
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

const persona = ({ prefs, business }) =>
  `You are Vera, phone receptionist for ${business.name || 'this business'}. ` +
  `Hours: ${business.hours || 'Mon-Fri 9am-6pm'}. ` +
  `Services: ${business.services?.join(', ') || 'general enquiries'}. ` +
  `Tone: ${prefs.tone || 'warm'}. You are on a phone call: no markdown, no lists, ` +
  `under 40 words, one question at a time. To book you need service, name, and day/time. ` +
  `Never invent prices or availability.`

export async function geminiReply({ history, prefs, business }) {
  const contents = history.map((t) => ({
    role: t.role === 'caller' ? 'user' : 'model',
    parts: [{ text: t.text }],
  }))
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: '(the caller has just connected — greet them)' }] })
  }
  const text = (await generate(persona({ prefs, business }), contents)).trim()
  return { text, intent: '', slots: {}, done: /\b(goodbye|take care|have a (lovely|good) day)\b/i.test(text) }
}

export async function geminiSummary({ turns, business }) {
  const transcript = turns.map((t) => `${t.role === 'caller' ? 'Caller' : 'Vera'}: ${t.text}`).join('\n')
  const raw = await generate(
    'You summarise phone calls for a CRM. Reply with JSON only using keys: summary (2-3 factual sentences), ' +
      'intent (booking|hours|pricing|services|location|cancel|escalate|general), ' +
      'sentiment (positive|neutral|negative), actionItems (array of short strings). Invent nothing.',
    [{ role: 'user', parts: [{ text: `Business: ${business.name}\n\n${transcript}` }] }],
    { json: true },
  )
  const parsed = JSON.parse(raw)
  return {
    summary: String(parsed.summary || '').trim(),
    intent: String(parsed.intent || 'general'),
    sentiment: String(parsed.sentiment || 'neutral'),
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.map(String) : [],
  }
}
