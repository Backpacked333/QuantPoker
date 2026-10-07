import { createContext, useContext } from 'react'
import type { CloudState, CloudStore } from './cloud-store'

export const CloudContext = createContext<{
  store: CloudStore
  state: CloudState
} | null>(null)
export const useCloud = () => useContext(CloudContext)
