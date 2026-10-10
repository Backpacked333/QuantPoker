import { lazy, Suspense, useEffect } from 'react'
import { useHash } from './lib/navigation'
import Landing from './Landing'

const App = lazy(() => import('./App'))
const landingRoutes = new Set([
  '',
  '#home',
  '#landing-main',
  '#approach',
  '#inside',
  '#questions',
  '#experiment',
])

export default function Root() {
  const hash = useHash()
  const landing = landingRoutes.has(hash)

  useEffect(() => {
    if (!landing) window.scrollTo({ top: 0, behavior: 'instant' })
  }, [landing])

  if (landing) return <Landing hash={hash} />

  return (
    <Suspense
      fallback={
        <main className="page" aria-busy="true">
          <p role="status">Opening QuantPoker…</p>
        </main>
      }
    >
      <App />
    </Suspense>
  )
}
