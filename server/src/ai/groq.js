/**
 * Groq adapter — free tier, no credit card.
 * https://console.groq.com/keys
 *
 * Chosen over OpenAI/Gemini for the voice loop because latency is what makes a
 * spoken conversation feel human, and Groq's inference is the fastest free
 * option available. Everything here is plain fetch — no SDK, no lock-in.
 */

const BASE = 'https://api.groq.com/openai/v1'
const CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile'
const STT_MODEL = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo'

async function chat(messages, { json = false, maxTokens = 400 } = {}) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      temperature: json ? 0.2 : 0.6,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Groq ${res.status}: ${detail.slice(0, 300)}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

function systemPrompt({ prefs, business }) {
  const services = business.services?.length ? business.services.join(', ') : 'general enquiries'
  const toneGuide =
    {
      warm: 'Warm and personable. Short sentences. Sound like a friendly human receptionist.',
      formal: 'Polite and professional. Precise, never casual.',
      brisk: 'Efficient and direct. Get to the point quickly without being cold.',
    }[prefs.tone] || 'Warm and personable.'

  return `You are Vera, the phone receptionist for ${business.name || 'this business'}.

TONE: ${toneGuide}
OPENING HOURS: ${business.hours || 'Mon-Fri 9am-6pm'}
SERVICES: ${services}
${business.escalateTo ? `ESCALATE TO: ${business.escalateTo}` : ''}

RULES
- You are on a phone call. Never use lists, markdown, emoji or headings.
- Keep every reply under 40 words. One question at a time.
- To book, you need: the service, the caller's name, and a day and time.
- Never invent prices, addresses or availability you were not given. If you do
  not know, say you will have a colleague confirm.
- If the caller asks for a human, agree immediately and offer to take a message.
- Do not repeat information the caller has already given you.`
}

export async function groqReply({ history, prefs, business }) {
  const messages = [
    { role: 'system', content: systemPrompt({ prefs, business }) },
    ...history.map((t) => ({
      role: t.role === 'caller' ? 'user' : 'assistant',
      content: t.text,
    })),
  ]
  if (history.length === 0) {
    messages.push({ role: 'user', content: '(the caller has just connected — greet them)' })
  }

  const text = (await chat(messages, { maxTokens: 120 })).trim()
  return { text, intent: '', slots: {}, done: /\b(goodbye|take care|have a (lovely|good) day)\b/i.test(text) }
}

export async function groqSummary({ turns, business }) {
  const transcript = turns.map((t) => `${t.role === 'caller' ? 'Caller' : 'Vera'}: ${t.text}`).join('\n')

  const raw = await chat(
    [
      {
        role: 'system',
        content:
          'You summarise phone calls for a business CRM. Reply with JSON only, using exactly these keys: ' +
          '"summary" (2-3 sentences, past tense, factual), ' +
          '"intent" (one of: booking, hours, pricing, services, location, cancel, escalate, general), ' +
          '"sentiment" (positive, neutral or negative), ' +
          '"actionItems" (array of short imperative strings; empty array if none). ' +
          'Never invent detail that is not in the transcript.',
      },
      { role: 'user', content: `Business: ${business.name || 'Unknown'}\n\nTranscript:\n${transcript}` },
    ],
    { json: true, maxTokens: 400 },
  )

  const parsed = JSON.parse(raw)
  return {
    summary: String(parsed.summary || '').trim(),
    intent: String(parsed.intent || 'general'),
    sentiment: String(parsed.sentiment || 'neutral'),
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.map(String) : [],
  }
}

/** Whisper large-v3-turbo. Free tier allows ~2,000 requests/day. */
export async function groqTranscribe(buffer, filename = 'audio.webm') {
  const form = new FormData()
  form.append('file', new Blob([buffer]), filename)
  form.append('model', STT_MODEL)
  form.append('response_format', 'json')

  const res = await fetch(`${BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Groq STT ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return String(data.text || '').trim()
}
