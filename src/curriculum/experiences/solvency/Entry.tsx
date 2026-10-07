import type { ExperienceEntryProps } from '../../core/types'
import { useExperimentController } from '../../core/experiments'
import { solvencyManifest } from './manifest'
import View from './View'

export default function Entry({ session }: ExperienceEntryProps) {
  const controller = useExperimentController({
    manifest: solvencyManifest,
    session,
    mode: 'explore',
    caseId: 'solvency-exploration-v1',
  })
  return <View controller={controller} evidence={session} />
}
