import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import { motionOff } from './env'
import { restoreAuthReturn } from './lib/authReturn'
import Root from './Root'
import { profilePathToHash } from './lib/profilePath'
import './styles.css'

if (motionOff) document.documentElement.classList.add('no-motion')
restoreAuthReturn()
profilePathToHash()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion={motionOff ? 'always' : 'user'}>
      <Root />
    </MotionConfig>
  </StrictMode>,
)
