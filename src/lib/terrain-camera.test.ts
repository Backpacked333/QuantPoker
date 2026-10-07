import { describe, expect, it } from 'vitest'
import { Box3, PerspectiveCamera, Vector3 } from 'three'
import { fitTerrainCamera } from './terrain-camera'

describe('terrain camera framing', () => {
  const bounds = new Box3(
    new Vector3(-2.3, -1.25, -2.1),
    new Vector3(2.3, 1.1, 2.15),
  )
  for (const [width, height] of [
    [304, 295],
    [600, 335],
    [1000, 335],
    [280, 400],
  ]) {
    for (const direction of [
      new Vector3(4.5, 3.35, 4.8),
      new Vector3(0, 6, 0.12),
      new Vector3(5.5, 1.45, 0.2),
    ]) {
      it(`keeps the annotated bounds inside ${width}×${height} from ${direction.toArray()}`, () => {
        const camera = new PerspectiveCamera(34, width / height, 0.1, 100)
        const target = new Vector3(0, -0.1, 0)
        camera.position.copy(
          fitTerrainCamera(camera, target, direction, bounds),
        )
        camera.lookAt(target)
        camera.updateMatrixWorld()
        for (const x of [bounds.min.x, bounds.max.x]) {
          for (const y of [bounds.min.y, bounds.max.y]) {
            for (const z of [bounds.min.z, bounds.max.z]) {
              const projected = new Vector3(x, y, z).project(camera)
              expect(Math.abs(projected.x)).toBeLessThanOrEqual(0.881)
              expect(Math.abs(projected.y)).toBeLessThanOrEqual(0.881)
              expect(Math.abs(projected.z)).toBeLessThan(1)
            }
          }
        }
      })
    }
  }
})
