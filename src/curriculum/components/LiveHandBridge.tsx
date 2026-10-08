import { ArrowLeft } from 'lucide-react'

export type LiveHand = {
  number: number
  cards: string
  board: string
  pot: number
  call: number
  equity: number | null
  finished: boolean
  heroTurn: boolean
}

export function LiveHandBridge({ hand }: { hand: LiveHand }) {
  const canCall = !hand.finished && hand.heroTurn && hand.call > 0
  return (
    <section className="live-hand-bridge" aria-label="Your table connection">
      <div>
        <span className="eyebrow">
          {hand.finished ? 'YOUR COMPLETED HAND' : 'YOUR HAND IS PAUSED'}
        </span>
        <h2>Keep the lesson connected to hand {hand.number}.</h2>
        <p>
          Your cards: <strong>{hand.cards}</strong> · Board: {hand.board}
        </p>
      </div>
      <div className="hand-bridge-metrics">
        <span>
          {hand.finished ? 'Final pot' : 'Pot'}{' '}
          <strong>{hand.pot.toLocaleString()} chips</strong>
        </span>
        {!hand.finished && (
          <span>
            Estimated equity{' '}
            <strong>
              {hand.equity === null
                ? 'Calculating…'
                : `${(hand.equity * 100).toFixed(1)}%`}
            </strong>
          </span>
        )}
        {canCall && (
          <>
            <span>
              Call cost <strong>{hand.call.toLocaleString()} chips</strong>
            </span>
            <span>
              Break-even equity{' '}
              <strong>
                {((hand.call / (hand.pot + hand.call)) * 100).toFixed(1)}%
              </strong>
            </span>
          </>
        )}
      </div>
      <p>
        {hand.finished
          ? 'Return to review the finance lens or deal the next hand.'
          : canCall
            ? 'Compare estimated equity with the price to continue. This shortcut assumes no later betting or rake; it is not a solver recommendation.'
            : hand.heroTurn
              ? 'There is no bet to call. Explore the models, then return to check or bet.'
              : 'Atlas is paused too. Return to the table to let the hand continue.'}{' '}
        Lab sliders below are independent experiments, not changes to your hand.
      </p>
      <a className="button secondary" href="#table">
        <ArrowLeft size={15} /> Return to this hand
      </a>
    </section>
  )
}
