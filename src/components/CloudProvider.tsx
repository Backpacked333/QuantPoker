import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { CloudStore } from '../lib/cloud-store'
import { CloudContext, useCloud } from '../lib/cloud-context'
import { supabase } from '../lib/supabase'
import App from '../App'

export function SessionApp() {
  const cloud = useCloud()
  return <App key={cloud?.state.scope ?? 'guest'} />
}

export function CloudProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new CloudStore(supabase))
  const state = useSyncExternalStore(store.subscribe, store.snapshot)
  useEffect(() => store.start(), [store])
  return (
    <CloudContext.Provider value={{ store, state }}>
      {children}
    </CloudContext.Provider>
  )
}
