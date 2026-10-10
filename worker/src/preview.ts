// A shared link's page: index.html with its link-preview tags filled in by
// HTMLRewriter (setAttribute escapes every value), cached at the edge so
// repeated loads of one link cost one lookup a minute. Used by /u/<name>
// (profile.ts) and /c/<receipt> (share.ts).
import type { WorkerEnv } from './env'

/** The default share card, 1200 × 630 (public/og-default.png, scripts/og-card.ts). */
export const OG_IMAGE = '/og-default.png'
/** How long a preview is reused at the edge. */
export const PREVIEW_TTL_S = 60

export type Preview = {
  status: number
  title: string
  description: string
  type: 'website' | 'profile'
  image?: string
}
export type PreviewOptions = {
  assets?: Pick<Fetcher, 'fetch'>
  cache?: Cache
}

export async function previewPage(
  request: Request,
  env: WorkerEnv,
  { assets = env.ASSETS, cache = caches.default }: PreviewOptions,
  describe: () => Promise<Preview>,
): Promise<Response> {
  const url = new URL(request.url)
  const key = new Request(`${url.origin}${url.pathname}`)
  const hit = await cache.match(key)
  if (hit) return hit
  const [page, shown] = await Promise.all([
    assets.fetch(new Request(new URL('/', url))),
    describe(),
  ])
  const content = (value: string) => ({
    element(e: Element) {
      e.setAttribute('content', value)
    },
  })
  const rewritten = new HTMLRewriter()
    .on('title', {
      element(e) {
        e.setInnerContent(shown.title)
      },
    })
    .on('meta[name="description"]', content(shown.description))
    .on('meta[property="og:title"]', content(shown.title))
    .on('meta[property="og:description"]', content(shown.description))
    .on('meta[property="og:type"]', content(shown.type))
    .on('meta[property="og:url"]', content(`${url.origin}${url.pathname}`))
    .on(
      'meta[property="og:image"]',
      content(`${url.origin}${shown.image ?? OG_IMAGE}`),
    )
    .transform(page)
  const headers = new Headers(rewritten.headers)
  // The body is no longer index.html's: its validators and length are not ours.
  for (const stale of ['ETag', 'Last-Modified', 'Content-Length'])
    headers.delete(stale)
  headers.set('Cache-Control', `public, max-age=${PREVIEW_TTL_S}`)
  const response = new Response(rewritten.body, {
    status: shown.status,
    headers,
  })
  await cache.put(key, response.clone())
  return response
}
