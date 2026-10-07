import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DecisionChart } from './DecisionChart'
import type { SurfaceScenario } from '../lib/finance'

const scenario: SurfaceScenario = {
  action: 'continue',
  pot: 160,
  risk: 40,
  opponentCall: 0,
  foldProbability: 0,
  equity: 0.55,
  lossProbability: 0.4,
  coverageFraction: 0.75,
}
function render(z: number) {
  return renderToStaticMarkup(
    <DecisionChart
      lens="equity"
      scenario={scenario}
      probe={{ x: 0.5, z }}
      onProbe={() => {}}
      view="payoff"
      onView={() => {}}
      markerLabel="Your hand now"
      onAsk={() => {}}
    />,
  )
}
describe('payoff-slice labeling', () => {
  it('shows the hand marker when it belongs to the displayed exposure slice', () => {
    expect(render(0.25)).toContain('class="live-point"')
    expect(render(0.25)).not.toContain('off this slice')
  })
  it('removes the off-curve marker and labels both exposures', () => {
    const markup = render(1)
    expect(markup).not.toContain('class="live-point"')
    expect(markup).toContain('Your hand is off this slice')
    expect(markup).toContain('25% exposure')
    expect(markup).toContain('100% exposure')
  })
})
