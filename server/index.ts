import { createCoachApp } from './app.js'

const port = Number(process.env.COACH_PORT) || 3001
const production =
  process.argv.includes('--production') || process.env.NODE_ENV === 'production'
const host = process.env.COACH_HOST || '127.0.0.1'
createCoachApp({ production }).listen(port, host, () =>
  console.log(`QuantPoker coach server listening on ${host}:${port}`),
)
