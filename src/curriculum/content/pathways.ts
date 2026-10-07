import atlas from './atlas-kit.json'
import type { PathwayId } from '../core/types'
export interface Pathway {
  id: PathwayId
  role: string
  title: string
  bridges: readonly string[]
  capstone: string
  capstoneAvailability: 'planned'
  conceptIds: readonly string[]
}
const rows: Omit<Pathway, 'conceptIds' | 'capstoneAvailability'>[] = [
  {
    id: 'inference-strategy',
    title: 'Inference and strategy',
    role: 'Forecaster / decision maker',
    bridges: [
      'Conditional probability',
      'Expectation',
      'Inference',
      'Later: optimization and coding',
    ],
    capstone:
      'Freeze an opponent-model hypothesis and evaluate on fresh situations.',
  },
  {
    id: 'risk-insurance-credit',
    title: 'Risk, insurance and credit',
    role: 'Insurer / capital manager',
    bridges: [
      'Cash-flow accounting',
      'Distributions',
      'Dependence',
      'Later: survival models',
    ],
    capstone:
      'Fund an insurer through common shocks, delays, and counterparty failure.',
  },
  {
    id: 'derivatives-hedging',
    title: 'Derivatives and hedging',
    role: 'Contract designer / hedger',
    bridges: ['Algebra', 'Trees', 'Later: calculus and stochastic processes'],
    capstone: 'Construct, price, hedge, and explain residual P&L.',
  },
  {
    id: 'markets-research',
    title: 'Markets and research',
    role: 'Dealer / researcher',
    bridges: [
      'Bayes',
      'Statistics',
      'Reproducible experiments',
      'Later: optimization',
    ],
    capstone:
      'Quote, execute, finance, and evaluate a synthetic claim strategy.',
  },
]
export const pathways: readonly Pathway[] = rows.map((r) => ({
  ...r,
  capstoneAvailability: 'planned',
  conceptIds: atlas.concepts
    .filter((c) => c.pathways.includes(r.id))
    .map((c) => c.id),
}))
