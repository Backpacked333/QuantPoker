import { describe, expect, it } from 'vitest'
import { createHandLesson } from './hand-lesson'
import { callEV } from './finance'

describe('hand-linked teaching content', () => {
  it('uses the current pot and call, not a memorized threshold', () => {
    const lesson = createHandLesson('equity', 160, 40)
    expect(lesson.context).toContain('160 chips in the pot. 40 more to call.')
    expect(lesson.working.at(-1)?.value).toBe('40 ÷ 200 = 20.0%')
    expect(createHandLesson('equity', 60, 30).working.at(-1)?.value).toBe(
      '30 ÷ 90 = 33.3%',
    )
  })

  it.each([
    [160, 40],
    [60, 30],
    [800, 200],
    [20, 80],
  ])('places experiments around the actual price (%i, %i)', (pot, call) => {
    const lesson = createHandLesson('equity', pot, call)
    expect(callEV(lesson.points[0].x, pot, call)).toBeLessThan(0)
    expect(callEV(lesson.points[1].x, pot, call)).toBeCloseTo(0)
    expect(callEV(lesson.points[2].x, pot, call)).toBeGreaterThan(0)
  })

  it.each(['equity', 'insurance'] as const)(
    'teaches a free check without suggesting new exposure in %s',
    (lens) => {
      const lesson = createHandLesson(lens, 100, 0)
      expect(lesson.prediction.answer).toBe('zero')
      expect(lesson.context).toContain('No new chips required')
      expect(lesson.experiment).toMatch(/free check|no new chips at risk/i)
    },
  )

  it('distinguishes additional option value from sunk costs and real premiums', () => {
    const lesson = createHandLesson('options', 160, 40)
    expect(lesson.working[0].value).toBe('−20.0 chips')
    expect(lesson.working[2].value).toBe('max(-20.0, 0) = 0.0 chips')
    expect(lesson.transfer.answer).toBe('premium')
    expect(createHandLesson('options', 100, 0).experiment).toContain(
      'no negative branch',
    )
  })

  it('labels the insurance practice assumptions and prices expected claims', () => {
    const lesson = createHandLesson('insurance', 160, 40)
    expect(lesson.context).toContain(
      'assume a 25% chance of loss—not a prediction',
    )
    expect(lesson.working[1].value).toBe('30.0 chips')
    expect(lesson.working[2].value).toBe('0.25 × 30.0 = 7.5 chips')
    expect(lesson.experiment).toContain('not overall expected value')
  })

  it.each(['equity', 'options', 'insurance'] as const)(
    'has one unambiguous answer and complete feedback in %s',
    (lens) => {
      for (const [pot, call] of [
        [160, 40],
        [100, 0],
        [0, 0],
        [10, 100],
      ]) {
        const lesson = createHandLesson(lens, pot, call)
        for (const question of [lesson.prediction, lesson.transfer]) {
          expect(
            question.choices.filter((choice) => choice.id === question.answer),
          ).toHaveLength(1)
          expect(
            new Set(question.choices.map((choice) => choice.id)).size,
          ).toBe(question.choices.length)
          expect(
            question.choices.every((choice) => choice.feedback.length > 30),
          ).toBe(true)
        }
        expect(JSON.stringify(lesson)).not.toMatch(/NaN|Infinity/)
        expect(
          lesson.points.every((point) => point.x >= 0 && point.x <= 1),
        ).toBe(true)
      }
    },
  )
})
