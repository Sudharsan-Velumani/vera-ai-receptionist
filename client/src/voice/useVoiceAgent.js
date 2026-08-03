import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserTransport, speechSupport } from './transport'
import { api } from '../api'

/** Silence held after the assistant stops before the mic reopens. */
const SETTLE_MS = 350

/**
 * Orchestrates a whole call.
 *
 *   idle -> connecting -> speaking <-> listening -> ended
 *
 * The state machine is deliberately explicit: a voice UI that does not clearly
 * tell you whose turn it is feels broken, however good the model behind it is.
 */
export function useVoiceAgent({ preferences, onCallEnded, onCreditsChanged }) {
  const [status, setStatus] = useState('idle')
  const [turns, setTurns] = useState([])
  const [interim, setInterim] = useState('')
  const [level, setLevel] = useState(0)
  const [error, setError] = useState('')
  const [callId, setCallId] = useState(null)
  const [meta, setMeta] = useState({ provider: '', latencyMs: 0, degraded: false })
  const [appointment, setAppointment] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  const transportRef = useRef(null)
  const callIdRef = useRef(null)
  const startedAtRef = useRef(0)
  const busyRef = useRef(false)
  const endingRef = useRef(false)

  const voiceOpts = useCallback(
    () => ({
      voiceName: preferences?.voiceName || '',
      rate: preferences?.rate ?? 1,
      pitch: preferences?.pitch ?? 1,
      language: preferences?.language || 'en-US',
    }),
    [preferences],
  )

  /* ---------- ticking clock ---------- */
  useEffect(() => {
    if (status === 'idle' || status === 'ended') return
    const id = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 500)
    return () => clearInterval(id)
  }, [status])

  /* ---------- release the mic if the component unmounts mid-call ---------- */
  useEffect(() => () => { transportRef.current?.stop() }, [])

  const say = useCallback(
    async (text) => {
      const t = transportRef.current
      if (!t) return

      setStatus('speaking')
      t.pauseListening()
      await t.speak(text, voiceOpts())
      if (endingRef.current) return

      // Let the speakers go quiet before reopening the microphone. Without
      // this the tail of the utterance is transcribed as the caller.
      await new Promise((r) => setTimeout(r, SETTLE_MS))
      if (endingRef.current) return

      setStatus('listening')
      t.listen()
    },
    [voiceOpts],
  )

  /* ---------- send one caller utterance and speak the answer ---------- */
  const submit = useCallback(
    async (text) => {
      const clean = text.trim()
      if (!clean || busyRef.current || !callIdRef.current) return
      busyRef.current = true
      setInterim('')
      setTurns((prev) => [...prev, { role: 'caller', text: clean }])
      setStatus('thinking')
      transportRef.current?.pauseListening()

      try {
        const res = await api.sendTurn(callIdRef.current, clean)
        setMeta({ provider: res.provider, latencyMs: res.latencyMs, degraded: res.degraded })
        if (res.appointment) setAppointment(res.appointment)
        setTurns((prev) => [...prev, { role: 'assistant', text: res.reply }])
        await say(res.reply)
        if (res.shouldEnd) setTimeout(() => hangUp(), 900)
      } catch (err) {
        setError(err.message)
        setStatus('listening')
        transportRef.current?.listen()
      } finally {
        busyRef.current = false
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [say],
  )

  /* ---------- start ---------- */
  const startCall = useCallback(
    async (callerName = 'Web visitor') => {
      setError('')
      setTurns([])
      setInterim('')
      setAppointment(null)
      setElapsed(0)
      endingRef.current = false
      setStatus('connecting')

      const transport = new BrowserTransport({
        language: preferences?.language || 'en-US',
        // Off unless the user turns it on: without hardware echo cancellation
        // the assistant's own voice trips it. The Interrupt button always works.
        bargeIn: !!preferences?.bargeIn,
        settleMs: SETTLE_MS,
      })
      transportRef.current = transport

      transport.onTranscript((text, isFinal) => {
        if (isFinal) submit(text)
        else setInterim(text)
      })
      transport.onLevel(setLevel)
      transport.onBargeIn = () => {
        setStatus('listening')
        transport.listen()
      }

      try {
        await transport.start()
        const res = await api.startCall({ callerName })
        callIdRef.current = res.callId
        setCallId(res.callId)
        setMeta({ provider: res.provider, latencyMs: 0, degraded: res.degraded })
        startedAtRef.current = Date.now()
        setTurns([{ role: 'assistant', text: res.reply }])
        await say(res.reply)
      } catch (err) {
        setError(err.message)
        setStatus('idle')
        await transport.stop()
        transportRef.current = null
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preferences, say, submit],
  )

  /* ---------- hang up ---------- */
  const hangUp = useCallback(async () => {
    if (endingRef.current || !callIdRef.current) return
    endingRef.current = true

    const durationMs = Date.now() - startedAtRef.current
    setStatus('ended')
    await transportRef.current?.stop()
    transportRef.current = null

    try {
      const res = await api.endCall(callIdRef.current, durationMs)
      onCreditsChanged?.(res.creditsRemaining)
      onCallEnded?.(res.call)
    } catch (err) {
      setError(err.message)
    } finally {
      callIdRef.current = null
    }
  }, [onCallEnded, onCreditsChanged])

  const interrupt = useCallback(() => {
    const t = transportRef.current
    if (!t) return
    t.stopSpeaking()
    setStatus('listening')
    t.listen()
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setTurns([])
    setCallId(null)
    setAppointment(null)
    setError('')
    setElapsed(0)
  }, [])

  return {
    status, turns, interim, level, error, callId, meta, appointment, elapsed,
    startCall, hangUp, submit, interrupt, reset,
    supported: speechSupport,
  }
}
