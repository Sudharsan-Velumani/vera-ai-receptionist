/**
 * Shared, mutable scene state.
 *
 * The orb has to react to speech amplitude at 60fps. Routing that through
 * React state would re-render the whole landing page every frame, so these
 * values live outside React and are read inside useFrame.
 */
export const orbState = {
  /** 0..1 loudness — drives the noise amplitude and the equalizer bars */
  level: 0,
  /** 0..1 how "awake" the orb is; shifts its colour toward cyan */
  speaking: 0,
  /** normalised pointer, -1..1 */
  px: 0,
  py: 0,
  /** damped pointer */
  sx: 0,
  sy: 0,
  /** the layout box the orb should fill, in NDC + pixels */
  stage: { x: 0.42, y: 0, w: 460, h: 460, vis: 1 },
  reduced: false,
  lowPower: false,
}

export function initOrbState() {
  if (typeof window === 'undefined') return () => {}

  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  const setReduced = () => { orbState.reduced = mq.matches }
  setReduced()

  const setPower = () => {
    orbState.lowPower =
      window.innerWidth < 820 ||
      (navigator.hardwareConcurrency ? navigator.hardwareConcurrency <= 4 : false)
  }
  setPower()

  const onPointer = (e) => {
    orbState.px = (e.clientX / window.innerWidth) * 2 - 1
    orbState.py = (e.clientY / window.innerHeight) * 2 - 1
  }

  window.addEventListener('pointermove', onPointer, { passive: true })
  window.addEventListener('resize', setPower)
  mq.addEventListener?.('change', setReduced)

  return () => {
    window.removeEventListener('pointermove', onPointer)
    window.removeEventListener('resize', setPower)
    mq.removeEventListener?.('change', setReduced)
  }
}

/**
 * Finds the most visible [data-stage] box and records it.
 *
 * Same trick as the rest of the site: the orb never chooses its own position,
 * it fills whichever empty box the layout hands it. Overlapping the copy is
 * then impossible by construction — move the box in CSS and the orb follows.
 */
export function measureStages() {
  if (typeof document === 'undefined') return
  const nodes = document.querySelectorAll('[data-stage]')
  if (!nodes.length) return

  const vh = window.innerHeight
  const vw = window.innerWidth
  let best = null
  let bestVis = 0

  for (const el of nodes) {
    const r = el.getBoundingClientRect()
    if (r.height <= 0 || r.width <= 0) continue
    const overlap = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))
    const vis = overlap / Math.min(r.height, vh)
    if (vis > bestVis) { bestVis = vis; best = r }
  }

  orbState.stage.vis = bestVis
  if (best) {
    orbState.stage.x = ((best.left + best.width / 2) / vw) * 2 - 1
    orbState.stage.y = -(((best.top + best.height / 2) / vh) * 2 - 1)
    orbState.stage.w = best.width
    orbState.stage.h = best.height
  }
}
