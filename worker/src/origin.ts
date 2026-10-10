// Which pages may call the Worker: sockets and the landing page's POSTs.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/
const LOCAL_PAGE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/

/**
 * A page may open a socket only to its own site. Browsers always send Origin
 * on a WebSocket handshake; a local server (wrangler dev) also takes pages
 * from localhost, such as Vite on :5173. Tokens are bearer subprotocols, not
 * cookies, so this is defence in depth against a hostile page, not the lock.
 */
export function originAllowed(request: Request) {
  const origin = request.headers.get('Origin')
  if (!origin) return false
  const self = new URL(request.url)
  if (origin === self.origin) return true
  return LOCAL_HOST.test(self.hostname) && LOCAL_PAGE.test(origin)
}
