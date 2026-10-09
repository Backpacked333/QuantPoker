// Sign-in providers redirect back to the bare origin with ?code=…, which knows
// nothing about hash routes. Before leaving, the online chunk records where
// to come back to; on return this restores that route so the online chunk
// loads and finishes the sign-in. It lives in the entry chunk, so it must stay
// tiny and import nothing from src/net.
const KEY = 'qp.afterAuth'

export function rememberAuthReturn(hash: string) {
  try {
    sessionStorage.setItem(KEY, hash)
  } catch {
    // Storage blocked: the user lands on the table and can reopen the lobby.
  }
}

export function restoreAuthReturn(location: Location = window.location) {
  const params = new URLSearchParams(location.search)
  if (!params.has('code') && !params.has('error_description')) return
  let target: string | null = null
  try {
    target = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
  } catch {
    return
  }
  if (!target || !/^#[\w/-]+$/.test(target) || location.hash === target) return
  window.history.replaceState(
    null,
    '',
    `${location.pathname}${location.search}${target}`,
  )
}
