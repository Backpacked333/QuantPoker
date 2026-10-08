import { describe, expect, it } from 'vitest'
import { atlasDecision } from '../lib/atlas'
import { legalActions } from '../lib/poker'
import { lcg } from '../lib/sim'
import { guessKey, initialTrainer, trainerReducer } from './trainer'
import type { TrainerState } from './trainer'

const play = (state: TrainerState, random = lcg(3)) => {
  let s = state
  for (let i = 0; i < 40 && !s.game.result; i++) {
    if (s.game.turn === 0) {
      const legal = legalActions(s.game)
      s = trainerReducer(s, {
        type: 'hero',
        action: { type: legal.canCheck ? 'check' : 'call' },
      })
    } else
      s = trainerReducer(s, {
        type: 'atlas',
        decision: atlasDecision(s.game, s.style, random),
      })
  }
  return s
}

describe('trainer state', () => {
  it('walks the three guided hands with unique ids, then shuffles', () => {
    let s = initialTrainer(true, 'aggressive')
    const ids: number[] = []
    for (let step = 1; step <= 3; step++) {
      expect(s.guidedStep).toBe(step)
      expect(s.game.guided).toBe(true)
      expect(s.style).toBe('balanced')
      ids.push(s.game.id)
      s = play(s)
      expect(s.game.result).toBeDefined()
      s = trainerReducer(s, { type: 'deal', style: 'aggressive' })
    }
    expect(new Set(ids).size).toBe(3)
    expect(s.guidedStep).toBeNull()
    expect(s.game.guided).toBe(false)
    expect(s.style).toBe('aggressive')
    expect(s.game.stacks).toEqual(
      s.game.dealer === 0 ? [1990, 1980] : [1980, 1990],
    )
    expect(s.notice).toMatch(/Guided path complete/)
  })

  it('freezes decision snapshots and attaches the street guess once', () => {
    let s = initialTrainer(true, 'balanced')
    s = trainerReducer(s, { type: 'guess', value: 0.55 })
    expect(s.guesses[guessKey(s.game)]).toBe(0.55)
    const before = s.game
    s = trainerReducer(s, { type: 'hero', action: { type: 'call' } })
    expect(s.decisions).toHaveLength(1)
    expect(s.decisions[0].snapshot).toBe(before)
    expect(s.decisions[0].guess).toBe(0.55)
    expect(s.decisions[0].handClass).toBe('Flush draw')
    expect(s.decisions[0].key).toContain('balanced|')
  })

  it('ignores out-of-turn actions and queues finished hands for recording', () => {
    let s = initialTrainer(true, 'balanced')
    const atlasTooEarly = trainerReducer(s, {
      type: 'atlas',
      decision: atlasDecision(s.game, 'balanced', lcg(1)),
    })
    expect(atlasTooEarly).toBe(s)
    s = trainerReducer(s, { type: 'hero', action: { type: 'fold' } })
    expect(s.game.result?.net).toBe(-60)
    expect(s.finished).toHaveLength(1)
    expect(s.finished[0].decisions).toHaveLength(1)
    s = trainerReducer(s, { type: 'recorded', id: s.game.id })
    expect(s.finished).toHaveLength(0)
  })

  it('skips the guided path straight to a fresh shuffled hand', () => {
    const s = trainerReducer(initialTrainer(true, 'tight'), {
      type: 'skipGuided',
      style: 'tight',
    })
    expect(s.guidedStep).toBeNull()
    expect(s.game.guided).toBe(false)
    expect(s.game.id).toBe(2)
    expect(s.style).toBe('tight')
  })
})
