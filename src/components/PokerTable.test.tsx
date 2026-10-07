import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { act, guidedHand } from '../lib/poker'
import type { Game } from '../lib/poker'
import { PokerTable } from './PokerTable'
import { PlayingCard } from './PlayingCard'

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
      onRaise={noop}
      onAction={noop}
      onDeal={noop}
      onPause={noop}
      onSettings={noop}
      onHistory={noop}
      sound={false}
      onSound={noop}
      focus={false}
      onFocus={noop}
      onUnlock={noop}
      shortcuts={false}
      dialogOpen={false}
    />,
  )
}

describe('poker room presentation', () => {
  it('keeps the guided game and accessible action sizing intact', () => {
    const html = render(guidedHand())
    expect(html).toContain('GUIDED OPENING')
    expect(html).toContain('Call 40')
    expect(html).toContain('Raise to 100')
    expect(html).toContain('100 additional chips')
    expect(html).toContain('aria-label="Community cards"')
    expect(html).toContain('aria-label="Raise total"')
    expect(html.match(/Hidden opponent card/g)).toHaveLength(2)
    expect(html).not.toContain('9 of hearts')
  })
  it('does not reveal folded opponent cards, and offers the next hand', () => {
    const html = render(act(guidedHand(), { type: 'fold' }))
    expect(html.match(/Hidden opponent card/g)).toHaveLength(2)
    expect(html).toContain('Atlas takes the pot.')
    expect(html).toContain('Deal next hand')
    expect(html).not.toContain('Call 40')
  })
  it('labels card faces and marks winning cards without removing their text equivalents', () => {
    const html = renderToStaticMarkup(
      <PlayingCard card={{ rank: 13, suit: 's' }} highlight delay={90} />,
    )
    expect(html).toContain('aria-label="K of spades"')
    expect(html).toContain('winning-card')
    expect(html).toContain('court-art')
    expect(html).toContain('--deal-delay:90ms')
  })
  it('keeps controls disabled during animation, including the next-hand button', () => {
    const html = render(act(guidedHand(), { type: 'fold' }), true)
    expect(html).toContain('<button disabled="">Deal next hand')
  })
})
