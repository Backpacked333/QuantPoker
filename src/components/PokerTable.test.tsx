import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { act, guidedHand } from '../lib/poker'
import type { EquityAnalysis, Game } from '../lib/poker'
import { PokerTable } from './PokerTable'
import { PlayingCard } from './PlayingCard'

const analysis: EquityAnalysis = {
  equity: 0.732,
  win: 0.7,
  tie: 0.064,
  loss: 0.236,
  improve: null,
  nextCardVolatility: null,
  bestNextCards: [],
  worstNextCards: [],
}

function render(game: Game, busy = false) {
  const noop = () => {}
  return renderToStaticMarkup(
    <PokerTable
      game={game}
      frame={{ game, phase: 'idle', duration: 0 }}
      busy={busy}
      paused={false}
      yourTurn={!game.result && !busy}
      betAmount={100}
      analysis={analysis}
      onRaise={noop}
      onAction={noop}
      onDeal={noop}
      onPause={noop}
      onSettings={noop}
      onHistory={noop}
      sound={false}
      onSound={noop}
      analysisOpen={false}
      onToggleAnalysis={noop}
      onExplain={noop}
      onUnlock={noop}
      shortcuts={false}
      dialogOpen={false}
    />,
  )
}

describe('poker table', () => {
  it('puts the decision, its price and sizing in the action dock', () => {
    const html = render(guidedHand())
    expect(html).toContain('Guided hand')
    expect(html).toContain('Your move')
    expect(html).toContain('Call 40')
    expect(html).toContain('Raise to 100')
    expect(html).toContain('100 from your stack')
    expect(html).toMatch(/Price <strong>20%/)
    expect(html).toMatch(/Equity <strong>~73%/)
    expect(html).toMatch(/Call EV <strong>\+106/)
    expect(html).toContain('aria-label="Community cards"')
    expect(html).toContain('aria-label="Raise size"')
    expect(html).toContain('id="custom-bet-size" hidden=""')
    expect(html).toContain('aria-label="Your hole cards"')
    expect(html).toContain('aria-current="step"><i aria-hidden="true"></i>flop')
    expect(html).toContain('Bet 40')
    expect(html.match(/Hidden opponent card/g)).toHaveLength(2)
    expect(html).not.toContain('9 of hearts')
  })
  it('keeps folded opponent cards hidden and offers the next hand', () => {
    const html = render(act(guidedHand(), { type: 'fold' }))
    expect(html.match(/Hidden opponent card/g)).toHaveLength(2)
    expect(html).toContain('Atlas wins the pot')
    expect(html).toContain('Deal next hand')
    expect(html).not.toContain('Call 40')
  })
  it('disables the next-hand button while the table is animating', () => {
    const html = render(act(guidedHand(), { type: 'fold' }), true)
    expect(html).toMatch(/disabled=""[^>]*>Deal next hand/)
  })
  it('labels card faces and marks winning cards', () => {
    const html = renderToStaticMarkup(
      <PlayingCard card={{ rank: 13, suit: 's' }} highlight delay={90} />,
    )
    expect(html).toContain('aria-label="K of spades"')
    expect(html).toContain('pc-win')
    expect(html).toContain('--deal-delay:90ms')
  })
})
