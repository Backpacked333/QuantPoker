// Shared profile links are paths (/u/<username>), which the Worker serves
// with a link preview; the app itself routes by hash. On load, the path
// becomes #u/<username> at the site root. Entry chunk: tiny, no imports.
const PROFILE_PATH = /^\/u\/([a-z0-9_]{3,20})\/?$/

export function profilePathToHash(location: Location = window.location) {
  const name = location.pathname.match(PROFILE_PATH)?.[1]
  if (!name) return
  window.history.replaceState(null, '', `/#u/${name}`)
}
