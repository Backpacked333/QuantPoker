import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Crosshair, Move, RotateCcw } from 'lucide-react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { liveSurfaceValue, surfaceRiskRange } from '../../lib/finance'
import type { Lens, SurfaceScenario } from '../../lib/finance'

const labels: Record<Lens, [string, string, string]> = {
  equity: [
    'Showdown equity · 0–100%',
    'Capital at risk / pot',
    'Decision EV / pot',
  ],
  options: [
    'Showdown equity · 0–100%',
    'Cost / pot · 0–100%',
    'Choice value / pot',
  ],
  insurance: [
    'Loss probability · 0–100%',
    'Coverage · 0–100%',
    'Bad-state net / exposure',
  ],
}
const clamp = (value: number) => Math.max(0, Math.min(1, value))
const percent = (value: number) => `${Math.round(value * 100)}%`
const heightScaleFor = (lens: Lens, scenario: SurfaceScenario) =>
  0.78 /
  Math.max(
    1,
    ...[0, 1].flatMap((x) =>
      [0, 1].map((z) => Math.abs(liveSurfaceValue(lens, x, z, scenario))),
    ),
  )

export default function Surface({
  lens,
  scenario,
  markerLabel,
}: {
  lens: Lens
  scenario: SurfaceScenario
  markerLabel: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const reset = useRef<() => void>(() => {})
  const world = useRef<{
    renderer: THREE.WebGLRenderer
    camera: THREE.PerspectiveCamera
    geometry: THREE.PlaneGeometry
    mesh: THREE.Mesh
    marker: THREE.Mesh
    probe: THREE.Mesh
    render: () => void
  } | null>(null)
  const markerY = useRef(0)
  const animation = useRef(0)
  const [unavailable, setUnavailable] = useState(false)
  const [inspection, setInspection] = useState<{
    x: number
    z: number
  } | null>(null)
  const riskRange = surfaceRiskRange(scenario)
  const probePoint =
    inspection ??
    (lens === 'insurance'
      ? { x: scenario.lossProbability, z: scenario.coverageFraction }
      : {
          x: scenario.equity,
          z: scenario.risk / (Math.max(1, scenario.pot) * riskRange),
        })
  const inspectedValue = liveSurfaceValue(
    lens,
    probePoint.x,
    probePoint.z,
    scenario,
  )

  useEffect(() => {
    if (!host.current) return
    const container = host.current
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setUnavailable(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0xf7f8f5, 0)
    container.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.set(4.3, 3.2, 4.8)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.12, 0)
    controls.enablePan = false
    controls.enableZoom = false
    controls.minPolarAngle = 0.2
    controls.maxPolarAngle = Math.PI / 2.05
    controls.update()
    controls.saveState()
    const grid = new THREE.GridHelper(3.4, 8, 0xbfcac3, 0xe1e6df)
    grid.position.y = -0.92
    scene.add(grid)
    const zero = new THREE.GridHelper(2.8, 1, 0x789080, 0x789080)
    const zeroMaterial = zero.material as THREE.Material
    zeroMaterial.transparent = true
    zeroMaterial.opacity = 0.22
    scene.add(zero)
    const geometry = new THREE.PlaneGeometry(2.8, 2.8, 32, 32)
    geometry.rotateX(-Math.PI / 2)
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(
        new Float32Array(geometry.attributes.position.count * 3),
        3,
      ),
    )
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.84,
    })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x38745f,
      wireframe: true,
      transparent: true,
      opacity: 0.16,
    })
    scene.add(new THREE.Mesh(geometry, wireMaterial))
    const markerGeometry = new THREE.SphereGeometry(0.07, 20, 20)
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x163f32 })
    const marker = new THREE.Mesh(markerGeometry, markerMaterial)
    scene.add(marker)
    const probeMaterial = new THREE.MeshBasicMaterial({ color: 0x72518f })
    const probe = new THREE.Mesh(markerGeometry, probeMaterial)
    probe.scale.setScalar(0.65)
    probe.visible = false
    scene.add(probe)
    const haloGeometry = new THREE.RingGeometry(0.1, 0.14, 24)
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0xa9db86,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    })
    const halo = new THREE.Mesh(haloGeometry, haloMaterial)
    halo.rotateX(-Math.PI / 2)
    marker.add(halo)
    const render = () => renderer.render(scene, camera)
    controls.addEventListener('change', render)
    reset.current = () => {
      controls.reset()
      render()
    }
    world.current = { renderer, camera, geometry, mesh, marker, probe, render }
    const resize = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect()
      renderer.setSize(width, height)
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
      render()
    })
    resize.observe(container)
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const tick = (time: number) => {
      marker.position.y =
        markerY.current + (reduceMotion ? 0 : Math.sin(time / 260) * 0.025)
      if (!reduceMotion)
        halo.scale.setScalar(1 + (Math.sin(time / 330) + 1) * 0.16)
      render()
      if (!reduceMotion) animation.current = requestAnimationFrame(tick)
    }
    tick(0)
    return () => {
      cancelAnimationFrame(animation.current)
      resize.disconnect()
      controls.dispose()
      geometry.dispose()
      material.dispose()
      wireMaterial.dispose()
      markerGeometry.dispose()
      markerMaterial.dispose()
      probeMaterial.dispose()
      haloGeometry.dispose()
      haloMaterial.dispose()
      grid.geometry.dispose()
      ;(grid.material as THREE.Material).dispose()
      zero.geometry.dispose()
      zeroMaterial.dispose()
      renderer.dispose()
      // Release the GL context now instead of waiting for garbage collection;
      // browsers cap live contexts and the lab remounts this view often.
      renderer.forceContextLoss()
      renderer.domElement.remove()
      world.current = null
    }
  }, [])

  useEffect(() => {
    const resources = world.current
    if (!resources) return
    const positions = resources.geometry.attributes.position
    const colors = resources.geometry.attributes.color
    const low = new THREE.Color('#bca7df'),
      neutral = new THREE.Color('#d8e1c8'),
      high = new THREE.Color('#48a989')
    const heightScale = heightScaleFor(lens, scenario)
    for (let index = 0; index < positions.count; index++) {
      const x = (positions.getX(index) + 1.4) / 2.8
      const z = (positions.getZ(index) + 1.4) / 2.8
      const value = liveSurfaceValue(lens, x, z, scenario)
      positions.setY(index, value * heightScale)
      const color =
        value < 0
          ? low.clone().lerp(neutral, clamp(value + 1))
          : neutral.clone().lerp(high, clamp(value))
      colors.setXYZ(index, color.r, color.g, color.b)
    }
    positions.needsUpdate = true
    colors.needsUpdate = true
    resources.geometry.computeVertexNormals()
    resources.geometry.computeBoundingSphere()
    const point =
      lens === 'insurance'
        ? { x: scenario.lossProbability, z: scenario.coverageFraction }
        : {
            x: scenario.equity,
            z: clamp(
              scenario.risk /
                (Math.max(1, scenario.pot) * surfaceRiskRange(scenario)),
            ),
          }
    markerY.current =
      liveSurfaceValue(lens, point.x, point.z, scenario) * heightScale + 0.06
    resources.marker.position.set(
      point.x * 2.8 - 1.4,
      markerY.current,
      point.z * 2.8 - 1.4,
    )
    resources.render()
  }, [lens, scenario])

  useEffect(() => {
    const resources = world.current
    if (!resources) return
    resources.probe.visible = inspection !== null
    if (inspection)
      resources.probe.position.set(
        inspection.x * 2.8 - 1.4,
        liveSurfaceValue(lens, inspection.x, inspection.z, scenario) *
          heightScaleFor(lens, scenario) +
          0.04,
        inspection.z * 2.8 - 1.4,
      )
    resources.render()
  }, [inspection, lens, scenario])

  function inspect(event: PointerEvent<HTMLDivElement>) {
    const resources = world.current
    if (!resources) return
    const rect = event.currentTarget.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, resources.camera)
    const hit = raycaster.intersectObject(resources.mesh)[0]
    if (!hit) return
    const x = clamp((hit.point.x + 1.4) / 2.8),
      z = clamp((hit.point.z + 1.4) / 2.8)
    setInspection({ x, z })
  }

  return (
    <>
      <div className="surface-card">
        <div className="surface-toolbar">
          <span>
            <i className="tiny-dot" /> 3D decision terrain
          </span>
          <button
            className="icon-btn"
            onClick={() => reset.current()}
            aria-label="Reset graph view"
          >
            <RotateCcw size={14} />
          </button>
        </div>
        <div
          className="surface-viewport"
          ref={host}
          role="img"
          aria-label={`${labels[lens][2]} surface, with ${labels[lens][0]} and ${labels[lens][1]}. Drag to rotate or point at the surface to inspect scenarios.`}
          onPointerMove={inspect}
          onPointerLeave={() => setInspection(null)}
        />
        {inspection && (
          <div className="surface-inspector" aria-live="polite">
            <Crosshair size={12} />
            <span>
              {percent(inspection.x)} ·{' '}
              {percent(
                inspection.z *
                  (lens === 'insurance' ? 1 : surfaceRiskRange(scenario)),
              )}
            </span>
            <strong>
              {inspectedValue >= 0 ? '+' : ''}
              {inspectedValue.toFixed(2)}×
            </strong>
          </div>
        )}
        {unavailable && (
          <div className="surface-fallback">
            3D isn’t available.
            <br />
            Live calculations still work.
          </div>
        )}
        <span className="axis axis-y">{labels[lens][2]}</span>
        <span className="axis axis-x">{labels[lens][0]}</span>
        <span className="axis axis-z">
          {lens === 'insurance'
            ? labels[lens][1]
            : `Capital / pot · 0–${surfaceRiskRange(scenario)}×`}
        </span>
        <div className="surface-footer">
          <span>
            <i className="scenario-dot" /> {markerLabel}
          </span>
          <span>
            <Move size={12} /> Drag + point to explore
          </span>
        </div>
      </div>
      <div className="surface-probe">
        <div>
          <span>
            <Crosshair size={13} />{' '}
            {inspection ? 'EXPLORING A SCENARIO' : 'LIVE SCENARIO READOUT'}
          </span>
          <strong>
            {(
              inspectedValue *
              (lens === 'insurance' ? scenario.risk : scenario.pot)
            ).toFixed(1)}{' '}
            chips
          </strong>
          <button onClick={() => setInspection(null)} disabled={!inspection}>
            Reset probe
          </button>
        </div>
        <label>
          {lens === 'insurance' ? 'Loss probability' : 'Showdown equity'}{' '}
          <b>{percent(probePoint.x)}</b>
          <input
            aria-label="Inspect probability"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={probePoint.x}
            onChange={(event) =>
              setInspection({ ...probePoint, x: Number(event.target.value) })
            }
          />
        </label>
        <label>
          {lens === 'insurance' ? 'Coverage' : 'Capital / pot'}{' '}
          <b>
            {lens === 'insurance'
              ? percent(probePoint.z)
              : `${(probePoint.z * riskRange).toFixed(2)}×`}
          </b>
          <input
            aria-label="Inspect exposure"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={probePoint.z}
            onChange={(event) =>
              setInspection({ ...probePoint, z: Number(event.target.value) })
            }
          />
        </label>
      </div>
    </>
  )
}
