import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  BrainCircuit,
  Eye,
  Send,
  ShieldCheck,
  Square,
} from 'lucide-react'
import type { CoachSnapshot, Demonstration } from '../lib/coach'
import { readCoachStream } from '../lib/coach-stream'
import { useCloud } from '../lib/cloud-context'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  snapshotId: string
  label: string
  createdAt: string
  demonstrations: { title: string; value: Demonstration; snapshotId: string }[]
}
export function Coach({
  snapshot,
  question,
  onDemonstrate,
}: {
  snapshot: CoachSnapshot | null
  question: { text: string; id: number } | null
  onDemonstrate: (demonstration: Demonstration) => void
}) {
  const cloud = useCloud()
  const cloudStore = cloud?.state.user ? cloud.store : null
  const [messages, setMessages] = useState<Message[]>(
    () =>
      cloudStore
        ?.snapshot()
        .cache.messages.map((m) => ({ ...m, demonstrations: [] })) ?? [],
  )
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [health, setHealth] = useState<{
    configured: boolean
    authRequired: boolean
    authMode?: string
  } | null>(null)
  const [accessToken, setAccessToken] = useState('')
  const controller = useRef<AbortController | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const transcript = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const abort = new AbortController()
    void fetch('/api/coach/health', { signal: abort.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) =>
        setHealth({
          configured: data.configured === true,
          authRequired: data.authRequired === true,
          authMode: data.authMode,
        }),
      )
      .catch(() => {
        if (!abort.signal.aborted)
          setHealth({ configured: false, authRequired: false })
      })
    return () => {
      abort.abort()
      controller.current?.abort()
    }
  }, [])
  useEffect(() => {
    if (question) {
      setDraft(question.text)
      input.current?.focus({ preventScroll: true })
      input.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
  }, [question])
  useEffect(() => {
    if (transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight
  }, [messages, status])

  async function send() {
    if (!draft.trim() || !snapshot || !health?.configured || controller.current)
      return
    const captured = snapshot
    const owner = cloudStore?.snapshot().user?.id
    const label = `${captured.mode === 'review' ? 'Review' : 'Hand'} ${captured.hand} · ${captured.lens === 'equity' ? 'decision' : captured.lens} · ${captured.probe ? 'inspected point' : 'current hand'}`
    const user: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text: draft.trim(),
      snapshotId: captured.id,
      label,
      createdAt: new Date().toISOString(),
      demonstrations: [],
    }
    const reply: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: '',
      snapshotId: captured.id,
      label,
      createdAt: new Date(Date.now() + 1).toISOString(),
      demonstrations: [],
    }
    const history = [...messages.filter((m) => m.text.trim()), user]
      .slice(-11)
      .map((m) => ({ role: m.role, content: m.text.slice(0, 2400) }))
    const abort = new AbortController()
    controller.current = abort
    setMessages((previous) => [...previous, user, reply])
    setDraft('')
    setBusy(true)
    setError('')
    setStatus('Connecting to your coach…')
    try {
      const token =
        health.authMode === 'account'
          ? (await cloudStore?.client?.auth.getSession())?.data.session
              ?.access_token
          : accessToken
      if (health.authMode === 'account' && !token)
        throw new Error(
          'Open Save progress in the top bar and sign in to use the AI coach.',
        )
      let replyText = ''
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ snapshot: captured, messages: history }),
        signal: abort.signal,
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'The coach is unavailable. Your game is unchanged.',
        )
      }
      if (!response.body) throw new Error('No response stream was received.')
      if (cloudStore?.snapshot().user?.id === owner)
        cloudStore?.writeMessage(user)
      await readCoachStream(response.body, (event) => {
        if (event.type === 'status') setStatus(event.text)
        if (event.type === 'text') {
          replyText += event.text
          setStatus('')
          setMessages((previous) =>
            previous.map((m) =>
              m.id === reply.id ? { ...m, text: m.text + event.text } : m,
            ),
          )
        }
        if (event.type === 'demonstration' && event.snapshotId === captured.id)
          setMessages((previous) =>
            previous.map((m) =>
              m.id === reply.id
                ? {
                    ...m,
                    demonstrations: [
                      ...m.demonstrations,
                      {
                        title: event.title,
                        value: event.demonstration,
                        snapshotId: event.snapshotId,
                      },
                    ],
                  }
                : m,
            ),
          )
      })
      if (
        !abort.signal.aborted &&
        cloudStore?.snapshot().user?.id === owner &&
        replyText.trim()
      )
        cloudStore?.writeMessage({ ...reply, text: replyText })
    } catch (cause) {
      setError(
        abort.signal.aborted
          ? 'Reply stopped. Your hand and model are unchanged.'
          : cause instanceof Error
            ? cause.message
            : 'The coach could not answer. Your game is unchanged.',
      )
    } finally {
      controller.current = null
      setBusy(false)
      setStatus('')
    }
  }
  return (
    <section className="coach" aria-label="Context-aware AI coach">
      <header>
        <span className="coach-avatar">
          <BrainCircuit size={22} />
        </span>
        <div>
          <h3>Talk through the hand.</h3>
          <p>A coach that sees the same model you do.</p>
        </div>
        <span
          className={`coach-state ${health?.configured ? 'connected' : ''}`}
        >
          {health === null
            ? 'Connecting'
            : health.configured
              ? 'AI configured'
              : 'Not connected'}
        </span>
      </header>
      <p className="sr-only" aria-live="polite">
        {busy
          ? 'The coach is replying.'
          : messages.at(-1)?.role === 'assistant'
            ? messages.at(-1)?.text
            : ''}
      </p>
      <div className="coach-context">
        <Eye size={13} />
        <span>
          {snapshot
            ? `${snapshot.mode === 'review' ? 'Reviewing' : 'Following'} hand ${snapshot.hand} · ${snapshot.hypotheticalCard ? 'what-if card' : 'visible cards only'} · ${snapshot.probe ? 'your inspected point' : 'live model'}`
            : 'Waiting for the visible-card simulation…'}
        </span>
      </div>
      {messages.length ? (
        <div
          className="coach-transcript"
          ref={transcript}
          aria-label="Coach conversation"
        >
          {messages.map((message) => (
            <article
              key={message.id}
              className={`coach-message ${message.role}`}
            >
              <div className="message-meta">
                {message.role === 'user' ? 'You' : 'QuantPoker coach'}
                <span>
                  {message.snapshotId !== snapshot?.id
                    ? `Earlier snapshot · ${message.label}`
                    : message.label}
                </span>
              </div>
              <div className="message-body">
                {message.text
                  .split(/(\*\*[^*]+\*\*)/g)
                  .map((part, i) =>
                    part.startsWith('**') ? (
                      <strong key={i}>{part.slice(2, -2)}</strong>
                    ) : (
                      part
                    ),
                  )}
                {busy && message.id === messages.at(-1)?.id && (
                  <span className="coach-thinking">{status || '…'}</span>
                )}
              </div>
              {message.demonstrations.map((demo, i) => (
                <button
                  key={i}
                  className="coach-demonstration"
                  disabled={demo.snapshotId !== snapshot?.id || busy}
                  onClick={() => onDemonstrate(demo.value)}
                >
                  <span>
                    {demo.title}
                    <small>
                      {demo.snapshotId !== snapshot?.id
                        ? 'Snapshot changed — ask again for the current model'
                        : 'Show on graph · does not play your hand'}
                    </small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
            </article>
          ))}
        </div>
      ) : (
        <div className="coach-welcome">
          <p>“I have a draw. Why could calling still be a good decision?”</p>
          <span>
            Ask in your own words. The coach can calculate, compare, and offer a
            visual demonstration.
          </span>
        </div>
      )}
      <div className="coach-suggestions">
        {[
          'Why is this the break-even point?',
          'Explain this like I’m new to poker',
          'Show me a different next card',
          'How is this related to an option?',
        ].map((prompt) => (
          <button
            key={prompt}
            disabled={busy}
            onClick={() => {
              setDraft(prompt)
              input.current?.focus()
            }}
          >
            {prompt}
          </button>
        ))}
      </div>
      {health && !health.configured && (
        <p className="coach-error" role="status">
          The AI backend is not configured or reachable. The explanations above
          are calculated by the poker engine, not a pretend AI response.
        </p>
      )}
      {health?.authMode === 'account' && !cloudStore && (
        <p className="coach-error" role="status">
          Sign in through Save progress in the top bar to ask the coach. Guest
          learning tools remain available.
        </p>
      )}
      {health?.authRequired && health.authMode !== 'account' && (
        <label className="coach-access">
          Private coach access token
          <input
            type="password"
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
            autoComplete="off"
            placeholder="Site access token — never a model API key"
          />
        </label>
      )}
      {error && (
        <p className="coach-error" role="alert">
          {error}
        </p>
      )}
      <form
        className="coach-composer"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <textarea
          ref={input}
          aria-label="Ask about this hand or graph"
          placeholder="Ask about the hand, a graph point, or a finance idea…"
          value={draft}
          maxLength={2400}
          rows={2}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
        />
        <button
          type={busy ? 'button' : 'submit'}
          aria-label={busy ? 'Stop coach reply' : 'Send question to coach'}
          disabled={
            !busy && (!health?.configured || !snapshot || !draft.trim())
          }
          onClick={busy ? () => controller.current?.abort() : undefined}
        >
          {busy ? <Square size={16} /> : <Send size={17} />}
        </button>
      </form>
      <details className="coach-privacy">
        <summary>
          <ShieldCheck size={12} /> What the coach can see
        </summary>
        <p>
          Your visible cards, public bets, selected model, graph point, and this
          chat are sent to the configured model provider only when you send a
          question. Never send personal information. Atlas’s hidden cards and
          the deck are excluded.{' '}
          {cloudStore
            ? 'Questions and completed replies are saved privately to your account; graph demonstrations are not restored across sessions.'
            : 'Guest chat is held in memory only.'}{' '}
          The provider’s retention policy still applies. AI can be wrong.
          Calculations and assumptions remain inspectable.
        </p>
      </details>
    </section>
  )
}
