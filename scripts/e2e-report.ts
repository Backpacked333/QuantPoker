// Playwright's JSON report, reduced to what CI must know: per project, how
// many tests ran and how each ended. A project that silently did not run
// (a webServer that never came up, a testMatch typo) shows as missing.

type Status = 'expected' | 'unexpected' | 'flaky' | 'skipped'
type Suite = {
  suites?: Suite[]
  specs?: { tests: { projectName: string; status: Status }[] }[]
}
export type Report = { suites?: Suite[] }
export type Tally = Record<string, Record<Status, number>>

export function tally(report: Report): Tally {
  const out: Tally = {}
  const walk = (suite: Suite) => {
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests) {
        out[test.projectName] ??= {
          expected: 0,
          unexpected: 0,
          flaky: 0,
          skipped: 0,
        }
        out[test.projectName][test.status]++
      }
    for (const child of suite.suites ?? []) walk(child)
  }
  for (const suite of report.suites ?? []) walk(suite)
  return out
}

/** Why the run does not prove the live two-browser tests passed. */
export function liveProblems(t: Tally, minimum = 3): string[] {
  const live = t.live
  if (!live) return ['the live project did not run']
  const problems: string[] = []
  const passed = live.expected + live.flaky
  if (passed < minimum)
    problems.push(`only ${passed} live tests passed (expected ≥ ${minimum})`)
  if (live.skipped) problems.push(`${live.skipped} live tests were skipped`)
  if (live.unexpected) problems.push(`${live.unexpected} live tests failed`)
  return problems
}
