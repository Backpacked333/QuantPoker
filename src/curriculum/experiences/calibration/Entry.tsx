import { lazy, Suspense } from 'react'
import type { ExperienceEntryProps } from '../../core/types'
import { useExperimentController } from '../../core/experiments'
import { calibrationManifest } from './manifest'

const View = lazy(calibrationManifest.loadView)
export default function CalibrationEntry({ session }: ExperienceEntryProps) {
  const controller = useExperimentController({
    manifest: calibrationManifest,
    session,
    mode: 'explore',
    caseId: 'calibration-population-v1',
  })
  return (
    <Suspense
      fallback={<p role="status">Loading the calibration laboratory…</p>}
    >
      <View controller={controller} evidence={session} />
    </Suspense>
  )
}
