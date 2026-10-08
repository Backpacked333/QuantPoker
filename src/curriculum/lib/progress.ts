import { modules, type ModuleId } from '../curriculum'

export const STORAGE_KEY = 'quantpoker.learning.v1'
export type Progress = {
  version: 1
  completed: ModuleId[]
  notes: Partial<Record<ModuleId, string>>
}
export type LearningSession = { progress: Progress; available: boolean }
export const emptyProgress = (): Progress => ({
  version: 1,
  completed: [],
  notes: {},
})
const knownIds = new Set<string>(modules.map((module) => module.id))

export function parseProgress(raw: string | null): Progress {
  if (!raw) return emptyProgress()
  try {
    const value: unknown = JSON.parse(raw)
    if (
      !value ||
      typeof value !== 'object' ||
      !('version' in value) ||
      value.version !== 1
    )
      return emptyProgress()
    const saved = value as Record<string, unknown>
    const completed = Array.isArray(saved.completed)
      ? [
          ...new Set(
            saved.completed.filter(
              (id): id is ModuleId =>
                typeof id === 'string' && knownIds.has(id),
            ),
          ),
        ]
      : []
    const notes: Progress['notes'] = {}
    if (saved.notes && typeof saved.notes === 'object') {
      for (const [id, note] of Object.entries(saved.notes)) {
        if (knownIds.has(id) && typeof note === 'string')
          notes[id as ModuleId] = note.slice(0, 10000)
      }
    }
    return { version: 1, completed, notes }
  } catch {
    return emptyProgress()
  }
}

export function loadProgress(): LearningSession {
  try {
    return {
      progress: parseProgress(localStorage.getItem(STORAGE_KEY)),
      available: true,
    }
  } catch {
    return { progress: emptyProgress(), available: false }
  }
}
