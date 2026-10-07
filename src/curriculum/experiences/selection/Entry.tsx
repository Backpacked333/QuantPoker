import { lazy, Suspense, useState } from 'react'
import { CasePlayer } from '../../components/CasePlayer'
import { useExperimentController } from '../../core/experiments'
import type { ExperienceEntryProps } from '../../core/types'
import { selectionCases } from './cases'
import { selectionManifest } from './manifest'

const View = lazy(selectionManifest.loadView)
export default function SelectionEntry({ session }: ExperienceEntryProps) {
  const controller = useExperimentController({
    manifest: selectionManifest,
    session,
    caseId: 'selection-observed-example-v1',
    mode: 'explore',
  })
  const [caseId, setCaseId] = useState(selectionCases[0].id)
  const selectedCase = selectionCases.find((c) => c.id === caseId)!
  return (
    <>
      <Suspense fallback={<p role="status">Loading selection laboratory…</p>}>
        <View controller={controller} evidence={session} />
      </Suspense>
      <section
        className="qp-lesson-step qp-selection-transfer"
        aria-label="Selection finance transfer and review"
      >
        <h2>Finance-only transfer and changed-number reviews</h2>
        <p>
          Loans, project funding and claims use different observation
          mechanisms. Predict before answering; reflections are never
          keyword-scored. Review timing and fresh-variant rules are enforced by
          the common learning session.
        </p>
        <label htmlFor="selection-finance-case">Choose a selection case</label>
        <select
          id="selection-finance-case"
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
        >
          {selectionCases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.mode === 'transfer' ? 'Transfer' : 'Review'}: {c.title}
            </option>
          ))}
        </select>
        <CasePlayer key={caseId} session={session} caseRecord={selectedCase} />
      </section>
    </>
  )
}
