import { lazy, Suspense, useState } from 'react'
import { useExperimentController } from '../../core/experiments'
import type { ExperienceEntryProps } from '../../core/types'
import { backtestCases } from './cases'
import { backtestManifest } from './manifest'
const BacktestView = lazy(backtestManifest.loadView)

function Workspace({
  session,
  caseId,
}: {
  session: ExperienceEntryProps['session']
  caseId: string
}) {
  const c = backtestCases.find((c) => c.id === caseId)
  const controller = useExperimentController({
    manifest: backtestManifest,
    session,
    caseId: c?.id ?? 'backtest-explore',
    mode: c ? 'assess' : 'explore',
    assessmentMode: c?.mode === 'review' ? 'review' : 'transfer',
    unitId: c?.unitId,
    contentVersion: c?.contentVersion,
    rubricVersion: c?.rubricVersion,
  })
  return (
    <Suspense fallback={<p role="status">Loading backtest laboratory…</p>}>
      <BacktestView
        key={controller.attempt.id}
        controller={controller}
        evidence={session}
      />
    </Suspense>
  )
}
export default function Entry({ session }: ExperienceEntryProps) {
  const [caseId, setCaseId] = useState('explore')
  return (
    <>
      <label>
        Backtest learning mode
        <select value={caseId} onChange={(e) => setCaseId(e.target.value)}>
          <option value="explore">
            Explore the synthetic null model (no mastery credit)
          </option>
          {backtestCases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.mode}: {c.title}
            </option>
          ))}
        </select>
      </label>
      <Workspace key={caseId} session={session} caseId={caseId} />
    </>
  )
}
