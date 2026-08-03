import { looksLikeEcho } from './echo'

/**
 * CallTransport — the seam between "a conversation" and "how the audio got here".
 *
 * BrowserTransport is what ships: microphone in, Web Speech recognition,
 * speechSynthesis out. It costs nothing, needs no account, and a prospect can
 * use it one click after landing on the page.
 *
 * A PstnTransport (Twilio Media Streams over a websocket) implements the same
 * five methods and drops straight in — see README "Going to real phone
 * numbers". Nothing above this file knows which one is running.
 */

export class CallTransport {
  /** Acquire input. Resolves once audio is flowing. */
  async start() { throw new Error('not implemented') }
  /** cb(text, isFinal) for each caller utterance. */
  onTranscript(_cb) { throw new Error('not implemented') }
  /** cb(level 0..1) roughly every animation frame, for the visualiser. */
  onLevel(_cb) {}
  /** Render assistant speech. Resolves when playback finishes or is cut off. */
  async speak(_text, _opts) { throw new Error('not implemented') }
  /** Cut off playback immediately (barge-in). */
  stopSpeaking() {}
  /** Release the microphone and all listeners. */
  async stop() {}
}

const SpeechRecognition =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

export const speechSupport = {
  recognition: !!SpeechRecognition,
  synthesis: typeof window !== 'undefined' && 'speechSynthesis' in window,
}

export class BrowserTransport extends CallTransport {
  /**
   * @param bargeIn  Interrupt-on-speech. Off by default: SpeechRecognition
   *   opens its own capture without echo cancellation, so on laptop speakers
   *   the assistant's own voice trips the detector, cuts itself off, and gets
   *   transcribed as the caller. Only safe with headphones or hardware AEC.
   * @param settleMs How long after speaking to keep ignoring the microphone,
   *   so the tail of an utterance never lands in the transcript.
   */
  constructor({ language = 'en-US', bargeIn = false, settleMs = 350 } = {}) {
    super()
    this.language = language
    this.bargeIn = bargeIn
    this.settleMs = settleMs

    /** Everything captured before this timestamp is discarded. */
    this.suppressUntil = Infinity
    /** The last thing we said, for echo comparison. */
    this.lastSpoken = ''
    this.lastSpokenEndedAt = 0

    this.transcriptCb = null
    this.levelCb = null

    this.recognition = null
    this.stream = null
    this.audioCtx = null
    this.analyser = null
    this.rafId = 0

    this.speaking = false
    this.wantListening = false
    this.loudFrames = 0
    this.echoFloor = 0
    this.onBargeIn = null
  }

  async start() {
    // The mic stream is only used for the level meter and barge-in detection.
    // SpeechRecognition opens its own capture internally.
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      this._startMeter()
    } catch (err) {
      // Recognition can still work without our own stream in some browsers,
      // but without mic permission nothing will. Surface it plainly.
      throw new Error(
        err.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow it in your browser and try again.'
          : `Could not open the microphone: ${err.message}`,
      )
    }

    if (SpeechRecognition) {
      const rec = new SpeechRecognition()
      rec.lang = this.language
      rec.continuous = true
      rec.interimResults = true
      rec.maxAlternatives = 1

      rec.onresult = (event) => {
        // Guard 1 — never accept audio while the assistant is talking.
        if (this.speaking) return
        // Guard 2 — nor during the settle window just after she stops, which
        // is where the tail of her last sentence lands.
        if (performance.now() < this.suppressUntil) return

        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const text = result[0].transcript.trim()
          if (!text) continue

          // Guard 3 — if it reads like what we just said, it is the speakers.
          if (this._isEcho(text)) {
            if (result.isFinal) console.debug('[voice] dropped echo:', text)
            continue
          }

          if (result.isFinal) this.transcriptCb?.(text, true)
          else interim += text + ' '
        }
        if (interim.trim()) this.transcriptCb?.(interim.trim(), false)
      }

      rec.onerror = (e) => {
        // 'no-speech' and 'aborted' are routine during a pause; don't surface them.
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('[voice] recognition error:', e.error)
        }
      }

      // Chrome stops recognition on its own after a silence. Restart it as
      // long as the call is still open.
      rec.onend = () => {
        if (this.wantListening) {
          try { rec.start() } catch { /* already starting */ }
        }
      }

      this.recognition = rec
    }
  }

  listen() {
    // Refuse outright rather than racing the speech: this is the invariant
    // that makes the echo impossible rather than merely unlikely.
    if (this.speaking) return

    this.wantListening = true
    this.suppressUntil = performance.now() + this.settleMs
    if (!this.recognition) return
    try { this.recognition.start() } catch { /* already running */ }
  }

  pauseListening() {
    this.wantListening = false
    this.suppressUntil = Infinity
    // abort(), not stop(). stop() finalises and *delivers* whatever is in the
    // buffer — which is exactly how the assistant's own greeting ended up in
    // the transcript. abort() throws the buffer away.
    try { this.recognition?.abort() } catch { /* not running */ }
  }

  /** True when a transcript is probably our own voice, heard through speakers. */
  _isEcho(text) {
    if (!this.lastSpoken) return false
    // Only plausible for a few seconds after we stopped talking.
    if (performance.now() - this.lastSpokenEndedAt > 4000) return false
    return looksLikeEcho(text, this.lastSpoken)
  }

  onTranscript(cb) { this.transcriptCb = cb }
  onLevel(cb) { this.levelCb = cb }

  _startMeter() {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    this.audioCtx = new Ctx()
    const source = this.audioCtx.createMediaStreamSource(this.stream)
    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 512
    this.analyser.smoothingTimeConstant = 0.75
    source.connect(this.analyser)

    const buf = new Uint8Array(this.analyser.frequencyBinCount)
    const tick = () => {
      this.analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      const level = Math.min(1, Math.sqrt(sum / buf.length) * 3.2)
      this.levelCb?.(level)

      // Barge-in. Opt-in only, and measured against the echo floor rather
      // than an absolute threshold: while speaking we learn how loud our own
      // output sounds to this microphone, and only a clear margin above that
      // counts as the caller interrupting.
      if (this.speaking) {
        this.echoFloor = Math.max(this.echoFloor * 0.995, level * 0.9)
        if (this.bargeIn) {
          const margin = Math.max(0.22, this.echoFloor * 1.9)
          this.loudFrames = level > margin ? this.loudFrames + 1 : 0
          if (this.loudFrames > 18) {
            this.loudFrames = 0
            this.stopSpeaking()
            this.onBargeIn?.()
          }
        }
      } else {
        this.loudFrames = 0
        this.echoFloor *= 0.98
      }

      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  /**
   * Speak with the caller's chosen voice.
   *
   * speechSynthesis is free, offline, and exposes every voice installed on the
   * OS — typically 20-60 of them across accents and languages. That covers the
   * "voice, accent and tone" requirement without an Amazon Polly bill.
   */
  speak(text, { voiceName, rate = 1, pitch = 1, language = this.language } = {}) {
    if (!speechSupport.synthesis || !text) return Promise.resolve()

    return new Promise((resolve) => {
      window.speechSynthesis.cancel()

      const utter = new SpeechSynthesisUtterance(text)
      const voices = window.speechSynthesis.getVoices()
      const chosen =
        voices.find((v) => v.name === voiceName) ||
        voices.find((v) => v.lang === language) ||
        voices.find((v) => v.lang?.startsWith(language.slice(0, 2)))
      if (chosen) utter.voice = chosen
      utter.lang = chosen?.lang || language
      utter.rate = rate
      utter.pitch = pitch

      this.speaking = true
      this.suppressUntil = Infinity
      this.lastSpoken = text

      const finish = () => {
        if (!this.speaking) return
        this.speaking = false
        this.lastSpokenEndedAt = performance.now()
        this.suppressUntil = performance.now() + this.settleMs
        resolve()
      }
      utter.onend = finish
      utter.onerror = finish

      // Chrome drops long utterances if the tab is backgrounded; a watchdog
      // keeps the state machine from deadlocking on a missing onend.
      const watchdog = setTimeout(finish, Math.max(4000, text.length * 110))
      const clear = () => clearTimeout(watchdog)
      utter.addEventListener('end', clear)
      utter.addEventListener('error', clear)

      window.speechSynthesis.speak(utter)
    })
  }

  stopSpeaking() {
    if (!speechSupport.synthesis) return
    window.speechSynthesis.cancel()
    this.speaking = false
    this.lastSpokenEndedAt = performance.now()
    this.suppressUntil = performance.now() + this.settleMs
  }

  async stop() {
    this.wantListening = false
    this.stopSpeaking()
    cancelAnimationFrame(this.rafId)
    try { this.recognition?.abort() } catch { /* already stopped */ }
    this.recognition = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    if (this.audioCtx?.state !== 'closed') await this.audioCtx?.close().catch(() => {})
    this.audioCtx = null
    this.transcriptCb = null
    this.levelCb = null
  }
}
