// First-party funnel events (L-10): a name and a random visitor id, sent
// with sendBeacon so a click never waits on it. Lost events are fine; no
// retries, no personal data, no third parties. Entry-safe: imports nothing.
import type { FunnelEvent } from '../challenge/events'

const VID_KEY = 'qp.vid'
const sent = new Set<string>()

/** This browser's random visitor id, created on first use. */
export function visitorId() {
  try {
    const stored = localStorage.getItem(VID_KEY)
    if (stored && /^[0-9a-f-]{36}$/.test(stored)) return stored
    const vid = crypto.randomUUID()
    localStorage.setItem(VID_KEY, vid)
    return vid
  } catch {
    return crypto.randomUUID()
  }
}

/** Sends one event, at most once per page load per name. */
export function track(name: FunnelEvent) {
  if (sent.has(name)) return
  sent.add(name)
  try {
    const body = JSON.stringify({ name, vid: visitorId() })
    if (navigator.sendBeacon?.('/api/events', body)) return
    void fetch('/api/events', { method: 'POST', body, keepalive: true }).catch(
      () => {},
    )
  } catch {
    // Analytics never breaks the page.
  }
}

/** Forgets which events were sent (tests: each test is a fresh page load). */
export function forgetTracked() {
  sent.clear()
}
