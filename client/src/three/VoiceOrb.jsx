import { useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { orbState, measureStages } from './orbState'
import { SIMPLEX_3D } from './noise'

const damp = (a, b, lambda, dt) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-lambda * dt))

/** World-space extent of the whole rig at scale 1, used to fit it to a stage box. */
const RIG_SIZE = 6.4

/* ------------------------------------------------------------------
   The orb — an icosahedron displaced by simplex noise in the vertex
   shader. Amplitude tracks speech loudness, so it visibly "talks".
------------------------------------------------------------------ */

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uLevel;
  uniform float uSpeaking;

  varying vec3 vNormal;
  varying vec3 vView;
  varying float vDisp;

  ${SIMPLEX_3D}

  void main() {
    vec3 n = normalize(normal);
    float t = uTime * 0.32;

    // Two octaves: a slow rolling swell, plus fine chatter that only
    // appears while speaking. Silence looks calm, speech looks alive.
    float swell  = snoise(n * 1.35 + vec3(0.0, 0.0, t));
    float detail = snoise(n * 4.6 + vec3(t * 1.9, 0.0, 0.0)) * (0.18 + uSpeaking * 0.42);

    float amp = 0.10 + uLevel * 0.42;
    float disp = (swell + detail) * amp;

    vec3 pos = position + n * disp;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);

    vNormal = normalize(normalMatrix * n);
    vView = normalize(-mv.xyz);
    vDisp = disp;

    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uRim;
  uniform float uSpeaking;

  varying vec3 vNormal;
  varying vec3 vView;
  varying float vDisp;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vView);

    // Fresnel rim — the thing that makes it read as a glowing volume
    // rather than a lit ball.
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.3);

    float ramp = clamp(vDisp * 2.6 + 0.5, 0.0, 1.0);
    vec3 base = mix(uColorA, uColorB, ramp);
    base = mix(base, uRim, uSpeaking * 0.35);

    float core = pow(clamp(dot(N, V), 0.0, 1.0), 1.6) * 0.35;
    vec3 col = base * (0.55 + core) + uRim * fres * 1.5;

    gl_FragColor = vec4(col, 1.0);
  }
`

function Orb() {
  const mesh = useRef()
  const detail = orbState.lowPower ? 12 : 24

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uSpeaking: { value: 0 },
      uColorA: { value: new THREE.Color('#4338ca') },
      uColorB: { value: new THREE.Color('#818cf8') },
      uRim: { value: new THREE.Color('#22d3ee') },
    }),
    [],
  )

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    uniforms.uTime.value = orbState.reduced ? 0 : state.clock.elapsedTime
    uniforms.uLevel.value = damp(uniforms.uLevel.value, orbState.level, 12, dt)
    uniforms.uSpeaking.value = damp(uniforms.uSpeaking.value, orbState.speaking, 5, dt)

    if (mesh.current) {
      mesh.current.rotation.y += dt * 0.12
      mesh.current.rotation.x = damp(mesh.current.rotation.x, orbState.sy * -0.22, 3, dt)
    }
  })

  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1, detail]} />
      <shaderMaterial vertexShader={VERT} fragmentShader={FRAG} uniforms={uniforms} />
    </mesh>
  )
}

/** A counter-rotating wireframe cage, for depth. */
function Cage() {
  const mesh = useRef()
  useFrame((_, delta) => {
    if (!mesh.current) return
    mesh.current.rotation.y -= delta * 0.08
    mesh.current.rotation.z += delta * 0.03
    const s = 1.42 + orbState.level * 0.22
    mesh.current.scale.setScalar(damp(mesh.current.scale.x || 1.42, s, 8, Math.min(delta, 0.1)))
  })
  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1, 2]} />
      <meshBasicMaterial color="#6366f1" wireframe transparent opacity={0.16} depthWrite={false} />
    </mesh>
  )
}

/* ------------------------------------------------------------------
   Radial equalizer — 72 instanced bars that respond to loudness.
   This is the bit that makes it obviously a *voice* product.
------------------------------------------------------------------ */

const BARS = 72

function Equalizer() {
  const mesh = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const seeds = useMemo(() => Array.from({ length: BARS }, () => Math.random() * 100), [])
  const heights = useRef(new Float32Array(BARS).fill(0.05))

  useFrame((state, delta) => {
    if (!mesh.current) return
    const dt = Math.min(delta, 0.1)
    const t = orbState.reduced ? 0 : state.clock.elapsedTime
    const level = orbState.level

    for (let i = 0; i < BARS; i++) {
      const a = (i / BARS) * Math.PI * 2
      // Pseudo-spectrum: low bins swing harder than high ones, as real audio does.
      const bin = Math.abs(Math.sin(a * 3 + seeds[i]))
      const wobble = Math.sin(t * 3.4 + seeds[i]) * 0.5 + 0.5
      const target = 0.05 + level * (0.35 + bin * 0.85) * (0.45 + wobble * 0.55)

      heights.current[i] = damp(heights.current[i], target, 14, dt)
      const h = heights.current[i]
      const r = 1.85

      dummy.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
      dummy.rotation.set(0, -a, 0)
      dummy.scale.set(0.045, Math.max(0.05, h * 3.2), 0.045)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
    mesh.current.rotation.y += dt * 0.06
  })

  return (
    <instancedMesh ref={mesh} args={[null, null, BARS]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#22d3ee" transparent opacity={0.62} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------
   Ambient particles
------------------------------------------------------------------ */

function makeDot() {
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(c)
}

function Particles() {
  const points = useRef()
  const count = orbState.lowPower ? 500 : 1400
  const texture = useMemo(makeDot, [])

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = 2.2 + Math.random() * 1.9
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.cos(phi) * 0.8
      arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    return arr
  }, [count])

  useFrame((state, delta) => {
    if (!points.current) return
    const t = orbState.reduced ? 0 : state.clock.elapsedTime
    points.current.rotation.y = t * 0.045
    points.current.rotation.x = orbState.sy * 0.12
    const s = 1 + orbState.level * 0.14
    points.current.scale.setScalar(damp(points.current.scale.x || 1, s, 6, Math.min(delta, 0.1)))
  })

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        map={texture}
        size={0.042}
        sizeAttenuation
        transparent
        opacity={0.55}
        depthWrite={false}
        color="#a5b4fc"
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

/* ------------------------------------------------------------------
   Rig — fits the whole thing into the active [data-stage] box
------------------------------------------------------------------ */

function Rig({ group }) {
  const { camera, size } = useThree()
  const fit = useRef(0.4)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    measureStages()

    const g = group.current
    if (!g) return

    orbState.sx = damp(orbState.sx, orbState.reduced ? 0 : orbState.px, 3, dt)
    orbState.sy = damp(orbState.sy, orbState.reduced ? 0 : orbState.py, 3, dt)

    const st = orbState.stage
    const dist = camera.position.z
    const worldH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist
    const worldW = worldH * (size.width / size.height)

    const targetX = (st.x * worldW) / 2 + orbState.sx * 0.16
    const targetY = (st.y * worldH) / 2 - orbState.sy * 0.12
    const boxH = (st.h / size.height) * worldH
    const boxW = (st.w / size.width) * worldW

    g.position.x = damp(g.position.x, targetX, 3.6, dt)
    g.position.y = damp(g.position.y, targetY, 3.6, dt)
    fit.current = damp(fit.current, Math.min(boxH, boxW) / RIG_SIZE, 4, dt)
    g.scale.setScalar(fit.current)
    g.rotation.y = damp(g.rotation.y, orbState.sx * 0.25, 2.5, dt)

    g.visible = st.vis > 0.03
  })

  return null
}

/* ------------------------------------------------------------------ */

export default function VoiceOrb() {
  const group = useRef()

  return (
    <div className="orb-layer" aria-hidden="true">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 8], fov: 45, near: 0.1, far: 60 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.6} />
        <pointLight position={[4, 3, 5]} intensity={2} decay={0} color="#a5b4fc" />

        <group ref={group}>
          <Orb />
          <Cage />
          <Equalizer />
          <Particles />
        </group>

        <Rig group={group} />
      </Canvas>
    </div>
  )
}
