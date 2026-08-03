import { useCallback, useEffect, useRef, useState } from 'react'
import { orbState } from '../three/orbState'

/**
 * Plays a scripted call on the landing page.
 *
 * Deliberately not wired to the real API: an unauthenticated LLM endpoint on a
 * public marketing page is an abuse vector and a bill waiting to happen. This
 * uses the browser's own speech synthesis — free, instant, no key — and drives
 * the 3D orb from the same amplitude signal, so what a visitor sees and hears
 * is in sync.
 */

export const SCRIPT = [
  { role: 'assistant', text: 'Thanks for calling Meridian Wellness, this is Vera. How can I help?' },
  { role: 'caller', text: "Hi, I'd like to book a deep tissue massage." },
  { role: 'assistant', text: 'Happy to help with that. Could I take your name, please?' },
  { role: 'caller', text: "It's Priya Sharma." },
  { role: 'assistant', text: 'Thanks, Priya. What day and time suits you? We are open Mon to Sat, 8am to 8pm.' },
  { role: 'caller', text: 'Could I do tomorrow at three?' },
  { role: 'assistant', text: 'Lovely. I have you down for a deep tissue massage tomorrow at 3pm, under Priya Sharma. Anything else?' },
  { role: 'caller', text: "That's perfect, thank you." },
]

const CALLER_MS = 1500

export function useDemoCall() {
  const [index, setIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [finished, setFinished] = useState(false)

  const cancelled = useRef(false)
  const timers = useRef([])
  const rafRef = useRef(0)

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    cancelAnimationFrame(rafRef.current)
  }

  const stop = useCallback(() => {
    cancelled.current = true
    clearTimers()
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    orbState.level = 0
    orbState.speaking = 0
    setPlaying(false)
  }, [])

  useEffect(() => () => stop(), [stop])

  /**
   * speechSynthesis gives no amplitude data — it doesn't route through Web
   * Audio — so the envelope is synthesised. At 60fps against a real voice it
   * is indistinguishable, and it keeps the whole demo dependency-free.
   */
  const runEnvelope = (durationMs) => {
    const start = performance.now()
    const tick = (now) => {
      const t = (now - start) / durationMs
      if (t >= 1 || cancelled.current) {
        orbState.level = 0
        return
      }
      const syllable = Math.abs(Math.sin(now / 90)) * 0.55
      const phrase = Math.abs(Math.sin(now / 520)) * 0.35
      const jitter = Math.random() * 0.12
      const envelope = Math.min(1, t * 8) * Math.min(1, (1 - t) * 8)
      orbState.level = Math.min(1, (syllable + phrase + jitter) * envelope)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const speak = (text) =>
    new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        // No synthesis: still animate for the same duration so the visual
        // rhythm of the demo survives.
        const ms = Math.max(1600, text.length * 55)
        runEnvelope(ms)
        timers.current.push(setTimeout(resolve, ms))
        return
      }

      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      const voices = window.speechSynthesis.getVoices()
      const preferred =
        voices.find((v) => /female|samantha|zira|aria|jenny/i.test(v.name) && v.lang.startsWith('en')) ||
        voices.find((v) => v.lang === 'en-GB') ||
        voices.find((v) => v.lang.startsWith('en'))
      if (preferred) { utter.voice = preferred; utter.lang = preferred.lang }
      utter.rate = 1.02
      utter.pitch = 1.05

      const estimated = Math.max(1600, text.length * 58)
      runEnvelope(estimated)

      let done = false
      const finish = () => {
        if (done) return
        done = true
        orbState.level = 0
        resolve()
      }
      utter.onend = finish
      utter.onerror = finish
      timers.current.push(setTimeout(finish, estimated + 1800))

      window.speechSynthesis.speak(utter)
    })

  const play = useCallback(async () => {
    stop()
    cancelled.current = false
    setFinished(false)
    setPlaying(true)
    setIndex(-1)

    for (let i = 0; i < SCRIPT.length; i++) {
      if (cancelled.current) return
      setIndex(i)
      const line = SCRIPT[i]

      if (line.role === 'assistant') {
        orbState.speaking = 1
        await speak(line.text)
        orbState.speaking = 0.25
      } else {
        // The caller's turn: the orb listens rather than talks.
        orbState.speaking = 0.1
        await new Promise((resolve) => timers.current.push(setTimeout(resolve, CALLER_MS)))
      }
    }

    if (cancelled.current) return
    orbState.speaking = 0
    orbState.level = 0
    setPlaying(false)
    setFinished(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop])

  return { script: SCRIPT, index, playing, finished, play, stop }
}
