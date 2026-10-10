// Shared links are paths, which the Worker serves with a link preview:
// profiles (/u/<username>) and challenge scores (/c/<receipt>). The app
// itself routes by hash, so on load the path becomes #u/<username> or
// #c/<receipt> at the site root. Entry chunk: tiny, no imports.
const PROFILE_PATH = /^\/u\/([a-z0-9_]{3,20})\/?$/
const SHARE_PATH = /^\/c\/([0-9a-f]{32})\/?$/

export function profilePathToHash(location: Location = window.location) {
  const name = location.pathname.match(PROFILE_PATH)?.[1]
  const receipt = location.pathname.match(SHARE_PATH)?.[1]
  if (name) window.history.replaceState(null, '', `/#u/${name}`)
  else if (receipt) window.history.replaceState(null, '', `/#c/${receipt}`)
}
