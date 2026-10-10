// The landing page's hero (L-2, L-4): one curated hand against Atlas on the
// real table. Each decision is a button for one pre-scored option, graded
// the moment it is made; Atlas's replies come from the tree, a beat apart so
// they read like play. No analysis runs and the lab is never loaded (L-3).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotionConfig } from 'motion/react'
import { actionOf } from '../challenge/actions'
import { CHALLENGE_HANDS, startGame } from '../challenge/hands'
import type { ChallengeSpec } from '../challenge/hands'
import type {
  AtlasStep,
  ChallengeNode,
  ChallengeOption,
  ChallengeTree,
} from '../challenge/score'
import { treeFor } from '../challenge/trees'
import { Table } from '../components/table/Table'
import { act, legalActions } from '../lib/poker'
import type { Game } from '../lib/poker'
import { track } from '../lib/track'
import { useRunout } from '../state/runout'
import type { Bubble } from '../state/trainer'
import { atlasSays, why } from './why'

export type PlayedDecision = {
  node: ChallengeNode
  chosen: ChallengeOption
  /** Atlas's replies to it, with its reasoning (shown after the hand). */
  atlas: AtlasStep[]
}
export type FinishedChallenge = {
  spec: ChallengeSpec
  tree: ChallengeTree
  game: Game
  path: string[]
  decisions: PlayedDecision[]
}

const noop = () => {}
const ATLAS_BEAT_MS = 750

export function ChallengeHand({
  index,
  round,
  onDone,
}: {
  /** Which curated hand (wraps around the pool). */
  index: number
  /** Increments for each new hand, so table animations restart. */
  round: number
  onDone: (result: FinishedChallenge) => void
}) {
  const spec = CHALLENGE_HANDS[index % CHALLENGE_HANDS.length]
  const tree = treeFor(spec.id, spec.ver)!
  const reduced = useReducedMotionConfig()
  const [game, setGame] = useState<Game>(() => ({
    ...startGame(spec),
    id: round,
  }))
  const [at, setAt] = useState<number | null>(0)
  const [queue, setQueue] = useState<AtlasStep[]>([])
  const [decisions, setDecisions] = useState<PlayedDecision[]>([])
  const [bubble, setBubble] = useState<Bubble | null>(null)
  const runout = useRunout(game)
  const reported = useRef(false)
  const headline = useRef<HTMLParagraphElement>(null)

  const node = at === null ? null : tree.nodes[at]
  const waiting = queue.length > 0
  const yourTurn = !!node && !waiting && !game.result

  // Atlas replies one action at a time.
  useEffect(() => {
    if (!queue.length) return
    const timer = window.setTimeout(
      () => {
        const [step, ...rest] = queue
        setBubble({
          id: game.history.length,
          text: atlasSays(step.code, legalActions(game).toCall),
        })
        setGame(act(game, actionOf(game, step.code), step.note))
        setQueue(rest)
      },
      reduced ? 0 : ATLAS_BEAT_MS,
    )
    return () => window.clearTimeout(timer)
  }, [queue, reduced, game])

  // The hand is over once Atlas is done and any all-in runout has landed.
  useEffect(() => {
    if (!game.result || waiting || runout.revealing || reported.current) return
    reported.current = true
    track('challenge_complete')
    onDone({
      spec,
      tree,
      game,
      path: decisions.map((d) => d.chosen.code),
      decisions,
    })
  }, [game, waiting, runout.revealing, decisions, spec, tree, onDone])

  const choose = (option: ChallengeOption) => {
    if (!node || !yourTurn) return
    if (!decisions.length) track('challenge_start')
    track('challenge_decision')
    setDecisions((d) => [...d, { node, chosen: option, atlas: option.atlas }])
    setGame((g) => act(g, actionOf(g, option.code)))
    setQueue(option.atlas)
    setAt(option.next)
    setBubble(null)
  }

  const last = decisions.at(-1)
  const options = useMemo(() => node?.options ?? [], [node])

  return (
    <div className="challenge" data-hand={spec.id}>
      <Table
        game={game}
        style="balanced"
        bubble={bubble}
        paused={false}
        yourTurn={yourTurn}
        guidedStep={null}
        showBubbles
        onTogglePause={noop}
        onHistory={noop}
        onSettings={noop}
        onSkipGuided={noop}
        runout={runout}
        challenge={{ title: spec.title }}
      />
      <div className="challenge-bar">
        <p className="challenge-status" role="status" ref={headline}>
          {last ? (
            <>
              <span
                className={`grade grade-${last.chosen.grade.toLowerCase()}`}
              >
                {last.chosen.grade}
              </span>{' '}
              <span>{why(last.node, last.chosen)}</span>
            </>
          ) : (
            <span>{spec.setup} Your move.</span>
          )}
        </p>
        <div
          className="challenge-actions"
          role="group"
          aria-label={
            yourTurn
              ? `Your decision on the ${node!.street}. Pot ${node!.pot}.`
              : 'Waiting for Atlas'
          }
        >
          {options.map((option, i) => (
            <button
              key={option.code}
              className={`challenge-option ${option.code === 'f' ? 'is-fold' : option.code.startsWith('r') ? 'is-raise' : 'is-call'}`}
              onClick={() => choose(option)}
              disabled={!yourTurn}
              aria-keyshortcuts={String(i + 1)}
            >
              <kbd aria-hidden>{i + 1}</kbd>
              {option.label}
            </button>
          ))}
          {!yourTurn && !game.result && (
            <span className="challenge-wait">Atlas is deciding…</span>
          )}
        </div>
      </div>
      <ChallengeKeys options={options} enabled={yourTurn} onChoose={choose} />
    </div>
  )
}

/** Number keys pick an option, like the trainer's 1–4 presets. */
function ChallengeKeys({
  options,
  enabled,
  onChoose,
}: {
  options: ChallengeOption[]
  enabled: boolean
  onChoose: (option: ChallengeOption) => void
}) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable]')) return
      const n = Number(event.key)
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        event.preventDefault()
        onChoose(options[n - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [options, enabled, onChoose])
  return null
}
