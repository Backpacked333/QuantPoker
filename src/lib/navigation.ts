import { useSyncExternalStore } from 'react'

const subscribe = (listener: () => void) => {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

export function useHash() {
  return useSyncExternalStore(subscribe, () => window.location.hash)
}

export function isLearningRoute(hash: string) {
  return hash === '#learn' || hash.startsWith('#learn/')
}
