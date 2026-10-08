import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { GLOSSARY } from '../lib/glossary'
import type { GlossaryKey } from '../lib/glossary'

/**
 * A jargon word with its definition one hover, focus or tap away. The
 * definition is always linked through aria-describedby, so screen readers
 * hear it without opening anything.
 */
export function Term({ k, children }: { k: GlossaryKey; children: ReactNode }) {
  const id = useId()
  const [pinned, setPinned] = useState(false)
  const root = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!pinned) return
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !root.current?.contains(event.target as Node)
      )
        setPinned(false)
    }
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', close)
    return () => {
      document.removeEventListener('keydown', close)
      document.removeEventListener('pointerdown', close)
    }
  }, [pinned])

  return (
    <span className={`term ${pinned ? 'pinned' : ''}`} ref={root}>
      <button
        type="button"
        className="term-word"
        aria-describedby={id}
        aria-expanded={pinned}
        onClick={() => setPinned(!pinned)}
      >
        {children}
      </button>
      <span role="tooltip" id={id} className="term-tip">
        {GLOSSARY[k]}
      </span>
    </span>
  )
}
