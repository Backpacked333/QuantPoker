import { Box3, MathUtils, PerspectiveCamera, Vector3 } from 'three'

export function fitTerrainCamera(
  camera: PerspectiveCamera,
  target: Vector3,
  direction: Vector3,
  bounds: Box3,
) {
  const outward = direction.clone().normalize()
  const right = new Vector3().crossVectors(camera.up, outward).normalize()
  const up = new Vector3().crossVectors(outward, right).normalize()
  const tanY = Math.tan(MathUtils.degToRad(camera.fov / 2)) * 0.88
  const tanX = tanY * camera.aspect
  let distance = camera.near
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const offset = new Vector3(x, y, z).sub(target)
        const depth = offset.dot(outward)
        distance = Math.max(
          distance,
          Math.abs(offset.dot(right)) / tanX + depth,
          Math.abs(offset.dot(up)) / tanY + depth,
        )
      }
    }
  }
  return target.clone().addScaledVector(outward, distance)
}
