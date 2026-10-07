import { cardKey, evaluate } from './poker'
import type { Card, Game, Player, Street } from './poker'

export type TablePhase =
  | 'idle'
  | 'deal'
  | 'bet'
  | 'street'
  | 'reveal'
  | 'settle'
export type TableFrame = {
  game: Game
  phase: TablePhase
  duration: number
  actor?: Player
  amount?: number
  revealOpponent?: boolean
}

const streetFor = (count: number): Street =>
  count === 0
    ? 'preflop'
    : count === 3
      ? 'flop'
      : count === 4
        ? 'turn'
        : 'river'

// Presentation snapshots never change the authoritative engine transition.
export function tableFrames(previous: Game, next: Game): TableFrame[] {
  if (previous.id !== next.id)
    return [{ game: next, phase: 'deal', duration: 850 }]
  const contribution =
    next.invested[previous.turn] - previous.invested[previous.turn]
  const bets: [number, number] = [...previous.bets]
  bets[previous.turn] += contribution
  const stacks: [number, number] = [
    previous.stacks[0] - (next.invested[0] - previous.invested[0]),
    previous.stacks[1] - (next.invested[1] - previous.invested[1]),
  ]
  const actionLog = next.log
    .slice(previous.log.length)
    .filter((entry) => /^(You|Atlas) (check|call|bet|raise|fold)/.test(entry))
  const pending: Game = {
    ...next,
    result: undefined,
    board: previous.board,
    street: previous.street,
    stacks,
    bets,
    pot: next.invested[0] + next.invested[1],
    log: [...previous.log, ...actionLog],
  }
  const frames: TableFrame[] = [
    {
      game:
        next.board.length === previous.board.length && !next.result
          ? next
          : pending,
      phase: 'bet',
      actor: previous.turn,
      amount: contribution,
      duration: 480,
    },
  ]
  let count = previous.board.length
  while (count < next.board.length) {
    count = count === 0 ? 3 : count + 1
    frames.push({
      game: {
        ...pending,
        board: next.board.slice(0, count),
        street: streetFor(count),
        bets: [0, 0],
      },
      phase: 'street',
      duration: 680,
    })
  }
  if (next.result?.showdown)
    frames.push({
      game: { ...pending, board: next.board, street: 'river', bets: [0, 0] },
      phase: 'reveal',
      revealOpponent: true,
      duration: 850,
    })
  if (next.result) frames.push({ game: next, phase: 'settle', duration: 800 })
  return frames
}

export function bestFiveKeys(cards: Card[]): Set<string> {
  if (cards.length < 5) return new Set()
  let best: Card[] = [],
    score = -1
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const candidate = [cards[a], cards[b], cards[c], cards[d], cards[e]]
            const value = evaluate(candidate).score
            if (value > score) {
              score = value
              best = candidate
            }
          }
  return new Set(best.map(cardKey))
}
