import {
  extractName, nameFromDirectAnswer, extractPhone, extractWhen, extractService,
  formatWhen,
} from './slots.js'

/**
 * The offline receptionist.
 *
 * A slot-filling state machine that runs with no API key, no network and no
 * cost. It exists so the product is demoable on any laptop — including one
 * with no internet in a client's meeting room.
 *
 * It returns exactly the same shape as the Groq brain, so nothing downstream
 * knows or cares which one answered.
 */

const INTENTS = [
  { id: 'booking',   re: /\b(book|appointment|schedule|reserve|slot|availability|come in|fit me in)\b/i },
  { id: 'hours',     re: /\b(open|hours|close|closing|opening|what time|when are you)\b/i },
  { id: 'pricing',   re: /\b(price|pricing|cost|how much|charge|rate|quote)\b/i },
  { id: 'services',  re: /\b(services|do you (do|offer|have)|what can you|treatments)\b/i },
  { id: 'location',  re: /\b(where|address|located|location|directions|parking)\b/i },
  { id: 'escalate',  re: /\b(human|person|manager|someone else|real (person|agent)|speak to)\b/i },
  { id: 'cancel',    re: /\b(cancel|reschedule|move my|change my appointment)\b/i },
  { id: 'goodbye',   re: /\b(bye|goodbye|that'?s all|nothing else|thank you,? bye|see you)\b/i },
]

const detectIntent = (text) => INTENTS.find((i) => i.re.test(text))?.id || 'general'

/** Rebuilds what we know from the whole conversation, not just the last line. */
function gatherSlots(history, services, now) {
  const slots = { name: null, when: null, service: null, phone: null }

  history.forEach((turn, i) => {
    if (turn.role !== 'caller') return
    const prevAssistant = [...history.slice(0, i)].reverse().find((t) => t.role === 'assistant')
    const wasAskedName = prevAssistant && /name/i.test(prevAssistant.text)

    slots.name = slots.name || (wasAskedName ? nameFromDirectAnswer(turn.text) : extractName(turn.text))
    slots.phone = slots.phone || extractPhone(turn.text)
    slots.service = slots.service || extractService(turn.text, services)
    const when = extractWhen(turn.text, now)
    if (when) slots.when = when
  })

  return slots
}

export function mockReply({ history = [], prefs = {}, business = {}, now = new Date() }) {
  const services = business.services?.length ? business.services : ['General enquiry']
  const who = business.name || 'the practice'
  const hours = business.hours || 'Mon-Fri 9am-6pm'
  const warm = prefs.tone !== 'formal'

  if (history.length === 0) {
    const greeting =
      prefs.greeting?.trim() ||
      (warm
        ? `Thanks for calling ${who}, this is Vera. How can I help you today?`
        : `Good day, you have reached ${who}. This is Vera speaking. How may I assist you?`)
    return { text: greeting, intent: 'greeting', slots: {}, done: false }
  }

  const last = history[history.length - 1]
  const text = last?.text || ''
  const intent = detectIntent(text)
  const slots = gatherSlots(history, services, now)
  const inBooking =
    intent === 'booking' ||
    history.some((t) => t.role === 'caller' && detectIntent(t.text) === 'booking')

  /* ---------- terminal + escalation ---------- */

  if (intent === 'goodbye') {
    return {
      text: slots.when
        ? `Perfect. You are all set${slots.name ? `, ${slots.name}` : ''} — we will see you ${slots.when.label}. Have a lovely day.`
        : 'Of course. Thanks for calling, and do reach out any time. Take care.',
      intent: 'goodbye', slots, done: true,
    }
  }

  if (intent === 'escalate') {
    const to = business.escalateTo || 'the team'
    return {
      text: `Absolutely — let me put you through to ${to}. One moment while I transfer you. If nobody picks up, I will take a message and make sure you get a call back today.`,
      intent: 'escalate', slots, done: false,
    }
  }

  /* ---------- booking flow: service -> name -> time -> confirm ---------- */

  if (inBooking) {
    if (!slots.service && services.length > 1) {
      return {
        text: `I can certainly get that booked. We offer ${listOut(services)}. Which of those did you have in mind?`,
        intent: 'booking', slots, done: false,
      }
    }
    if (!slots.name) {
      return {
        text: `Happy to help with that. Could I take your name, please?`,
        intent: 'booking', slots, done: false,
      }
    }
    if (!slots.when) {
      return {
        text: `Thanks, ${slots.name}. What day and time suits you? We are open ${hours}.`,
        intent: 'booking', slots, done: false,
      }
    }

    const confirmed = history.some(
      (t) => t.role === 'assistant' && /have you (down|booked)/i.test(t.text),
    )
    if (!confirmed) {
      return {
        text: `Lovely. I have you down for ${slots.service || 'an appointment'} ${slots.when.label}, under ${slots.name}. I will send a confirmation across. Is there anything else I can help with?`,
        intent: 'booking',
        slots,
        booking: {
          title: slots.service || 'Appointment',
          customerName: slots.name,
          startsAt: slots.when.iso,
          notes: slots.phone ? `Callback: ${slots.phone}` : '',
        },
        done: false,
      }
    }
    return {
      text: `You are all booked in for ${formatWhen(slots.when.iso)}. Anything else before I let you go?`,
      intent: 'booking', slots, done: false,
    }
  }

  /* ---------- FAQ ---------- */

  const answers = {
    hours: `We are open ${hours}. Would you like me to find you a slot?`,
    pricing: `It depends on what you need — we cover ${listOut(services)}. If you tell me which one, I can give you a proper figure and check availability.`,
    services: `We handle ${listOut(services)}. Is there one of those you are after?`,
    location: business.address
      ? `We are at ${business.address}. There is parking on site. Shall I book you in?`
      : `I can text you our address and directions. What is the best number for you?`,
    cancel: `No problem at all — I can move that for you. Could I take the name the appointment is under?`,
    general: `Of course. I can book appointments, check availability, answer questions about ${listOut(services)}, or pass you to a colleague. What would be most useful?`,
  }

  return { text: answers[intent] || answers.general, intent, slots, done: false }
}

/**
 * Builds a summary without a model, by reading the conversation back.
 * Deliberately conservative: it reports what was said, not what it guessed.
 */
export function mockSummary({ turns = [], business = {} }) {
  const caller = turns.filter((t) => t.role === 'caller')
  const services = business.services?.length ? business.services : []
  const slots = gatherSlots(turns, services, new Date())

  const intents = [...new Set(caller.map((t) => detectIntent(t.text)))].filter(
    (i) => i !== 'general' && i !== 'goodbye',
  )
  const primary = intents[0] || 'general'

  const parts = []
  parts.push(
    slots.name
      ? `${slots.name} called about ${labelFor(primary, slots)}.`
      : `Caller enquired about ${labelFor(primary, slots)}.`,
  )
  if (slots.when) parts.push(`An appointment was agreed for ${formatWhen(slots.when.iso)}.`)
  if (slots.phone) parts.push(`Callback number given: ${slots.phone}.`)
  if (intents.includes('escalate')) parts.push('The caller asked to be transferred to a person.')

  const actionItems = []
  if (slots.when) actionItems.push(`Confirm ${slots.service || 'appointment'} for ${formatWhen(slots.when.iso)}`)
  if (slots.phone) actionItems.push(`Save contact number ${slots.phone}`)
  if (intents.includes('pricing')) actionItems.push('Send written quote')
  if (intents.includes('escalate')) actionItems.push('Call the customer back personally')
  if (!actionItems.length) actionItems.push('No follow-up required')

  const negative = caller.some((t) => /\b(annoyed|angry|unhappy|terrible|awful|complain|frustrat)/i.test(t.text))
  const positive = caller.some((t) => /\b(thank|great|perfect|lovely|brilliant|appreciate)/i.test(t.text))

  return {
    summary: parts.join(' '),
    intent: primary,
    sentiment: negative ? 'negative' : positive ? 'positive' : 'neutral',
    actionItems,
  }
}

/* ---------- helpers ---------- */

const labelFor = (intent, slots) =>
  ({
    booking: slots.service ? `booking ${slots.service.toLowerCase()}` : 'making a booking',
    hours: 'opening hours',
    pricing: 'pricing',
    services: 'the services offered',
    location: 'the location',
    cancel: 'changing an existing appointment',
    escalate: 'speaking with a member of staff',
    general: 'a general enquiry',
  })[intent] || 'a general enquiry'

const listOut = (items) =>
  items.length <= 1
    ? items[0] || 'a range of services'
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
