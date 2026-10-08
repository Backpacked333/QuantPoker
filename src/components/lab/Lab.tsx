import { lazy, Suspense, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  Grid3x3,
  Lock,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import type { AtlasStyle } from '../../lib/atlas'
import type { DecisionAction, Lens } from '../../lib/finance'
import type { NextScenario, OpponentModel } from '../../lib/model'
import type { Game } from '../../lib/poker'
import type { SpotAnalysis } from '../../lib/range'
import type { LessonId, Settings } from '../../lib/storage'
import { Modal } from '../Modal'
import {
  ActionCompare,
  EquityMeter,
  NextCards,
  OutcomeBar,
  QuantGrid,
  RangeShift,
  Verdict,
  WhatIfBanner,
} from './DecisionView'
import { pct0 } from '../format'
import { Heatmap } from './Heatmap'
import { useLabModel } from './labModel'
import { OptionsView, ProtectionView } from './LensViews'
import { RangeView } from './RangeView'

const Surface3D = lazy(() => import('./Surface3D'))
type Tab = 'decision' | 'range' | 'options' | 'insurance'
const TABS: [Tab, string, typeof TrendingUp][] = [
  ['decision', 'Decision', TrendingUp],
  ['range', 'Atlas range', Grid3x3],
  ['options', 'Optionality', ArrowUpRight],
  ['insurance', 'Protection', ShieldCheck],
]
const TITLES: Record<Tab, string> = {
  decision: 'Your decision, priced.',
  range: 'What Atlas likely holds.',
  options: 'The option to walk away has value.',
  insurance: 'Protection reshapes the downside.',
}
/** Curriculum modules that extend each view (#learn/module/<id>/learn). */
const CONNECTIONS: Record<Tab, [string, string][]> = {
  decision: [
    ['odds', 'Pot odds → expected payoff'],
    ['outs', 'Outs → possible future states'],
    ['equity', 'Equity → probability weights'],
  ],
  range: [
    ['fold', 'Fold equity → response trees'],
    ['equity', 'Equity → probability weights'],
    ['outs', 'Outs → possible future states'],
  ],
  options: [
    ['fold', 'Fold equity → response trees'],
    ['pricing', 'Expected value → risk-neutral pricing'],
    ['replication', 'Replication → delta & parity'],
  ],
  insurance: [
    ['variance', 'Variance → implied volatility'],
    ['replication', 'Hedging → payoff replication'],
    ['risk', 'All-in risk → cashout, Kelly & CDS'],
  ],
}
const LESSON_FOR: Record<Tab, LessonId> = {
  decision: 'equity',
  range: 'ranges',
  options: 'options',
  insurance: 'insurance',
}

export function Lab({
  game,
  spot,
  style,
  settings,
  raiseTo,
  playedAction,
  locked,
  guess,
  reviewing,
  review,
  themeKey,
  resetKey,
  onSettings,
  onReveal,
  onLesson,
}: {
  game: Game
  spot: SpotAnalysis | undefined
  style: AtlasStyle
  settings: Settings
  raiseTo: number
  playedAction?: DecisionAction
  locked: boolean
  guess?: number
  reviewing: boolean
  review?: ReactNode
  themeKey: string
  /** Changes whenever the analyzed decision changes. */
  resetKey: string
  onSettings: (patch: Partial<Settings>) => void
  onReveal: () => void
  onLesson: (id: LessonId) => void
}) {
  const analyst = settings.mode === 'analyst'
  const [tab, setTab] = useState<Tab>('decision')
  const [action, setAction] = useState<DecisionAction>(
    playedAction ?? 'continue',
  )
  const [foldOverride, setFoldOverride] = useState<number | null>(null)
  const [coverage, setCoverage] = useState(0.75)
  const [whatIf, setWhatIf] = useState<NextScenario | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState(false)
  const [identity, setIdentity] = useState(resetKey)
  if (identity !== resetKey) {
    setIdentity(resetKey)
    setAction(playedAction ?? 'continue')
    setFoldOverride(null)
    setWhatIf(null)
  }
  const lab = useLabModel({
    game,
    spot,
    style,
    model: settings.opponentModel,
    raiseTo,
    action,
    foldOverride,
    coverageFraction: coverage,
    whatIf,
  })
  const activeTab: Tab = analyst ? tab : 'decision'
  const lens: Lens =
    activeTab === 'options'
      ? 'options'
      : activeTab === 'insurance'
        ? 'insurance'
        : 'equity'
  const markerLabel = whatIf
    ? 'What-if card'
    : reviewing
      ? 'Your decision'
      : 'Your hand now'

  function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex(([key]) => key === tab)
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % TABS.length
        : event.key === 'ArrowLeft'
          ? (index + TABS.length - 1) % TABS.length
          : null
    if (next === null) return
    event.preventDefault()
    setTab(TABS[next][0])
    document.getElementById(`lab-tab-${TABS[next][0]}`)?.focus()
  }

  const heatmap = (
    <Heatmap
      lens={lens}
      scenario={lab.scenario}
      markerLabel={markerLabel}
      themeKey={themeKey}
      onExpand={() => setExpanded(true)}
    />
  )
  const modelToggle = (
    <div className="model-toggle" role="group" aria-label="Opponent model">
      {(
        [
          ['range', 'Atlas’s range'],
          ['uniform', 'Any hand'],
        ] as [OpponentModel, string][]
      ).map(([key, label]) => (
        <button
          key={key}
          aria-pressed={settings.opponentModel === key}
          className={settings.opponentModel === key ? 'on' : ''}
          onClick={() => onSettings({ opponentModel: key })}
        >
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <aside className="lab" aria-label="Quant lab" data-tour="lab">
      <div className="lab-head">
        <div>
          <span className="eyebrow">
            <Sparkles size={13} /> {reviewing ? 'Review' : 'Live'} quant lab
          </span>
          <h2>
            {reviewing
              ? 'Replay the decision.'
              : 'See the decision, not just the cards.'}
          </h2>
        </div>
        <div className="mode-toggle" role="group" aria-label="Lab detail">
          {(['beginner', 'analyst'] as const).map((mode) => (
            <button
              key={mode}
              aria-pressed={settings.mode === mode}
              className={settings.mode === mode ? 'on' : ''}
              onClick={() => onSettings({ mode })}
            >
              {mode === 'beginner' ? 'Simple' : 'Analyst'}
            </button>
          ))}
        </div>
      </div>

      {review}

      <div className="lab-context">
        <span>
          <b>{game.street === 'showdown' ? 'Final' : game.street}</b> · pot{' '}
          {lab.pot}
        </span>
        <span>
          {lab.cardsToCome} card{lab.cardsToCome === 1 ? '' : 's'} to come
        </span>
        <span>{lab.call ? `${lab.call} to call` : 'no bet to face'}</span>
      </div>

      {locked ? (
        <div className="lab-locked">
          <Lock size={20} />
          <h3>Make your read first.</h3>
          <p>
            Guess your equity below the table, then the lab opens with the
            answer. Calibrated intuition is the skill this trains.
          </p>
          <button className="btn btn-quiet" onClick={onReveal}>
            Reveal without guessing
          </button>
        </div>
      ) : (
        <>
          {analyst && (
            <div
              className="lab-tabs"
              role="tablist"
              aria-label="Lab views"
              onKeyDown={navigateTabs}
            >
              {TABS.map(([key, label, Icon]) => (
                <button
                  key={key}
                  id={`lab-tab-${key}`}
                  role="tab"
                  aria-selected={tab === key}
                  tabIndex={tab === key ? 0 : -1}
                  aria-controls="lab-panel"
                  className={tab === key ? 'on' : ''}
                  onClick={() => setTab(key)}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          )}
          <div
            id="lab-panel"
            role={analyst ? 'tabpanel' : undefined}
            className="lab-panel"
          >
            {analyst && (
              <div className="lab-title">
                <h3>{TITLES[activeTab]}</h3>
                {modelToggle}
              </div>
            )}
            {whatIf && (
              <WhatIfBanner scenario={whatIf} onClear={() => setWhatIf(null)} />
            )}
            {!lab.ready && (
              <div className="lab-loading" role="status">
                <span className="spinner" />
                {lab.quickEquity !== undefined
                  ? `Quick estimate ${pct0(lab.quickEquity)} vs any hand. Reading Atlas's range…`
                  : 'Running simulations…'}
              </div>
            )}

            {activeTab === 'decision' && (
              <>
                <EquityMeter lab={lab} guess={guess} />
                <Verdict lab={lab} />
                <ActionCompare
                  lab={lab}
                  onSelect={setAction}
                  onFoldOverride={setFoldOverride}
                  showOverride={analyst}
                />
                <OutcomeBar lab={lab} />
                {analyst && heatmap}
                {analyst && <QuantGrid lab={lab} />}
                {!analyst && <RangeShift steps={lab.steps} />}
                <NextCards lab={lab} selected={whatIf} onSelect={setWhatIf} />
                {!analyst && (
                  <button
                    className="deeper"
                    onClick={() => onSettings({ mode: 'analyst' })}
                  >
                    <span>
                      <strong>Go deeper</strong>
                      <small>
                        Atlas&apos;s range grid, decision map, options and
                        insurance lenses
                      </small>
                    </span>
                    <ChevronDown size={16} />
                  </button>
                )}
              </>
            )}
            {activeTab === 'range' && (
              <RangeView spot={lab.full} model={settings.opponentModel} />
            )}
            {activeTab === 'options' && (
              <>
                {heatmap}
                <OptionsView lab={lab} />
              </>
            )}
            {activeTab === 'insurance' && (
              <>
                {heatmap}
                <ProtectionView lab={lab} onCoverage={setCoverage} />
              </>
            )}

            <button
              className="notes-toggle"
              aria-expanded={notes}
              onClick={() => setNotes(!notes)}
            >
              Model notes, uncertainty and limits
              <ChevronDown size={14} className={notes ? 'rotated' : ''} />
            </button>
            {notes && (
              <div className="notes">
                <p>
                  Atlas&apos;s range is inferred from its public actions and its
                  published strategy ({style} style), never from its cards. Each
                  action reweights every possible starting hand by how likely
                  Atlas was to take it. “Any hand” treats every unseen hand as
                  equally likely.
                </p>
                <p>
                  EV assumes no betting after this decision and no rake. Raise
                  EV uses Atlas&apos;s modeled fold chance and your equity
                  against the hands that continue; a manual fold assumption uses
                  the whole range. Re-raises are treated as calls.
                </p>
                <p>
                  Estimates are Monte Carlo: expect a point or two of noise,
                  more for single next cards. Optionality and protection are
                  structural analogies, not market prices or advice.
                </p>
                <p>
                  The all-in preview treats the selected exposure as terminal,
                  compresses ties into showdown equity, assumes a 1% cashout
                  fee, and treats two half-pot runouts as independent. Its Kelly
                  ceiling assumes the same known edge and payoff repeat
                  indefinitely. Real poker offers, shared-deck boards,
                  estimation error and changing opponents violate those
                  assumptions.
                </p>
              </div>
            )}
            <button
              className="lesson-link"
              onClick={() => onLesson(LESSON_FOR[activeTab])}
            >
              <span>
                <BookOpen size={15} /> Learn the idea behind this view
              </span>
              <ArrowUpRight size={15} />
            </button>
            <nav
              className="curriculum-connections"
              aria-label="Related curriculum modules"
            >
              <strong>Take this hand further</strong>
              {CONNECTIONS[activeTab].map(([id, label]) => (
                <a key={`${id}-${label}`} href={`#learn/module/${id}/learn`}>
                  {label} <ArrowUpRight size={14} />
                </a>
              ))}
              <small>
                Your hand pauses while you learn. These are teaching
                connections, not pricing equivalences.
              </small>
            </nav>
          </div>
        </>
      )}
      {expanded && (
        <Modal
          title={TITLES[activeTab === 'range' ? 'decision' : activeTab]}
          onClose={() => setExpanded(false)}
          wide
        >
          <div className="expanded-surface">
            <Suspense
              fallback={
                <div className="lab-loading">Building the 3D terrain…</div>
              }
            >
              <Surface3D
                lens={lens}
                scenario={lab.scenario}
                markerLabel={markerLabel}
              />
            </Suspense>
          </div>
          <p className="modal-note">
            Drag to rotate and point at the surface to inspect scenarios. The
            pulsing point is your hand; the faint grid is break-even.
          </p>
        </Modal>
      )}
    </aside>
  )
}
