import { lazy, Suspense } from 'react'
import type { ExperienceEntryProps } from '../../core/types'
import { useExperimentController } from '../../core/experiments'
import { contractManifest } from './manifest'

const View = lazy(contractManifest.loadView)
export default function ContractsEntry({ session }: ExperienceEntryProps) {
  const controller = useExperimentController({
    manifest: contractManifest,
    session,
    mode: 'explore',
    caseId: 'contracts-exploration-v1',
  })
  return (
    <Suspense fallback={<p role="status">Loading contract laboratory…</p>}>
      <View controller={controller} evidence={session} />
    </Suspense>
  )
}
