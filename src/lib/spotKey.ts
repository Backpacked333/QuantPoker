// What a hero's analysis depends on, as one string: the cache key of the
// trainer's analysis worker, and the seed of every grade (src/lib/grader.ts).
import type { AtlasStyle } from './atlas'
import { cardKey } from './poker'
import type { Game } from './poker'

/** Identifies everything the hero's analysis depends on. */
export function spotKey(game: Game, style: AtlasStyle) {
  const cards = game.cards[0].map(cardKey).join('')
  const board = game.board.map(cardKey).join('')
  const atlas = game.history
    .filter((h) => h.player === 1)
    .map((h) => `${h.boardCount}${h.action[0]}${h.amount}/${h.toCall}/${h.pot}`)
    .join(',')
  return `${style}|${cards}|${board}|${atlas}`
}
