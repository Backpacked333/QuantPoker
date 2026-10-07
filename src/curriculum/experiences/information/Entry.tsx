import { lazy, Suspense } from 'react'
import type { ExperienceEntryProps } from '../../core/types'
import { useExperimentController } from '../../core/experiments'
import { informationManifest } from './manifest'

const InformationView = lazy(informationManifest.loadView)
export default function InformationEntry({ session }: ExperienceEntryProps) {
  const controller = useExperimentController({
    manifest: informationManifest,
    session,
    mode: 'explore',
    caseId: 'information-experiment-v1',
  })
  return (
    <Suspense fallback={<p role="status">Loading information laboratory…</p>}>
      <InformationView controller={controller} evidence={session} />
    </Suspense>
  )
}
