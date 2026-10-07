import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { CloudProvider, SessionApp } from './components/CloudProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CloudProvider>
      <SessionApp />
    </CloudProvider>
  </StrictMode>,
)
