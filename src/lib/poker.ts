export type Suit = 's' | 'h' | 'd' | 'c'
export type Card = { rank: number; suit: Suit }
export type Player = 0 | 1
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; to: number }
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

export function shuffle(cards: Card[], random = Math.random): Card[] {
  const copy = [...cards]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const categories = [
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
const encode = (category: number, kickers: number[]) =>
  [category, ...kickers, ...Array(5 - kickers.length).fill(0)].reduce(
    (score, n) => score * 15 + n,
    0,
  )

function straight(ranks: number[]): number {
  const unique = [...new Set(ranks)].sort((a, b) => b - a)
  if (unique[0] === 14) unique.push(1)
  for (let i = 0; i <= unique.length - 5; i++)
    if (unique[i] - unique[i + 4] === 4) return unique[i]
  return 0
}

export function evaluate(cards: Card[]): { score: number; name: string } {
  if (cards.length < 5 || cards.length > 7)
    throw new Error('Evaluate requires 5–7 cards')
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a)
  const counts = new Map<number, number>()
  ranks.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1))
  const groups = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0] - a[0],
  )
  const flush = (['s', 'h', 'd', 'c'] as Suit[])
    .map((s) =>
      cards
        .filter((c) => c.suit === s)
        .map((c) => c.rank)
        .sort((a, b) => b - a),
    )
    .find((c) => c.length >= 5)
  const straightFlush = flush ? straight(flush) : 0
  const straightHigh = straight(ranks)
  let category: number
  let kickers: number[]
  if (straightFlush) {
    category = 8
    kickers = [straightFlush]
  } else if (groups[0][1] === 4) {
    category = 7
    kickers = [groups[0][0], ranks.find((r) => r !== groups[0][0])!]
  } else if (groups[0][1] === 3 && groups[1][1] >= 2) {
    category = 6
    kickers = [groups[0][0], groups[1][0]]
  } else if (flush) {
    category = 5
    kickers = flush.slice(0, 5)
  } else if (straightHigh) {
    category = 4
    kickers = [straightHigh]
  } else if (groups[0][1] === 3) {
    category = 3
    kickers = [
      groups[0][0],
      ...groups
        .slice(1)
        .map((g) => g[0])
        .sort((a, b) => b - a)
        .slice(0, 2),
    ]
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    category = 2
    const pairs = groups
      .filter((g) => g[1] === 2)
      .map((g) => g[0])
      .slice(0, 2)
    kickers = [...pairs, ...ranks.filter((r) => !pairs.includes(r)).slice(0, 1)]
  } else if (groups[0][1] === 2) {
    category = 1
    kickers = [
      groups[0][0],
      ...groups
        .slice(1)
        .map((g) => g[0])
        .slice(0, 3),
    ]
  } else {
    category = 0
    kickers = ranks.slice(0, 5)
  }
  return { score: encode(category, kickers), name: categories[category] }
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
  random = Math.random,
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

export function act(previous: Game, action: Action): Game {
  if (previous.street === 'showdown') throw new Error('This hand has ended')
  const game = structuredClone(previous)
  const player = game.turn
  const opponent = other(player)
  const name = player === 0 ? 'You' : 'Atlas'
  const legal = legalActions(game)
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
  if (game.acted.every(Boolean) && game.bets[0] === game.bets[1])
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
  const visible = new Set([...hole, ...board].map(cardKey))
  const available = deck().filter((c) => !visible.has(cardKey(c)))
  let wins = 0
  for (let i = 0; i < trials; i++) {
    const pool = [...available]
    const draw = () => pool.splice(Math.floor(random() * pool.length), 1)[0]
    const opponent = [draw(), draw()]
    const future = [...board]
    while (future.length < 5) future.push(draw())
    const heroScore = evaluate([...hole, ...future]).score
    const opponentScore = evaluate([...opponent, ...future]).score
    wins +=
      heroScore > opponentScore ? 1 : heroScore === opponentScore ? 0.5 : 0
  }
  return wins / trials
}

export function analyzeEquity(
  hole: Card[],
  board: Card[],
  trials = 2000,
  random = Math.random,
): EquityAnalysis {
  const visible = new Set([...hole, ...board].map(cardKey))
  const available = deck().filter((card) => !visible.has(cardKey(card)))
  const currentCategory =
    hole.length + board.length >= 5
      ? categories.indexOf(evaluate([...hole, ...board]).name)
      : null
  let win = 0,
    tie = 0,
    improved = 0
  for (let i = 0; i < trials; i++) {
    const pool = [...available]
    const draw = () => pool.splice(Math.floor(random() * pool.length), 1)[0]
    const opponent = [draw(), draw()]
    const future = [...board]
    while (future.length < 5) future.push(draw())
    const hero = evaluate([...hole, ...future])
    const villain = evaluate([...opponent, ...future])
    if (hero.score > villain.score) win++
    else if (hero.score === villain.score) tie++
    if (
      currentCategory !== null &&
      categories.indexOf(hero.name) > currentCategory
    )
      improved++
  }
  const equity = (win + tie / 2) / trials
  const nextCards =
    board.length >= 3 && board.length < 5
      ? available.map((card) => ({
          card,
          ...sampleOutcomes(hole, [...board, card], 180, random),
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
  const sorted = [...nextCards].sort((a, b) => b.equity - a.equity)
  return {
    equity,
    win: win / trials,
    tie: tie / trials,
    loss: 1 - (win + tie) / trials,
    improve: currentCategory === null ? null : improved / trials,
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
): OutcomeProbabilities {
  const visible = new Set([...hole, ...board].map(cardKey))
  const available = deck().filter((card) => !visible.has(cardKey(card)))
  let win = 0,
    tie = 0
  for (let i = 0; i < trials; i++) {
    const pool = [...available]
    const draw = () => pool.splice(Math.floor(random() * pool.length), 1)[0]
    const opponent = [draw(), draw()]
    const future = [...board]
    while (future.length < 5) future.push(draw())
    const heroScore = evaluate([...hole, ...future]).score
    const villainScore = evaluate([...opponent, ...future]).score
    if (heroScore > villainScore) win++
    else if (heroScore === villainScore) tie++
  }
  return {
    equity: (win + tie / 2) / trials,
    win: win / trials,
    tie: tie / trials,
    loss: 1 - (win + tie) / trials,
  }
}

export function botAction(game: Game, random = Math.random): Action {
  const legal = legalActions(game)
  const equity = estimateEquity(game.cards[1], game.board, 250, random)
  const odds = legal.toCall / (game.pot + legal.toCall)
  const roll = random()
  if (legal.toCall && equity < odds + 0.04 && roll > 0.15)
    return { type: 'fold' }
  if (legal.canRaise && ((equity > 0.65 && roll < 0.65) || roll < 0.07)) {
    return {
      type: 'raise',
      to: Math.min(
        legal.maxRaiseTo,
        Math.max(
          legal.minRaiseTo,
          Math.max(...game.bets) + Math.round((game.pot * 0.55) / 10) * 10,
        ),
      ),
    }
  }
  return { type: legal.canCheck ? 'check' : 'call' }
}
