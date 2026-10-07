import { useEffect, useRef, useState } from 'react'
import { RotateCcw, Move } from 'lucide-react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { surfaceValue } from '../lib/finance'
import type { Lens } from '../lib/finance'

const labels = {
  equity: ['Win probability · 0–100%', 'Call / pot · 0–2×', 'EV / pot'],
  options: [
    'Asset price · 0–200',
    'Strike · 0–160',
    'Profit / 70 · premium 10',
  ],
  insurance: ['Loss · 0–200', 'Coverage · 0–200', 'Net / 100 · premium 20%'],
}

export default function Surface({
  lens,
  point,
}: {
  lens: Lens
  point: { x: number; z: number } | null
}) {
  const host = useRef<HTMLDivElement>(null)
  const reset = useRef<() => void>(() => {})
  const marker = useRef<THREE.Mesh | null>(null)
  const draw = useRef<() => void>(() => {})
  const [unavailable, setUnavailable] = useState(false)

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
    setUnavailable(false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0xf7f8f5, 0)
    container.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.set(4.3, 3.2, 4.8)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.15, 0)
    controls.enablePan = false
    controls.enableZoom = false
    controls.minPolarAngle = 0.2
    controls.maxPolarAngle = Math.PI / 2.05
    controls.update()
    controls.saveState()
    reset.current = () => {
      controls.reset()
      render()
    }
    const grid = new THREE.GridHelper(3.4, 8, 0xbfcac3, 0xe1e6df)
    grid.position.y = -0.92
    scene.add(grid)
    const geometry = new THREE.PlaneGeometry(2.8, 2.8, 28, 28)
    geometry.rotateX(-Math.PI / 2)
    const positions = geometry.attributes.position
    const colors: number[] = []
    const bottom = new THREE.Color('#b8a5dc')
    const top = new THREE.Color('#57ad8f')
    for (let i = 0; i < positions.count; i++) {
      const x = (positions.getX(i) + 1.4) / 2.8
      const z = (positions.getZ(i) + 1.4) / 2.8
      const value = surfaceValue(lens, x, z)
      const y = value * 0.48
      positions.setY(i, y)
      const color = bottom
        .clone()
        .lerp(top, Math.max(0, Math.min(1, (value + 2) / 4)))
      colors.push(color.r, color.g, color.b)
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.76,
    })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    const wireGeometry = new THREE.WireframeGeometry(geometry)
    const wireMaterial = new THREE.LineBasicMaterial({
      color: 0x458977,
      transparent: true,
      opacity: 0.2,
    })
    scene.add(new THREE.LineSegments(wireGeometry, wireMaterial))
    const markerGeometry = new THREE.SphereGeometry(0.055, 16, 16)
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x244f3d })
    marker.current = new THREE.Mesh(markerGeometry, markerMaterial)
    scene.add(marker.current)
    const render = () => renderer.render(scene, camera)
    draw.current = render
    controls.addEventListener('change', render)
    const resize = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect()
      renderer.setSize(width, height)
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
      render()
    })
    resize.observe(container)
    render()
    return () => {
      resize.disconnect()
      controls.dispose()
      geometry.dispose()
      material.dispose()
      wireGeometry.dispose()
      wireMaterial.dispose()
      markerGeometry.dispose()
      markerMaterial.dispose()
      marker.current = null
      draw.current = () => {}
      grid.geometry.dispose()
      ;(grid.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [lens])

  const x = point?.x,
    z = point?.z
  useEffect(() => {
    if (!marker.current) return
    marker.current.visible = x !== undefined && z !== undefined
    if (x !== undefined && z !== undefined)
      marker.current.position.set(
        x * 2.8 - 1.4,
        surfaceValue(lens, x, z) * 0.48 + 0.05,
        z * 2.8 - 1.4,
      )
    draw.current()
  }, [lens, x, z])

  return (
    <div className="surface-card">
      <div className="surface-toolbar">
        <span>
          <span className="tiny-dot" /> INTERACTIVE 3D MODEL
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
        className="surface-viewport"
        ref={host}
        role="img"
        aria-label={`${labels[lens][2]} surface, with ${labels[lens][0]} and ${labels[lens][1]}. The formula and exact values are provided below.`}
      />
      {unavailable && (
        <div className="surface-fallback">
          3D isn’t available in this browser.
          <br />
          The live calculations below still work.
        </div>
      )}
      <span className="axis axis-y">{labels[lens][2]}</span>
      <span className="axis axis-x">{labels[lens][0]}</span>
      <span className="axis axis-z">{labels[lens][1]}</span>
      <div className="surface-footer">
        <span>
          <i className="scenario-dot" /> Current scenario
        </span>
        <span>
          <Move size={12} /> Drag to explore
        </span>
      </div>
    </div>
  )
}
