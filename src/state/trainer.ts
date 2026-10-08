import type { AtlasDecision, AtlasStyle } from '../lib/atlas'
import { handClass } from '../lib/model'
import { act, newHand, other } from '../lib/poker'
import type { Action, Game } from '../lib/poker'
import { GUIDED_STEPS, scriptedHand } from '../lib/scripted'
import type { GuidedStep } from '../lib/scripted'
import { spotKey } from './spots'

export type HeroDecision = {
  snapshot: Game
  action: Action
  key: string
  guess?: number
  handClass: string
}
export type FinishedHand = {
  game: Game
  decisions: HeroDecision[]
  style: AtlasStyle
}
export type Bubble = { id: number; text: string }
export type TrainerState = {
  game: Game
  /** Atlas style for the current hand; style changes apply from the next deal. */
  style: AtlasStyle
  decisions: HeroDecision[]
  /** Equity guesses keyed by `${handId}:${street}`; null means skipped. */
  guesses: Record<string, number | null>
  finished: FinishedHand[]
  guidedStep: GuidedStep | null
  bubble: Bubble | null
  notice: string
}
export type TrainerMessage =
  | { type: 'hero'; action: Action }
  | { type: 'atlas'; decision: AtlasDecision }
  | { type: 'deal'; style: AtlasStyle }
  | { type: 'guess'; value: number | null }
  | { type: 'recorded'; id: number }
  | { type: 'startGuided' }
  | { type: 'skipGuided'; style: AtlasStyle }
  | { type: 'clearBubble' }
  | { type: 'clearNotice' }

export const guessKey = (game: Game) => `${game.id}:${game.street}`

export function initialTrainer(
  guided: boolean,
  style: AtlasStyle,
): TrainerState {
  return {
    game: guided ? scriptedHand(1) : newHand(1, [2000, 2000], 0),
    style: guided ? 'balanced' : style,
    decisions: [],
    guesses: {},
    finished: [],
    guidedStep: guided ? 1 : null,
    bubble: null,
    notice: '',
  }
}

const describe = (game: Game, action: Action) => {
  const entry = game.history[game.history.length - 1]
  if (action.type === 'fold') return 'Atlas folds.'
  if (action.type === 'check') return 'Atlas checks.'
  if (action.type === 'call') return `Atlas calls ${entry?.amount ?? ''}.`
  return `Atlas ${entry?.toCall ? 'raises to' : 'bets'} ${action.to}.`
}

function finish(state: TrainerState, game: Game, decisions: HeroDecision[]) {
  return game.result
    ? [...state.finished, { game, decisions, style: state.style }]
    : state.finished
}

function freshHand(state: TrainerState, style: AtlasStyle): TrainerState {
  const { game } = state
  const rebuy = game.stacks.some((s) => s === 0) || game.guided
  return {
    ...state,
    game: newHand(
      game.id + 1,
      rebuy ? [2000, 2000] : game.stacks,
      other(game.dealer),
    ),
    style,
    decisions: [],
    guesses: {},
    guidedStep: null,
    bubble: null,
    notice: game.guided
      ? 'Guided path complete. Practice stacks are 2,000 chips each, and every hand from here is shuffled.'
      : rebuy
        ? 'Fresh practice stacks: 2,000 chips each. Your recorded results are kept.'
        : '',
  }
}

export function trainerReducer(
  state: TrainerState,
  message: TrainerMessage,
): TrainerState {
  switch (message.type) {
    case 'hero': {
      const { game } = state
      if (game.result || game.turn !== 0) return state
      const key = guessKey(game)
      const firstOnStreet = !state.decisions.some(
        (d) => d.snapshot.street === game.street,
      )
      const guess = state.guesses[key]
      const decision: HeroDecision = {
        snapshot: game,
        action: message.action,
        key: spotKey(game, state.style),
        handClass: handClass(game.cards[0], game.board),
        ...(firstOnStreet && typeof guess === 'number' ? { guess } : {}),
      }
      const next = act(game, message.action)
      const decisions = [...state.decisions, decision]
      return {
        ...state,
        game: next,
        decisions,
        finished: finish(state, next, decisions),
        bubble: null,
        notice: '',
      }
    }
    case 'atlas': {
      const { game } = state
      if (game.result || game.turn !== 1) return state
      const next = act(
        game,
        message.decision.action,
        message.decision.explanation,
      )
      return {
        ...state,
        game: next,
        finished: finish(state, next, state.decisions),
        bubble: {
          id: next.history.length + game.id * 1000,
          text: describe(next, message.decision.action),
        },
      }
    }
    case 'deal': {
      if (!state.game.result) return state
      const step = state.guidedStep
      if (step && step < GUIDED_STEPS) {
        const nextStep = (step + 1) as GuidedStep
        return {
          ...state,
          game: { ...scriptedHand(nextStep), id: state.game.id + 1 },
          style: 'balanced',
          decisions: [],
          guesses: {},
          guidedStep: nextStep,
          bubble: null,
          notice: '',
        }
      }
      return freshHand(state, message.style)
    }
    case 'guess':
      return {
        ...state,
        guesses: { ...state.guesses, [guessKey(state.game)]: message.value },
      }
    case 'recorded':
      return {
        ...state,
        finished: state.finished.filter((hand) => hand.game.id !== message.id),
      }
    case 'startGuided':
      return {
        ...state,
        game: { ...scriptedHand(1), id: state.game.id + 1 },
        style: 'balanced',
        decisions: [],
        guesses: {},
        guidedStep: 1,
        bubble: null,
        notice: '',
      }
    case 'skipGuided':
      return freshHand(
        { ...state, game: { ...state.game, guided: true } },
        message.style,
      )
    case 'clearBubble':
      return { ...state, bubble: null }
    case 'clearNotice':
      return { ...state, notice: '' }
  }
}
