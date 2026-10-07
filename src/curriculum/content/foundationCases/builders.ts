import type {
  CaseRecord,
  EvidenceReference,
  Question,
  UnitId,
} from '../../core/types'
export interface ChoiceSpec {
  prompt: string
  correct: string
  wrong: string
  rationale: string
}
export interface Scenario {
  title: string
  role: string
  objective: string
  information: readonly string[]
  states: readonly string[]
  cashFlows: string
  setup: ChoiceSpec
  calculation: {
    prompt: string
    expected: number
    units: string
    tolerance: number
    rationale: string
  }
  interpretation: ChoiceSpec
  limitation: ChoiceSpec
  reversal: ChoiceSpec
  solution: readonly string[]
  assumptions: readonly string[]
  connection: CaseRecord['connection']
  actions: readonly string[]
}
function choice(
  id: string,
  component: Question['component'],
  s: ChoiceSpec,
  critical = false,
): Question {
  return {
    id,
    component,
    kind: 'choice',
    points: 20,
    critical,
    prompt: s.prompt,
    rationale: s.rationale,
    expected: `${id}-supported`,
    options: [
      { id: `${id}-supported`, label: s.correct, rationale: s.rationale },
      {
        id: `${id}-unsupported`,
        label: s.wrong,
        rationale: `This confuses the event, objective, or timing. ${s.rationale}`,
      },
    ],
    hints: [
      'Name the decision time, the quantity, and what is supplied.',
      'Separate a modeled assumption from a realized observation.',
      s.rationale,
      `Supported answer: ${s.correct}`,
    ],
  }
}
export function authorCase(
  unitId: UnitId,
  mode: CaseRecord['mode'],
  variant: string,
  s: Scenario,
  sources: readonly EvidenceReference[],
): CaseRecord {
  const numeric: Question = {
    id: 'calculate',
    component: 'calculation',
    kind: 'numeric',
    points: 20,
    critical: false,
    prompt: s.calculation.prompt,
    expected: s.calculation.expected,
    tolerance: s.calculation.tolerance,
    units: s.calculation.units,
    rationale: s.calculation.rationale,
    hints: [
      'Write the denominator or incremental state ledger first.',
      'Use unrounded supplied quantities; do not insert a realized outcome.',
      s.calculation.rationale,
      `The computed value is ${s.calculation.expected} ${s.calculation.units}.`,
    ],
  }
  return {
    id: `${unitId}-${mode}-${variant}`,
    unitId,
    contentVersion: 1,
    rubricVersion: 1,
    title: s.title,
    mode,
    role: s.role,
    objective: s.objective,
    information: s.information,
    states: s.states,
    actions: s.actions,
    responses:
      'All terms are supplied before the action. Outcomes settle afterward; no response reveals private information.',
    cashFlows: s.cashFlows,
    constraints:
      'Use the stated one-period model, no unstated borrowing or extra observations; structured score uses full precision and authored tolerances.',
    assumptions: s.assumptions,
    connection: s.connection,
    questions: [
      choice('setup', 'setup', s.setup, true),
      numeric,
      choice('interpret', 'interpretation', s.interpretation, true),
      choice('limit', 'limitation', s.limitation, true),
      choice('reverse', 'interpretation', s.reversal),
    ],
    workedSolution: s.solution,
    reflectionPrompt:
      'Defend the action in your own words. What information was missing, and which assumption would you investigate? This reflection is saved, never keyword-scored.',
    decisionReversal: s.reversal.prompt,
    sources,
  }
}
export function retrieval(
  prompt: string,
  correct: string,
  wrong: string,
  rationale: string,
): Question {
  return choice('retrieval', 'setup', { prompt, correct, wrong, rationale })
}
export function bank(
  unitId: UnitId,
  transfers: readonly Scenario[],
  reviews: readonly Scenario[],
  worked: Scenario,
  partial: Scenario,
  practice: Scenario,
  sources: readonly EvidenceReference[],
): CaseRecord[] {
  return [
    authorCase(unitId, 'worked', '1', worked, sources),
    authorCase(unitId, 'partial', '1', partial, sources),
    authorCase(unitId, 'practice', '1', practice, sources),
    ...transfers.map((s, i) =>
      authorCase(unitId, 'transfer', String(i + 1), s, sources),
    ),
    ...reviews.map((s, i) =>
      authorCase(unitId, 'review', String(i + 1), s, sources),
    ),
  ]
}
