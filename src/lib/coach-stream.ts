import { coachEventSchema } from './coach'
import type { CoachEvent } from './coach'

export async function readCoachStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: CoachEvent) => void,
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pending = '',
    total = 0,
    completed = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      pending += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true })
      total += value?.byteLength ?? 0
      if (total > 100000)
        throw new Error('Coach response exceeded its size limit.')
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      if (done && pending.trim()) {
        lines.push(pending)
        pending = ''
      }
      for (const line of lines) {
        if (!line.trim()) continue
        const event = coachEventSchema.parse(JSON.parse(line))
        onEvent(event)
        if (event.type === 'error') throw new Error(event.text)
        if (event.type === 'done') completed = true
      }
      if (done) break
    }
    if (!completed)
      throw new Error(
        'The reply was interrupted before completion. Your game is unchanged.',
      )
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
