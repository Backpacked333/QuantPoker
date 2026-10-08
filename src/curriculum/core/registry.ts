import atlasKit from '../content/atlas-kit.json'
import { baseCases } from '../content/foundationCases/baseBanks'
import { foundations, fragmentSlots } from '../content/foundations'
import { pathways } from '../content/pathways'
import { sources } from '../content/sources'
import { validateCase } from './assessment'
import { independentFragment } from '../content/foundationCases/independent'
import { calibrationFragment } from '../experiences/calibration/cases'
import { sourceRecords as calibrationSources } from '../experiences/calibration/sources'
import { selectionFragment } from '../experiences/selection/cases'
import { selectionSources } from '../experiences/selection/sources'
import { informationFragments } from '../experiences/information/cases'
import { informationSources } from '../experiences/information/sources'
import { contractFragments } from '../experiences/contracts/cases'
import { contractSources } from '../experiences/contracts/sources'
import { solvencyFragments } from '../experiences/solvency/cases'
import { solvencySources } from '../experiences/solvency/sources'
import { backtestFragment } from '../experiences/backtest/cases'
import { sources as backtestSources } from '../experiences/backtest/sources'
import {
  experienceIds,
  legacyIds,
  pathwayIds,
  unitIds,
  type Availability,
  type CaseFragment,
  type CaseRecord,
  type ExperienceId,
  type ExperienceRegistration,
  type FoundationUnit,
  type SourceRecord,
} from './types'

export const atlas = atlasKit
const titles: Record<ExperienceId, string> = {
  calibration: 'Forecast quality and decision value',
  selection: 'The observations you never see',
  information: 'Price the next piece of information',
  contracts: 'Build a contingent promise',
  solvency: 'Fund a pool of promises',
  backtest: 'Freeze, test, and challenge a strategy',
}
export class CurriculumRegistry {
  readonly units = new Map(foundations.map((u) => [u.id, u]))
  readonly cases = new Map(baseCases.map((c) => [c.id, c]))
  readonly experiences = new Map<ExperienceId, ExperienceRegistration>()
  readonly sources = new Map(sources.map((s) => [s.id, s]))
  private slots = new Set<string>()
  constructor() {
    this.assertIntegrity()
  }
  get experienceInventory() {
    return experienceIds.map((id) => ({
      id,
      title: titles[id],
      availability: this.experiences.get(id)?.passedGate
        ? ('available' as const)
        : ('planned' as const),
    }))
  }
  conceptAvailability(
    id: string,
    level: 'introductory' | 'research' = 'introductory',
  ): Availability {
    const concept = atlas.concepts.find((c) => c.id === id)
    if (!concept) throw new RangeError('Unknown concept family.')
    if (level === 'research') return 'planned'
    if (
      [...this.units.values()].some(
        (u) =>
          u.availability === 'available' &&
          u.conceptIds.includes(id) &&
          u.transferCaseIds.length >= 3,
      )
    )
      return 'available'
    return concept.legacy_resources.length ||
      concept.r1_unit_links.some(
        (id) => this.units.get(id as never)?.availability === 'available',
      ) ||
      concept.r1_experience_links.some(
        (id) => this.experiences.get(id as never)?.passedGate,
      )
      ? 'partial'
      : 'planned'
  }
  registerExperience(registration: ExperienceRegistration) {
    if (
      !experienceIds.includes(registration.id) ||
      !registration.version ||
      this.experiences.has(registration.id)
    )
      throw new RangeError(
        'Unknown, duplicate, or unversioned experience registration.',
      )
    this.experiences.set(registration.id, registration)
  }
  registerSources(records: readonly SourceRecord[]) {
    for (const record of records) {
      if (
        this.sources.has(record.id) ||
        !/^https:\/\//.test(record.url) ||
        !record.references.length ||
        record.references.some(
          (r) =>
            r.sourceId !== record.id ||
            !r.claim ||
            (r.verification === 'checked' && (!r.locator || !r.checkedAt)),
        )
      )
        throw new RangeError('Duplicate or incomplete source record.')
    }
    if (new Set(records.map((r) => r.id)).size !== records.length)
      throw new RangeError('Duplicate source IDs.')
    records.forEach((r) => this.sources.set(r.id, r))
  }
  installFragment(fragment: CaseFragment) {
    const slot = fragmentSlots.find(
      (s) => s.id === fragment.slotId && s.unitId === fragment.unitId,
    )
    if (!slot || this.slots.has(slot.id))
      throw new RangeError('Unknown or duplicate fragment slot.')
    const errors = fragment.cases.flatMap((c) => [
      ...validateCase(c),
      ...(c.unitId !== slot.unitId || this.cases.has(c.id)
        ? ['Wrong unit or duplicate case ID.']
        : []),
      ...(c.sources.some((s) => !this.sources.has(s.sourceId))
        ? ['Unknown case source; register it first.']
        : []),
    ])
    if (new Set(fragment.cases.map((c) => c.id)).size !== fragment.cases.length)
      errors.push('Duplicate fragment case IDs.')
    if (
      fragment.cases.filter((c) => c.mode === 'transfer').length <
        slot.minTransfer ||
      fragment.cases.filter((c) => c.mode === 'review').length < slot.minReview
    )
      errors.push('Incomplete transfer/review bank for slot.')
    if (
      !fragment.sources.length ||
      fragment.sources.some((s) => !this.sources.has(s.sourceId))
    )
      errors.push('Register fragment sources before installation.')
    if (errors.length) throw new RangeError(errors.join('\n'))
    const unit = this.units.get(slot.unitId)!
    const added = (mode: CaseRecord['mode']) =>
      fragment.cases.filter((c) => c.mode === mode).map((c) => c.id)
    const next: FoundationUnit = {
      ...unit,
      lesson: fragment.lesson ?? unit.lesson,
      sources: [...unit.sources, ...fragment.sources],
      workedCaseIds: [...unit.workedCaseIds, ...added('worked')],
      practiceCaseIds: [
        ...unit.practiceCaseIds,
        ...added('partial'),
        ...added('practice'),
      ],
      transferCaseIds: [...unit.transferCaseIds, ...added('transfer')],
      reviewCaseIds: [...unit.reviewCaseIds, ...added('review')],
    }
    fragment.cases.forEach((c) => this.cases.set(c.id, c))
    this.slots.add(slot.id)
    const required: Partial<Record<FoundationUnit['id'], string[]>> = {
      f05: ['f05-calibration', 'f05-selection'],
      f07: ['f07-solvency'],
      f08: ['f08-contracts'],
      f10: [
        'f10-independent',
        'f10-information',
        'f10-solvency',
        'f10-backtest',
      ],
    }
    if (
      next.lesson &&
      next.workedCaseIds.length &&
      next.practiceCaseIds.some(
        (id) => this.cases.get(id)?.mode === 'partial',
      ) &&
      next.practiceCaseIds.some(
        (id) => this.cases.get(id)?.mode === 'practice',
      ) &&
      next.transferCaseIds.length >= 3 &&
      next.reviewCaseIds.length >= 3 &&
      (required[next.id] ?? []).every((id) => this.slots.has(id))
    )
      next.availability = 'available'
    this.units.set(next.id, next)
    this.assertIntegrity()
  }
  assertIntegrity() {
    const errors: string[] = []
    if (
      atlas.concepts.length !== 96 ||
      new Set(atlas.concepts.map((c) => c.id)).size !== 96 ||
      pathways.length !== 4 ||
      this.units.size !== 10
    )
      errors.push('Kit inventory cardinality mismatch.')
    for (const c of atlas.concepts) {
      if (
        !/^[A-L]0[1-8]$/.test(c.id) ||
        !atlas.domains.some((d) => d.id === c.domain) ||
        c.suggested_prerequisites.some(
          (p) => !atlas.concepts.some((c) => c.id === p),
        ) ||
        c.pathways.some((p) => !pathwayIds.includes(p as never)) ||
        c.legacy_resources.some((p) => !legacyIds.includes(p as never)) ||
        c.r1_unit_links.some((p) => !unitIds.includes(p as never)) ||
        c.r1_experience_links.some((p) => !experienceIds.includes(p as never))
      )
        errors.push(`${c.id}: bad references`)
    }
    const visited = new Set<string>(),
      active = new Set<string>()
    const visit = (u: FoundationUnit) => {
      if (active.has(u.id)) {
        errors.push(`${u.id}: prerequisite cycle`)
        return
      }
      if (visited.has(u.id)) return
      active.add(u.id)
      u.prerequisites.forEach((id) => {
        const prior = this.units.get(id)
        if (!prior) errors.push(`${id}: missing prerequisite`)
        else visit(prior)
      })
      active.delete(u.id)
      visited.add(u.id)
    }
    for (const u of this.units.values()) {
      visit(u)
      if (u.conceptIds.some((id) => !atlas.concepts.some((c) => c.id === id)))
        errors.push(`${u.id}: unknown concept`)
      const ids = [
        ...u.workedCaseIds,
        ...u.practiceCaseIds,
        ...u.transferCaseIds,
        ...u.reviewCaseIds,
      ]
      if (
        ids.some((id) => !this.cases.has(id)) ||
        new Set(ids).size !== ids.length
      )
        errors.push(`${u.id}: invalid case references`)
      if (
        u.availability === 'available' &&
        (!u.lesson ||
          u.transferCaseIds.length < 3 ||
          u.reviewCaseIds.length < 3 ||
          !u.practiceCaseIds.some(
            (id) => this.cases.get(id)?.mode === 'partial',
          ) ||
          !u.practiceCaseIds.some(
            (id) => this.cases.get(id)?.mode === 'practice',
          ))
      )
        errors.push(`${u.id}: incomplete unit marked available`)
    }
    this.cases.forEach((c) => errors.push(...validateCase(c)))
    if (errors.length) throw new RangeError(errors.join('\n'))
  }
}
export const registry = new CurriculumRegistry()
for (const records of [
  calibrationSources,
  selectionSources,
  informationSources,
  contractSources,
  solvencySources,
  backtestSources,
])
  registry.registerSources(records)
for (const fragment of [
  calibrationFragment,
  selectionFragment,
  ...informationFragments,
  ...contractFragments,
  ...solvencyFragments,
  backtestFragment,
  independentFragment,
])
  registry.installFragment(fragment)
const f05 = registry.units.get('f05')!
registry.units.set('f05', {
  ...f05,
  lesson: {
    ...f05.lesson!,
    brief: [
      ...f05.lesson!.brief,
      'Observed labels can be selected by funding, disclosure or survival. Before updating, define the target population and which outcomes were recorded. Zero observation rates make inverse corrections unavailable.',
    ],
    transfer: [
      ...f05.lesson!.transfer,
      'Selection variants contrast observed prevalence with a target-population correction under known positive observation rates; never silently fill missing counterfactual labels.',
    ],
    limitation: `${f05.lesson!.limitation} Selection corrections additionally assume known positive recording rates and comparable outcome labels.`,
  },
})
const f10 = registry.units.get('f10')!
registry.units.set('f10', {
  ...f10,
  transferCaseIds: [...f10.transferCaseIds].sort(
    (a, b) =>
      Number(b.startsWith('f10-independent')) -
      Number(a.startsWith('f10-independent')),
  ),
  reviewCaseIds: [...f10.reviewCaseIds].sort(
    (a, b) =>
      Number(b.startsWith('f10-independent')) -
      Number(a.startsWith('f10-independent')),
  ),
})
const loaders: Record<ExperienceId, ExperienceRegistration['load']> = {
  calibration: () => import('../experiences/calibration/Entry'),
  selection: () => import('../experiences/selection/Entry'),
  information: () => import('../experiences/information/Entry'),
  contracts: () => import('../experiences/contracts/Entry'),
  solvency: () => import('../experiences/solvency/Entry'),
  backtest: () => import('../experiences/backtest/Entry'),
}
const versions: Record<ExperienceId, string> = {
  calibration: 'calibration-model-v1',
  selection: 'selection-v1',
  information: '1.0.0',
  contracts: '1.0',
  solvency: 'solvency-v1',
  backtest: 'bkt-1',
}
for (const id of experienceIds)
  registry.registerExperience({
    id,
    title: titles[id],
    version: versions[id],
    passedGate: true,
    load: loaders[id],
  })
registry.assertIntegrity()
