// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { liveProblems, tally } from './e2e-report.ts'
import type { Report } from './e2e-report.ts'

const spec = (projectName: string, status: string) => ({
  tests: [{ projectName, status }],
})
const report = (...specs: ReturnType<typeof spec>[]) =>
  ({ suites: [{ suites: [{ specs }] }] }) as Report

describe('the e2e report check', () => {
  it('passes when at least three live tests passed', () => {
    const t = tally(
      report(
        spec('desktop', 'expected'),
        spec('live', 'expected'),
        spec('live', 'expected'),
        spec('live', 'flaky'),
      ),
    )
    expect(t.live).toEqual({ expected: 2, flaky: 1, unexpected: 0, skipped: 0 })
    expect(liveProblems(t)).toEqual([])
  })

  it('fails when the live project never ran', () => {
    expect(liveProblems(tally(report(spec('desktop', 'expected'))))).toEqual([
      'the live project did not run',
    ])
  })

  it('fails when live tests were skipped or too few passed', () => {
    const t = tally(
      report(
        spec('live', 'expected'),
        spec('live', 'skipped'),
        spec('live', 'skipped'),
      ),
    )
    expect(liveProblems(t)).toEqual([
      'only 1 live tests passed (expected ≥ 3)',
      '2 live tests were skipped',
    ])
  })

  it('fails when a live test failed', () => {
    const t = tally(
      report(
        ...['expected', 'expected', 'expected', 'unexpected'].map((s) =>
          spec('live', s),
        ),
      ),
    )
    expect(liveProblems(t)).toEqual(['1 live tests failed'])
  })
})
