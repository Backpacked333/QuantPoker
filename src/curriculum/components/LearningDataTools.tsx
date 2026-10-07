import { useState } from 'react'
import type { LearningSession } from '../core/session'
function downloadText(content: string, name: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
export function LearningDataTools({ session }: { session: LearningSession }) {
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  function exportData(format: 'json' | 'markdown') {
    try {
      downloadText(
        session.export(format),
        `quantpoker-learning.${format === 'json' ? 'json' : 'md'}`,
        format === 'json' ? 'application/json' : 'text/markdown',
      )
      setError('')
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Export unavailable. Your records remain in this tab.',
      )
    }
  }
  return (
    <section className="qp-data-tools">
      <h2>Learning data and recovery</h2>
      <p>
        Only local learning records are exported. No account, cloud sync, table
        history, private cards or future deck is included. JSON import is not
        part of R1.
      </p>
      <button className="button secondary" onClick={() => exportData('json')}>
        Export learning JSON
      </button>
      <button
        className="button secondary"
        onClick={() => exportData('markdown')}
      >
        Export learning Markdown
      </button>
      {session.raw !== null ? (
        <button
          className="button secondary"
          onClick={() => {
            try {
              downloadText(
                session.raw!,
                'quantpoker-learning-raw.txt',
                'text/plain',
              )
            } catch {
              setError(
                'Raw download unavailable; original browser data was not overwritten.',
              )
            }
          }}
        >
          Export original raw learning data
        </button>
      ) : null}
      {session.conflict ? (
        <>
          <p>
            Reloading saved progress discards only this tab’s unsaved work.
            Export first.
          </p>
          <button className="button secondary" onClick={() => setConfirm(true)}>
            Review reload saved progress
          </button>
          {confirm ? (
            <div role="alert">
              <p>
                Discard this tab’s unsaved work and reload the other tab’s saved
                progress?
              </p>
              <button
                className="button danger"
                onClick={() => {
                  session.reloadSaved()
                  setConfirm(false)
                }}
              >
                Reload saved progress and discard this tab
              </button>
              <button
                className="button secondary"
                onClick={() => setConfirm(false)}
              >
                Keep this tab
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {session.recovery ? (
        <p>
          Normal autosave is disabled to protect the original data. Continue
          temporarily and export; explicit reset is available in My notebook.
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}
