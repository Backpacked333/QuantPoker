import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Crosshair, Move, RotateCcw, Box, Eye, Layers3 } from 'lucide-react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  decisionBreakEven,
  decisionEV,
  liveSurfaceValue,
  surfaceRiskRange,
} from '../lib/finance'
import type { Lens, SurfaceScenario } from '../lib/finance'
import { fitTerrainCamera } from '../lib/terrain-camera'

const terrainBounds = new THREE.Box3(
  new THREE.Vector3(-2.3, -1.25, -2.1),
  new THREE.Vector3(2.3, 1.1, 2.15),
)
const overviewDirection = new THREE.Vector3(4.5, 3.35, 4.8)

const labels: Record<Lens, [string, string, string]> = {
  equity: [
    'Showdown equity · 0–100%',
    'Capital at risk in chips',
    'Decision EV in chips',
  ],
  options: [
    'Showdown equity · 0–100%',
    'Cost in chips',
    'Choice value in chips',
  ],
  insurance: [
    'Loss probability · 0–100%',
    'Coverage · 0–100%',
    'Bad-state net in chips',
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

function clearAnnotations(group: THREE.Group) {
  for (const child of [...group.children]) {
    if (child instanceof THREE.Sprite) {
      child.material.map?.dispose()
      child.material.dispose()
    }
    group.remove(child)
  }
}
function addLabel(
  group: THREE.Group,
  text: string,
  x: number,
  y: number,
  z: number,
  heightTick = false,
) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return
  const font = '600 42px sans-serif'
  context.font = font
  canvas.width = Math.ceil(context.measureText(text).width) + 24
  canvas.height = 68
  context.font = font
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.strokeStyle = '#071610'
  context.lineWidth = 12
  context.strokeText(text, canvas.width / 2, 34)
  context.fillStyle = '#eaf5dc'
  context.fillText(text, canvas.width / 2, 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false }),
  )
  sprite.position.set(x, y, z)
  const fontHeight = 0.18
  sprite.scale.set(
    (canvas.width / 42) * fontHeight,
    (canvas.height / 42) * fontHeight,
    1,
  )
  sprite.userData.heightTick = heightTick
  sprite.renderOrder = 3
  group.add(sprite)
}

export default function Surface({
  lens,
  scenario,
  markerLabel,
  inspection,
  onInspect,
}: {
  lens: Lens
  scenario: SurfaceScenario
  markerLabel: string
  inspection: { x: number; z: number } | null
  onInspect: (point: { x: number; z: number } | null) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const reset = useRef<() => void>(() => {})
  const moveView = useRef<(direction: THREE.Vector3) => void>(() => {})
  const world = useRef<{
    renderer: THREE.WebGLRenderer
    camera: THREE.PerspectiveCamera
    geometry: THREE.PlaneGeometry
    mesh: THREE.Mesh
    marker: THREE.Mesh
    probe: THREE.Mesh
    annotations: THREE.Group
    frontier: THREE.Line
    slice: THREE.Line
    render: () => void
  } | null>(null)
  const markerY = useRef(0)
  const animation = useRef(0)
  const viewAnimation = useRef(0)
  const heightTargets = useRef<Float32Array | null>(null)
  const markerTargetY = useRef(0)
  const [unavailable, setUnavailable] = useState(false)
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
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.setClearColor(0x07140f, 1)
    container.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.set(4.5, 3.35, 4.8)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, -0.1, 0)
    controls.enablePan = false
    controls.enableZoom = true
    controls.minDistance = 3.8
    controls.maxDistance = 40
    controls.minPolarAngle = 0.01
    controls.maxPolarAngle = Math.PI / 2.05
    controls.update()
    const ambient = new THREE.HemisphereLight(0xc9ffe5, 0x07100d, 2.1)
    const key = new THREE.DirectionalLight(0xffefd0, 3.6)
    key.position.set(-3, 6, 4)
    const rim = new THREE.DirectionalLight(0x59bfff, 2.4)
    rim.position.set(4, 2, -5)
    scene.add(ambient, key, rim)
    const grid = new THREE.GridHelper(3.8, 12, 0x547567, 0x18352b)
    grid.position.y = -0.92
    scene.add(grid)
    const zero = new THREE.GridHelper(2.8, 1, 0xe7bd63, 0xe7bd63)
    const zeroMaterial = zero.material as THREE.Material
    zeroMaterial.transparent = true
    zeroMaterial.opacity = 0.38
    scene.add(zero)
    const geometry = new THREE.PlaneGeometry(2.8, 2.8, 48, 48)
    geometry.rotateX(-Math.PI / 2)
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(
        new Float32Array(geometry.attributes.position.count * 3),
        3,
      ),
    )
    const material = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.46,
      metalness: 0.08,
      clearcoat: 0.32,
      transparent: true,
      opacity: 0.94,
    })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0xd8f5e9,
      wireframe: true,
      transparent: true,
      opacity: 0.1,
    })
    scene.add(new THREE.Mesh(geometry, wireMaterial))
    const markerGeometry = new THREE.SphereGeometry(0.07, 20, 20)
    const markerMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x8cffc8,
      emissiveIntensity: 2,
    })
    const marker = new THREE.Mesh(markerGeometry, markerMaterial)
    scene.add(marker)
    const probeMaterial = new THREE.MeshStandardMaterial({
      color: 0xf3b6ff,
      emissive: 0x8d38b0,
      emissiveIntensity: 1.4,
    })
    const probe = new THREE.Mesh(markerGeometry, probeMaterial)
    probe.scale.setScalar(0.65)
    probe.visible = false
    scene.add(probe)
    const annotations = new THREE.Group()
    const frontier = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xffcb58,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      }),
    )
    const slice = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        depthTest: false,
        transparent: true,
        opacity: 0.92,
      }),
    )
    frontier.renderOrder = 2
    slice.renderOrder = 2
    scene.add(annotations, frontier, slice)
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
    const viewDirection = new THREE.Vector3()
    const render = () => {
      const topView =
        Math.abs(
          viewDirection.copy(camera.position).sub(controls.target).normalize()
            .y,
        ) > 0.9
      for (const label of annotations.children) {
        label.visible = !label.userData.heightTick || !topView
      }
      renderer.render(scene, camera)
    }
    controls.addEventListener('change', render)
    const motionPreference = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    )
    const moveCamera = (direction: THREE.Vector3) => {
      cancelAnimationFrame(viewAnimation.current)
      const position = fitTerrainCamera(
        camera,
        controls.target,
        direction,
        terrainBounds,
      )
      const from = camera.position.clone(),
        started = performance.now()
      const frame = (now: number) => {
        const progress = motionPreference.matches
          ? 1
          : Math.min(1, (now - started) / 520)
        const eased = 1 - Math.pow(1 - progress, 3)
        camera.position.lerpVectors(from, position, eased)
        camera.lookAt(controls.target)
        controls.update()
        render()
        if (progress < 1) viewAnimation.current = requestAnimationFrame(frame)
      }
      frame(started)
    }
    moveView.current = moveCamera
    reset.current = () => moveCamera(overviewDirection)
    controls.addEventListener('start', () =>
      cancelAnimationFrame(viewAnimation.current),
    )
    world.current = {
      renderer,
      camera,
      geometry,
      mesh,
      marker,
      probe,
      annotations,
      frontier,
      slice,
      render,
    }
    const resize = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect()
      renderer.setSize(width, height)
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
      cancelAnimationFrame(viewAnimation.current)
      camera.position.copy(
        fitTerrainCamera(
          camera,
          controls.target,
          camera.position.clone().sub(controls.target),
          terrainBounds,
        ),
      )
      controls.update()
      render()
    })
    resize.observe(container)
    const tick = (time: number) => {
      const reduceMotion = motionPreference.matches
      const positions = geometry.attributes.position
      const targets = heightTargets.current
      if (targets) {
        let moving = false
        for (let index = 0; index < positions.count; index++) {
          const next = reduceMotion
            ? targets[index]
            : positions.getY(index) +
              (targets[index] - positions.getY(index)) * 0.1
          moving ||= Math.abs(targets[index] - next) > 0.0002
          positions.setY(index, next)
        }
        if (moving || reduceMotion) {
          positions.needsUpdate = true
          geometry.computeVertexNormals()
        }
      }
      markerY.current +=
        (markerTargetY.current - markerY.current) * (reduceMotion ? 1 : 0.12)
      marker.position.y =
        markerY.current + (reduceMotion ? 0 : Math.sin(time / 260) * 0.025)
      if (!reduceMotion)
        halo.scale.setScalar(1 + (Math.sin(time / 330) + 1) * 0.16)
      render()
      if (!reduceMotion) animation.current = requestAnimationFrame(tick)
    }
    const motionChanged = () => {
      cancelAnimationFrame(animation.current)
      tick(performance.now())
    }
    motionPreference.addEventListener('change', motionChanged)
    tick(0)
    return () => {
      cancelAnimationFrame(animation.current)
      cancelAnimationFrame(viewAnimation.current)
      motionPreference.removeEventListener('change', motionChanged)
      resize.disconnect()
      controls.dispose()
      geometry.dispose()
      material.dispose()
      wireMaterial.dispose()
      markerGeometry.dispose()
      markerMaterial.dispose()
      probeMaterial.dispose()
      clearAnnotations(annotations)
      frontier.geometry.dispose()
      ;(frontier.material as THREE.Material).dispose()
      slice.geometry.dispose()
      ;(slice.material as THREE.Material).dispose()
      haloGeometry.dispose()
      haloMaterial.dispose()
      grid.geometry.dispose()
      ;(grid.material as THREE.Material).dispose()
      zero.geometry.dispose()
      zeroMaterial.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      world.current = null
    }
  }, [])

  useEffect(() => {
    const resources = world.current
    if (!resources) return
    const positions = resources.geometry.attributes.position
    const colors = resources.geometry.attributes.color
    const deepLoss = new THREE.Color('#8f2948'),
      loss = new THREE.Color('#ed714d'),
      neutral = new THREE.Color('#f0ce72'),
      high = new THREE.Color('#25c887')
    const heightScale = heightScaleFor(lens, scenario)
    const scale = lens === 'insurance' ? scenario.risk : scenario.pot
    const range = surfaceRiskRange(scenario)
    clearAnnotations(resources.annotations)
    for (const coordinate of [0, 0.5, 1]) {
      addLabel(
        resources.annotations,
        `${coordinate * 100}%`,
        coordinate * 2.8 - 1.4,
        -0.96,
        -1.65,
      )
      addLabel(
        resources.annotations,
        lens === 'insurance'
          ? `${coordinate * 100}%`
          : `${Math.round(coordinate * scenario.pot * range)}`,
        1.75,
        -0.96,
        coordinate * 2.8 - 1.4,
      )
    }
    for (const height of [-0.78, 0, 0.78])
      addLabel(
        resources.annotations,
        `${Math.round((height / heightScale) * scale)}`,
        -1.75,
        height,
        1.65,
        true,
      )
    const frontierPoints: THREE.Vector3[] = []
    for (
      let i = 0;
      i <= 64 && lens !== 'insurance' && scenario.action !== 'fold';
      i++
    ) {
      const z = i / 64
      const model = { ...scenario, risk: z * Math.max(1, scenario.pot) * range }
      const threshold = decisionBreakEven(model)
      if (Math.abs(decisionEV(model, threshold)) < 0.00001)
        frontierPoints.push(
          new THREE.Vector3(threshold * 2.8 - 1.4, 0.018, z * 2.8 - 1.4),
        )
    }
    resources.frontier.geometry.dispose()
    resources.frontier.geometry = new THREE.BufferGeometry().setFromPoints(
      frontierPoints,
    )
    resources.frontier.visible = frontierPoints.length > 1
    const currentZ =
      lens === 'insurance'
        ? scenario.coverageFraction
        : scenario.risk / (Math.max(1, scenario.pot) * range)
    resources.slice.geometry.dispose()
    resources.slice.geometry = new THREE.BufferGeometry().setFromPoints(
      Array.from(
        { length: 65 },
        (_, i) =>
          new THREE.Vector3(
            (i / 64) * 2.8 - 1.4,
            liveSurfaceValue(lens, i / 64, currentZ, scenario) * heightScale +
              0.015,
            currentZ * 2.8 - 1.4,
          ),
      ),
    )
    const targets = new Float32Array(positions.count)
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    for (let index = 0; index < positions.count; index++) {
      const x = (positions.getX(index) + 1.4) / 2.8
      const z = (positions.getZ(index) + 1.4) / 2.8
      const value = liveSurfaceValue(lens, x, z, scenario)
      targets[index] = value * heightScale
      if (reduceMotion || !heightTargets.current)
        positions.setY(index, targets[index])
      const color =
        value < 0
          ? deepLoss
              .clone()
              .lerp(loss, clamp(value + 1))
              .lerp(neutral, clamp(value + 0.08))
          : neutral.clone().lerp(high, clamp(value * 1.35))
      colors.setXYZ(index, color.r, color.g, color.b)
    }
    heightTargets.current = targets
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
    markerTargetY.current =
      liveSurfaceValue(lens, point.x, point.z, scenario) * heightScale + 0.06
    if (markerY.current === 0) markerY.current = markerTargetY.current
    resources.marker.position.set(
      point.x * 2.8 - 1.4,
      markerTargetY.current,
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
    onInspect({ x, z })
  }

  function cameraView(view: 'overview' | 'top' | 'edge') {
    moveView.current(
      view === 'top'
        ? new THREE.Vector3(0, 6, 0.12)
        : view === 'edge'
          ? new THREE.Vector3(5.5, 1.45, 0.2)
          : overviewDirection,
    )
  }

  return (
    <>
      <div className="surface-card terrain-stage">
        <div className="surface-toolbar">
          <span>
            <i className="tiny-dot" /> LIVE · ENGINE-PRICED TERRAIN
          </span>
          <button
            className="icon-button"
            onClick={() => reset.current()}
            aria-label="Reset graph view"
          >
            <RotateCcw size={14} />
          </button>
        </div>
        <div
          className="terrain-views"
          role="group"
          aria-label="3D camera views"
        >
          <button onClick={() => cameraView('overview')}>
            <Box size={12} /> Perspective
          </button>
          <button onClick={() => cameraView('top')}>
            <Layers3 size={12} /> Top view
          </button>
          <button onClick={() => cameraView('edge')}>
            <Eye size={12} /> Side view
          </button>
        </div>
        <div className="terrain-dimensions">
          <span>
            X · {lens === 'insurance' ? 'Loss probability' : 'Equity'}
          </span>
          <span>Z · {lens === 'insurance' ? 'Coverage' : 'Risk in chips'}</span>
          <span>
            Height ·{' '}
            {lens === 'insurance'
              ? 'Bad-state net'
              : lens === 'options'
                ? 'Choice value'
                : 'EV'}{' '}
            in chips
          </span>
        </div>
        <div
          className="surface-viewport"
          ref={host}
          role="img"
          aria-label={`${labels[lens][2]} surface, with ${labels[lens][0]} and ${labels[lens][1]}. Drag to rotate, click to inspect, or use the probability and exposure sliders below.`}
          onClick={inspect}
        />
        {inspection && (
          <div className="surface-inspector" aria-live="polite">
            <Crosshair size={12} />
            <span>
              {percent(inspection.x)} ·{' '}
              {lens === 'insurance'
                ? `${percent(inspection.z)} coverage`
                : `${Math.round(inspection.z * Math.max(1, scenario.pot) * riskRange)} at risk`}
            </span>
            <strong>
              {inspectedValue >= 0 ? '+' : ''}
              {(
                inspectedValue *
                (lens === 'insurance' ? scenario.risk : scenario.pot)
              ).toFixed(1)}{' '}
              chips
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
        <div className="terrain-key">
          {lens !== 'options' && (
            <span>
              <i className="loss" /> LOSS
            </span>
          )}
          <span>
            <i className="edge" />{' '}
            {lens === 'equity'
              ? 'ZERO EV'
              : lens === 'options'
                ? 'ZERO VALUE'
                : 'ZERO NET LOSS'}
          </span>
          {lens !== 'insurance' && (
            <span>
              <i className="gain" /> GAIN
            </span>
          )}
          <span>
            <i className="slice" />{' '}
            {lens === 'insurance' ? 'CURRENT COVERAGE' : 'CURRENT RISK SLICE'}
          </span>
        </div>
        <div className="surface-footer">
          <span>
            <i className="scenario-dot" /> {markerLabel}
          </span>
          <span>
            <Move size={12} /> Drag · zoom · click to inspect
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
          <button onClick={() => onInspect(null)} disabled={!inspection}>
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
              onInspect({ ...probePoint, x: Number(event.target.value) })
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
              onInspect({ ...probePoint, z: Number(event.target.value) })
            }
          />
        </label>
      </div>
    </>
  )
}
