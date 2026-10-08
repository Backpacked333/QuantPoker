import { categoryOf, drawTail, liveIds, score, toId, fromId } from './sim'
import { random as defaultRandom } from './random'
export type Suit = 's' | 'h' | 'd' | 'c'
export type Card = { rank: number; suit: Suit }
export type Player = 0 | 1
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; to: number }
export type HistoryEntry = {
  player: Player
  street: Exclude<Street, 'showdown'>
  boardCount: number
  action: Action['type']
  /** Raise target for raises, chips added for calls. */
  amount: number
  toCall: number
  pot: number
  canRaise: boolean
  note?: string
}
export type Game = {
  id: number
  guided: boolean
  dealer: Player
  street: Street
  turn: Player
  cards: [Card[], Card[]]
  board: Card[]
  deck: Card[]
  stacks: [number, number]
  bets: [number, number]
  invested: [number, number]
  acted: [boolean, boolean]
  pot: number
  lastRaise: number
  log: string[]
  history: HistoryEntry[]
  result?: {
    winner: Player | 'tie'
    text: string
    net: number
    showdown: boolean
  }
}
export type OutcomeProbabilities = {
  equity: number
  win: number
  tie: number
  loss: number
}
export type NextCardScenario = OutcomeProbabilities & { card: Card }
export type EquityAnalysis = OutcomeProbabilities & {
  improve: number | null
  nextCardVolatility: number | null
  bestNextCards: NextCardScenario[]
  worstNextCards: NextCardScenario[]
}

export const SUITS: Record<Suit, string> = {
  s: '♠',
  h: '♥',
  d: '♦',
  c: '♣',
}
export const rankName = (rank: number) =>
  ({ 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10' })[rank] ?? String(rank)
export const cardKey = (card: Card) => `${card.rank}${card.suit}`
export const cardLabel = (card: Card) =>
  `${rankName(card.rank)}${SUITS[card.suit]}`
export const other = (player: Player): Player => (player === 0 ? 1 : 0)

export function deck(): Card[] {
  return (['s', 'h', 'd', 'c'] as Suit[]).flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => ({ rank: i + 2, suit })),
  )
}

export function shuffle(cards: Card[], random = defaultRandom): Card[] {
  const copy = [...cards]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export const categories = [
  'High card',
  'One pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
]

export function evaluate(cards: Card[]): { score: number; name: string } {
  if (cards.length < 5 || cards.length > 7)
    throw new Error('Evaluate requires 5–7 cards')
  const value = score(cards.map(toId))
  return { score: value, name: categories[categoryOf(value)] }
}

function contribute(game: Game, player: Player, amount: number) {
  game.stacks[player] -= amount
  game.bets[player] += amount
  game.invested[player] += amount
  game.pot += amount
}

export function newHand(
  id = 1,
  stacks: [number, number] = [2000, 2000],
  dealer: Player = 0,
  random = defaultRandom,
): Game {
  if (stacks.some((s) => !Number.isInteger(s) || s <= 0))
    throw new Error('Both players need chips to start')
  const shuffled = shuffle(deck(), random)
  const game: Game = {
    id,
    guided: false,
    dealer,
    street: 'preflop',
    turn: dealer,
    cards: [shuffled.splice(0, 2), shuffled.splice(0, 2)],
    board: [],
    deck: shuffled,
    stacks: [...stacks],
    bets: [0, 0],
    invested: [0, 0],
    acted: [false, false],
    pot: 0,
    lastRaise: 20,
    log: ['A new hand. Blinds are 10 / 20.'],
    history: [],
  }
  const effective = Math.min(...stacks)
  contribute(game, dealer, Math.min(10, effective))
  contribute(game, other(dealer), Math.min(20, effective))
  if (game.stacks.some((s) => s === 0) && game.bets[0] === game.bets[1])
    runout(game)
  return game
}

export function guidedHand(): Game {
  const cards: [Card[], Card[]] = [
    [
      { rank: 14, suit: 's' },
      { rank: 11, suit: 's' },
    ],
    [
      { rank: 9, suit: 'h' },
      { rank: 9, suit: 'd' },
    ],
  ]
  const board: Card[] = [
    { rank: 13, suit: 's' },
    { rank: 12, suit: 's' },
    { rank: 7, suit: 'd' },
  ]
  const used = new Set([...cards.flat(), ...board].map(cardKey))
  return {
    id: 1,
    guided: true,
    dealer: 0,
    street: 'flop',
    turn: 0,
    cards,
    board,
    deck: shuffle(deck().filter((c) => !used.has(cardKey(c)))),
    stacks: [1940, 1900],
    bets: [0, 40],
    invested: [60, 100],
    acted: [false, true],
    pot: 160,
    lastRaise: 40,
    log: [
      'Guided hand: both players invested 60 before the flop.',
      'Atlas bets 40. Your decision.',
    ],
    history: [
      {
        player: 1,
        street: 'flop',
        boardCount: 3,
        action: 'raise',
        amount: 40,
        toCall: 0,
        pot: 120,
        canRaise: true,
        note: 'Bet 40 into 120. A one-third-pot bet that protects a medium-strength hand.',
      },
    ],
  }
}

export function legalActions(game: Game) {
  const player = game.turn
  const currentBet = Math.max(...game.bets)
  const toCall = Math.min(currentBet - game.bets[player], game.stacks[player])
  const maxRaiseTo = Math.min(
    game.bets[0] + game.stacks[0],
    game.bets[1] + game.stacks[1],
  )
  const minRaiseTo = Math.min(maxRaiseTo, currentBet + game.lastRaise)
  return {
    toCall,
    canCheck: toCall === 0,
    canRaise: game.street !== 'showdown' && maxRaiseTo > currentBet,
    minRaiseTo,
    maxRaiseTo,
  }
}

function settle(
  game: Game,
  winner: Player | 'tie',
  text: string,
  showdown: boolean,
) {
  const payout = winner === 'tie' ? Math.floor(game.pot / 2) : game.pot
  const heroPayout =
    winner === 0
      ? payout
      : winner === 'tie'
        ? payout + (game.dealer === 1 ? game.pot % 2 : 0)
        : 0
  if (winner === 'tie') {
    game.stacks[0] += payout
    game.stacks[1] += payout
    game.stacks[other(game.dealer)] += game.pot % 2
  } else game.stacks[winner] += payout
  game.result = { winner, text, net: heroPayout - game.invested[0], showdown }
  game.pot = 0
  game.street = 'showdown'
  game.log.push(text)
}

function showdown(game: Game) {
  const hands = game.cards.map((cards) => evaluate([...cards, ...game.board]))
  const winner =
    hands[0].score === hands[1].score
      ? 'tie'
      : hands[0].score > hands[1].score
        ? 0
        : 1
  settle(
    game,
    winner,
    winner === 'tie'
      ? `Split pot · ${hands[0].name}`
      : `${winner === 0 ? 'You win' : 'Atlas wins'} · ${hands[winner].name}`,
    true,
  )
}

function runout(game: Game) {
  while (game.board.length < 5) game.board.push(game.deck.pop()!)
  showdown(game)
}

function nextStreet(game: Game) {
  if (game.street === 'river') {
    showdown(game)
    return
  }
  if (game.stacks.some((s) => s === 0)) {
    runout(game)
    return
  }
  const count = game.street === 'preflop' ? 3 : 1
  for (let i = 0; i < count; i++) game.board.push(game.deck.pop()!)
  game.street =
    game.street === 'preflop'
      ? 'flop'
      : game.street === 'flop'
        ? 'turn'
        : 'river'
  game.bets = [0, 0]
  game.acted = [false, false]
  game.lastRaise = 20
  game.turn = other(game.dealer)
  game.log.push(
    `${game.street[0].toUpperCase()}${game.street.slice(1)} · ${game.board.map(cardLabel).join(' ')}`,
  )
}

export function act(previous: Game, action: Action, note?: string): Game {
  if (previous.street === 'showdown') throw new Error('This hand has ended')
  const game = structuredClone(previous)
  const player = game.turn
  const opponent = other(player)
  const name = player === 0 ? 'You' : 'Atlas'
  const legal = legalActions(game)
  if (game.street !== 'showdown')
    game.history.push({
      player,
      street: game.street,
      boardCount: game.board.length,
      action: action.type,
      amount:
        action.type === 'raise'
          ? action.to
          : action.type === 'call'
            ? legal.toCall
            : 0,
      toCall: legal.toCall,
      pot: game.pot,
      canRaise: legal.canRaise,
      ...(note ? { note } : {}),
    })
  if (action.type === 'fold') {
    settle(
      game,
      opponent,
      `${name} ${player === 0 ? 'fold' : 'folds'} · ${opponent === 0 ? 'you win' : 'Atlas wins'}`,
      false,
    )
    return game
  }
  if (action.type === 'check') {
    if (!legal.canCheck) throw new Error('Cannot check facing a bet')
    game.log.push(`${name} ${player === 0 ? 'check' : 'checks'}.`)
  } else if (action.type === 'call') {
    if (legal.canCheck) throw new Error('No bet to call')
    contribute(game, player, legal.toCall)
    game.log.push(`${name} ${player === 0 ? 'call' : 'calls'} ${legal.toCall}.`)
  } else {
    if (
      !legal.canRaise ||
      !Number.isInteger(action.to) ||
      action.to < legal.minRaiseTo ||
      action.to > legal.maxRaiseTo
    )
      throw new Error('Illegal raise size')
    const previousBet = Math.max(...game.bets)
    contribute(game, player, action.to - game.bets[player])
    game.lastRaise = Math.max(game.lastRaise, action.to - previousBet)
    game.acted[opponent] = false
    game.log.push(
      `${name} ${previousBet === 0 ? (player === 0 ? 'bet' : 'bets') : player === 0 ? 'raise to' : 'raises to'} ${action.to}.`,
    )
  }
  game.acted[player] = true
  // Matched bets close the round once both have acted, or immediately when a
  // covered all-in leaves nobody with a meaningful decision.
  if (
    game.bets[0] === game.bets[1] &&
    (game.acted.every(Boolean) || game.stacks.some((s) => s === 0))
  )
    nextStreet(game)
  else game.turn = opponent
  return game
}

export function estimateEquity(
  hole: Card[],
  board: Card[],
  trials = 2000,
  random = Math.random,
): number {
  return sampleOutcomes(hole, board, trials, random).equity
}

export function analyzeEquity(
  hole: Card[],
  board: Card[],
  trials = 2000,
  random = Math.random,
): EquityAnalysis {
  const currentCategory =
    hole.length + board.length >= 5
      ? categoryOf(score([...hole, ...board].map(toId)))
      : null
  const base = sampleOutcomes(hole, board, trials, random, currentCategory)
  const visible = new Set([...hole, ...board].map(toId))
  const nextCards =
    board.length >= 3 && board.length < 5
      ? liveIds(visible).map((id) => ({
          card: fromId(id),
          ...sampleOutcomes(hole, [...board, fromId(id)], 180, random),
        }))
      : []
  const nextMean = nextCards.length
    ? nextCards.reduce((sum, item) => sum + item.equity, 0) / nextCards.length
    : 0
  const nextCardVolatility = nextCards.length
    ? Math.sqrt(
        nextCards.reduce(
          (sum, item) => sum + (item.equity - nextMean) ** 2,
          0,
        ) / nextCards.length,
      )
    : null
  const sorted = [...nextCards]
    .map(({ card, equity, win, tie, loss }) => ({
      card,
      equity,
      win,
      tie,
      loss,
    }))
    .sort((a, b) => b.equity - a.equity)
  return {
    equity: base.equity,
    win: base.win,
    tie: base.tie,
    loss: base.loss,
    improve: currentCategory === null ? null : base.improved,
    nextCardVolatility,
    bestNextCards: sorted.slice(0, 4),
    worstNextCards: sorted.slice(-4).reverse(),
  }
}

function sampleOutcomes(
  hole: Card[],
  board: Card[],
  trials: number,
  random: () => number,
  currentCategory: number | null = null,
): OutcomeProbabilities & { improved: number } {
  const holeIds = hole.map(toId)
  const boardIds = board.map(toId)
  const pool = liveIds([...holeIds, ...boardIds])
  const missing = 5 - boardIds.length
  const hero = new Array<number>(7)
  const villain = new Array<number>(7)
  hero[0] = holeIds[0]
  hero[1] = holeIds[1]
  for (let i = 0; i < boardIds.length; i++)
    hero[2 + i] = villain[2 + i] = boardIds[i]
  let win = 0,
    tie = 0,
    improved = 0
  for (let t = 0; t < trials; t++) {
    const start = drawTail(pool, 2 + missing, random)
    villain[0] = pool[start]
    villain[1] = pool[start + 1]
    for (let i = 0; i < missing; i++)
      hero[2 + boardIds.length + i] = villain[2 + boardIds.length + i] =
        pool[start + 2 + i]
    const h = score(hero, 7)
    const v = score(villain, 7)
    if (h > v) win++
    else if (h === v) tie++
    if (currentCategory !== null && categoryOf(h) > currentCategory) improved++
  }
  return {
    equity: (win + tie / 2) / trials,
    win: win / trials,
    tie: tie / trials,
    loss: 1 - (win + tie) / trials,
    improved: improved / trials,
  }
}
