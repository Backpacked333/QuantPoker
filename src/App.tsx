import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import {
  BookOpen,
  ChartNoAxesCombined,
  ChevronUp,
  CircleHelp,
  Coins,
  Diamond,
  Gauge,
  GraduationCap,
  Lightbulb,
  Lock,
  Monitor,
  Moon,
  Settings2,
  Spade,
  Sun,
  Target,
  X,
} from 'lucide-react'
import { atlasDecision } from './lib/atlas'
import type { DecisionAction } from './lib/finance'
import { gradeDecision } from './lib/grading'
import type { DecisionGrade } from './lib/grading'
import { heroContext, raiseAnalysis, spotOutcome } from './lib/model'
import { cardLabel, legalActions } from './lib/poker'
import type { Action, Game } from './lib/poker'
import type { FullSpot } from './lib/range'
import { playSound } from './lib/sound'
import type { SoundKind } from './lib/sound'
import { emptyProgress, readProgress, saveProgress } from './lib/storage'
import type {
  DecisionRecord,
  HandRecord,
  LessonId,
  Progress,
  Settings,
} from './lib/storage'
import { useMediaQuery } from './hooks'
import { spotKey, useSpots } from './state/spots'
import { guessKey, initialTrainer, trainerReducer } from './state/trainer'
import type { FinishedHand } from './state/trainer'
import { Table } from './components/table/Table'
import { ActionBar } from './components/table/ActionBar'
import type { Preset } from './components/table/ActionBar'
import { Lab } from './components/lab/Lab'
import { HandReview } from './components/review/HandReview'
import { ProgressView } from './components/progress/ProgressView'
import { LearnView } from './components/learn/LearnView'
import {
  HelpDialog,
  HistoryDialog,
  SettingsDialog,
  WelcomeDialog,
} from './components/Dialogs'
import { Tour } from './components/Tour'
import type { TourStep } from './components/Tour'

type View = 'play' | 'learn' | 'progress'
type Dialog = 'settings' | 'help' | 'history' | null
const chips = (n: number) => Math.round(n).toLocaleString('en-US')
const toDecisionAction = (action: Action): DecisionAction =>
  action.type === 'fold'
    ? 'fold'
    : action.type === 'raise'
      ? 'raise'
      : 'continue'

function buildRecord(
  hand: FinishedHand,
  grades: DecisionGrade[],
  sessionId: string,
): HandRecord {
  const { game } = hand
  const result = game.result!
  const decisions: DecisionRecord[] = hand.decisions.map((d, i) => {
    const g = grades[i]
    const legal = legalActions(d.snapshot)
    return {
      street: d.snapshot.street as DecisionRecord['street'],
      action: d.action.type,
      amount:
        d.action.type === 'raise'
          ? d.action.to
          : d.action.type === 'call'
            ? legal.toCall
            : 0,
      pot: d.snapshot.pot,
      toCall: legal.toCall,
      grade: g.grade,
      evLost: g.evLost,
      accuracy: g.accuracy,
      chosenEV: g.chosen.ev,
      bestEV: g.best.ev,
      bestLabel: g.best.label,
      equity: g.equity,
      handClass: d.handClass,
      ...(d.guess !== undefined ? { guess: d.guess } : {}),
    }
  })
  const last = hand.decisions.length - 1
  return {
    id: `${sessionId}:${game.id}`,
    hand: game.id,
    net: result.net,
    result: result.text,
    guided: game.guided,
    at: Date.now(),
    expectedNet:
      last >= 0
        ? grades[last].chosen.ev - hand.decisions[last].snapshot.invested[0]
        : result.net,
    decisions,
    hero: game.cards[0].map(cardLabel),
    board: game.board.map(cardLabel),
    ...(result.showdown ? { villain: game.cards[1].map(cardLabel) } : {}),
    style: hand.style,
    showdown: result.showdown,
  }
}

const TIPS = [
  'Look at the price before the cards: what share of the final pot are you paying?',
  'A thoughtful decision can still lose. Judge it by expected value, not the result.',
  'Atlas’s bets are evidence. In Analyst mode, the Atlas range view shows how they reshape its likely hands.',
  'Bigger bets make Atlas fold more often but risk more when it calls. Compare the EV on each size preset.',
  'Your reads improve fastest when you commit to a number before looking.',
]

export default function App() {
  const [progress, setProgress] = useState<Progress>(readProgress)
  const settings = progress.settings
  const [trainer, dispatch] = useReducer(trainerReducer, undefined, () =>
    initialTrainer(!progress.guidedComplete, progress.settings.atlasStyle),
  )
  const { spots, request } = useSpots()
  const [view, setView] = useState<View>('play')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [lesson, setLesson] = useState<LessonId | null>(null)
  const [paused, setPaused] = useState(false)
  const [tour, setTour] = useState(false)
  const [storageOk, setStorageOk] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [tipHidden, setTipHidden] = useState(false)
  const [sizing, setSizing] = useState<{ id: string; to: number } | null>(null)
  const [guessDraft, setGuessDraft] = useState<{
    key: string
    value: number
  } | null>(null)
  const [reviewPick, setReviewPick] = useState<{
    id: number
    index: number
  } | null>(null)
  const sessionId = useRef(crypto.randomUUID())
  const labRef = useRef<HTMLDivElement>(null)
  const compact = useMediaQuery('(max-width: 940px)')
  const finePointer = useMediaQuery('(pointer: fine)')
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')

  const game = trainer.game
  const style = trainer.style
  const model = settings.opponentModel
  const welcome = !progress.onboarded
  const blocked = welcome || tour
  const legal = legalActions(game.turn === 0 ? game : { ...game, turn: 0 })
  const heroTurn = game.turn === 0 && !game.result && !paused
  const yourTurn = heroTurn && !blocked
  const updateSettings = useCallback(
    (patch: Partial<Settings>) =>
      setProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } })),
    [],
  )
  const sound = useCallback(
    (kind: SoundKind) => {
      if (settings.sound && !playSound(kind)) updateSettings({ sound: false })
    },
    [settings.sound, updateSettings],
  )

  // ---- Theme and persistence ---------------------------------------------
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = settings.theme
  }, [settings.theme])
  const themeKey =
    settings.theme === 'system'
      ? prefersDark
        ? 'dark'
        : 'light'
      : settings.theme
  useEffect(() => {
    setStorageOk(saveProgress(progress))
  }, [progress])

  // ---- Analysis requests ---------------------------------------------------
  const liveKey = spotKey(game, style)
  useEffect(() => {
    if (!game.result) request(game, style)
  }, [game, style, request])
  const liveSpot = spots.get(liveKey)
  const liveFull = liveSpot?.stage === 'full' ? liveSpot : null

  // ---- Atlas ----------------------------------------------------------------
  useEffect(() => {
    if (game.turn !== 1 || game.result || paused || blocked) return
    const base =
      settings.speed === 'fast'
        ? 120
        : settings.speed === 'relaxed'
          ? 1500
          : 750
    const spread =
      settings.speed === 'fast' ? 80 : settings.speed === 'relaxed' ? 900 : 650
    const timer = window.setTimeout(
      () => dispatch({ type: 'atlas', decision: atlasDecision(game, style) }),
      base + Math.random() * spread,
    )
    return () => window.clearTimeout(timer)
  }, [game, style, paused, blocked, settings.speed])
  useEffect(() => {
    if (!trainer.bubble) return
    const timer = window.setTimeout(
      () => dispatch({ type: 'clearBubble' }),
      2800,
    )
    return () => window.clearTimeout(timer)
  }, [trainer.bubble])

  // ---- Sounds on table transitions -------------------------------------------
  const lastGame = useRef<Game>(game)
  useEffect(() => {
    const before = lastGame.current
    lastGame.current = game
    if (before === game) return
    if (before.id !== game.id || game.board.length > before.board.length)
      sound('deal')
    if (game.result && !before.result) {
      const won = game.result.net >= 0
      window.setTimeout(() => sound(won ? 'win' : 'lose'), 380)
      return
    }
    const last = game.history[game.history.length - 1]
    if (
      before.id === game.id &&
      last &&
      game.history.length > before.history.length
    )
      sound(
        last.action === 'fold'
          ? 'fold'
          : last.action === 'check'
            ? 'check'
            : 'chip',
      )
  }, [game, sound])

  // ---- Guess first -------------------------------------------------------------
  const currentGuessKey = guessKey(game)
  const guessEntry = trainer.guesses[currentGuessKey]
  const guessPending =
    settings.guessFirst && !game.result && guessEntry === undefined
  const guessValue =
    guessDraft?.key === currentGuessKey ? guessDraft.value : 0.5
  const liveOutcome = liveFull ? spotOutcome(liveFull, 'range') : null
  const lockGuess = useCallback(
    () => dispatch({ type: 'guess', value: guessValue }),
    [guessValue],
  )

  // ---- Bet sizing and live action math ---------------------------------------
  const decisionId = `${game.id}:${game.history.length}`
  const context = heroContext(game)
  const presets: Preset[] = useMemo(() => {
    if (!legal.canRaise) return []
    const current = Math.max(...game.bets)
    const base = context.pot + context.toCall
    return [
      { label: '½ pot', key: '1', to: Math.round(current + base / 2) },
      { label: '¾ pot', key: '2', to: Math.round(current + (base * 3) / 4) },
      { label: 'Pot', key: '3', to: Math.round(current + base) },
      { label: 'All-in', key: '4', to: legal.maxRaiseTo },
    ].map((preset) => {
      const to = Math.min(
        legal.maxRaiseTo,
        Math.max(legal.minRaiseTo, preset.to),
      )
      return liveFull
        ? {
            ...preset,
            to,
            ev: raiseAnalysis(
              liveFull,
              model,
              {
                pot: context.pot,
                heroBet: context.heroBet,
                atlasBet: context.atlasBet,
                raiseTo: to,
              },
              style,
            ).ev,
          }
        : { ...preset, to }
    })
  }, [
    legal.canRaise,
    legal.maxRaiseTo,
    legal.minRaiseTo,
    game.bets,
    context.pot,
    context.toCall,
    context.heroBet,
    context.atlasBet,
    liveFull,
    model,
    style,
  ])
  const defaultRaise = presets[0]?.to ?? legal.minRaiseTo
  const raiseTo = Math.min(
    legal.maxRaiseTo,
    Math.max(
      legal.minRaiseTo,
      sizing?.id === decisionId ? sizing.to : defaultRaise,
    ),
  )
  const setRaiseTo = (to: number) => setSizing({ id: decisionId, to })
  const actionMath = useMemo(() => {
    const outcome = liveFull ? spotOutcome(liveFull, model) : null
    const callEV = outcome
      ? outcome.equity * context.pot - (1 - outcome.equity) * context.toCall
      : undefined
    const raise =
      liveFull && legal.canRaise
        ? raiseAnalysis(
            liveFull,
            model,
            {
              pot: context.pot,
              heroBet: context.heroBet,
              atlasBet: context.atlasBet,
              raiseTo,
            },
            style,
          )
        : null
    const options: ['fold' | 'continue' | 'raise', number][] = []
    if (context.toCall) options.push(['fold', 0])
    if (callEV !== undefined) options.push(['continue', callEV])
    if (raise) options.push(['raise', raise.ev])
    const best = options.length
      ? options.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
      : undefined
    return {
      revealed: !guessPending,
      ready: !!outcome,
      equity: outcome?.equity,
      breakEven: context.toCall
        ? context.toCall / (context.pot + context.toCall)
        : 0,
      callEV,
      raiseEV: raise?.ev,
      foldProbability: raise?.foldProbability,
      bestKind: best,
    }
  }, [
    liveFull,
    model,
    context.pot,
    context.toCall,
    context.heroBet,
    context.atlasBet,
    legal.canRaise,
    raiseTo,
    style,
    guessPending,
  ])

  const heroAct = useCallback(
    (kind: 'fold' | 'continue' | 'raise') => {
      if (!yourTurn) return
      if (kind === 'raise' && !legal.canRaise) return
      const action: Action =
        kind === 'fold'
          ? { type: 'fold' }
          : kind === 'continue'
            ? { type: legal.canCheck ? 'check' : 'call' }
            : { type: 'raise', to: raiseTo }
      dispatch({ type: 'hero', action })
    },
    [yourTurn, legal.canRaise, legal.canCheck, raiseTo],
  )

  // ---- Review and recording ---------------------------------------------------
  const reviewing = !!game.result
  const decisions = trainer.decisions
  const grades = useMemo(
    () =>
      decisions.map((d) => {
        const spot = spots.get(d.key)
        return spot?.stage === 'full'
          ? gradeDecision(d.snapshot, d.action, spot, style)
          : null
      }),
    [decisions, spots, style],
  )
  const reviewIndex =
    reviewPick?.id === game.id
      ? Math.min(reviewPick.index, decisions.length - 1)
      : decisions.length - 1
  useEffect(() => {
    for (const hand of trainer.finished) {
      const found = hand.decisions.map((d) => {
        const spot = spots.get(d.key)
        if (!spot) request(d.snapshot, hand.style)
        return spot?.stage === 'full' ? (spot as FullSpot) : null
      })
      if (found.some((s) => !s)) continue
      const handGrades = hand.decisions.map((d, i) =>
        gradeDecision(d.snapshot, d.action, found[i]!, hand.style),
      )
      const record = buildRecord(hand, handGrades, sessionId.current)
      setProgress((p) =>
        p.hands.some((h) => h.id === record.id)
          ? p
          : { ...p, hands: [...p.hands, record].slice(-100) },
      )
      dispatch({ type: 'recorded', id: hand.game.id })
    }
  }, [trainer.finished, spots, request])

  // ---- Dealing -------------------------------------------------------------------
  const deal = useCallback(() => {
    if (!game.result) return
    if (trainer.guidedStep === 3)
      setProgress((p) => ({ ...p, guidedComplete: true }))
    dispatch({ type: 'deal', style: settings.atlasStyle })
    setPaused(false)
    setSheetOpen(false)
  }, [game.result, trainer.guidedStep, settings.atlasStyle])
  const skipGuided = () => {
    setProgress((p) => ({ ...p, guidedComplete: true }))
    dispatch({ type: 'skipGuided', style: settings.atlasStyle })
  }
  const showReview = () => {
    if (compact) setSheetOpen(true)
    else labRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ---- Keyboard --------------------------------------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || dialog || blocked)
        return
      if (view !== 'play') return
      const target = event.target as HTMLElement
      if (
        target.closest(
          'textarea, select, [contenteditable="true"], input:not([type="range"])',
        )
      )
        return
      const key = event.key.toLowerCase()
      if (key === 'enter') {
        if (target.tagName === 'BUTTON') return
        if (game.result) deal()
        else if (guessPending && yourTurn) lockGuess()
        else return
        event.preventDefault()
        return
      }
      if (key === '?') setDialog('help')
      else if (key === 'p') setPaused((p) => !p)
      else if (key === 'f' && legal.toCall) heroAct('fold')
      else if (key === 'c') heroAct('continue')
      else if (key === 'r' || key === 'b') heroAct('raise')
      else if (['1', '2', '3', '4'].includes(key) && yourTurn) {
        const preset = presets.find((p) => p.key === key)
        if (preset) setSizing({ id: decisionId, to: preset.to })
      } else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    dialog,
    blocked,
    view,
    game.result,
    deal,
    guessPending,
    yourTurn,
    lockGuess,
    heroAct,
    legal.toCall,
    presets,
    decisionId,
  ])

  // ---- Lab inputs (live or a frozen review snapshot) ------------------------------
  const reviewDecision =
    reviewing && reviewIndex >= 0 ? decisions[reviewIndex] : null
  const labGame = reviewDecision?.snapshot ?? game
  const labSpot = reviewDecision ? spots.get(reviewDecision.key) : liveSpot
  let labRaise = raiseTo
  if (reviewDecision) {
    const snap = legalActions(reviewDecision.snapshot)
    labRaise =
      reviewDecision.action.type === 'raise'
        ? reviewDecision.action.to
        : Math.min(
            snap.maxRaiseTo,
            Math.max(
              snap.minRaiseTo,
              Math.round(
                Math.max(...reviewDecision.snapshot.bets) +
                  (reviewDecision.snapshot.pot + snap.toCall) / 2,
              ),
            ),
          )
  }
  const labLocked = guessPending && !reviewing
  const labGuess =
    reviewDecision?.guess ??
    (!reviewing && typeof guessEntry === 'number' ? guessEntry : undefined)
  const review = reviewing ? (
    <HandReview
      game={game}
      decisions={decisions}
      grades={grades}
      selected={Math.max(0, reviewIndex)}
      onSelect={(index) => setReviewPick({ id: game.id, index })}
    />
  ) : null

  // ---- Session summary ---------------------------------------------------------------
  const session = progress.hands.filter((h) =>
    h.id.startsWith(sessionId.current),
  )
  const sessionNet = session.reduce((s, h) => s + h.net, 0)
  const sessionDecisions = session.flatMap((h) => h.decisions ?? [])
  const sessionAccuracy = sessionDecisions.length
    ? sessionDecisions.reduce((s, d) => s + d.accuracy, 0) /
      sessionDecisions.length
    : null
  const reads = sessionDecisions.filter((d) => d.guess !== undefined)
  const readError = reads.length
    ? reads.reduce((s, d) => s + Math.abs(d.guess! - d.equity), 0) /
      reads.length
    : null

  const tourSteps: TourStep[] = [
    {
      target: 'table',
      title: 'Your table',
      body: 'Heads-up Hold’em against Atlas. The first three hands are guided setups; after that every hand is shuffled.',
    },
    {
      target: 'guess',
      title: 'Make your read first',
      body: 'Before the math appears, guess how often your hand wins. Lock it in, then see how close you were.',
    },
    {
      target: 'actions',
      title: 'Act with conviction',
      body: 'Fold, call or raise. Once you have made your read, the ring shows your equity against the price. Keyboard: F, C, R.',
    },
    {
      target: 'lab',
      title: 'The quant lab',
      body: 'Every option priced in chips, how Atlas’s actions reshape its likely hands, and what the next card could do.',
    },
    {
      target: 'progress',
      title: 'Track real improvement',
      body: 'Decision accuracy and read calibration, with luck separated out. Results are noisy; decisions are what you control.',
    },
  ]

  const handAccuracy =
    grades.length && grades.every(Boolean)
      ? Math.round(grades.reduce((s, g) => s + g!.accuracy, 0) / grades.length)
      : null
  const sheetSummary = labLocked ? (
    <span className="sheet-summary">
      <Lock size={14} /> Make your read to open the lab
    </span>
  ) : reviewing ? (
    <span className="sheet-summary">
      <Target size={14} /> Hand review
      {handAccuracy !== null ? ` · accuracy ${handAccuracy}` : ''}
    </span>
  ) : (
    <span className="sheet-summary">
      <Gauge size={14} />
      {actionMath.ready
        ? `Equity ${Math.round((actionMath.equity ?? 0) * 100)}%${context.toCall ? ` · need ${Math.round(actionMath.breakEven * 100)}%` : ''}`
        : 'Reading the spot…'}
    </span>
  )

  const lab = (
    <Lab
      game={labGame}
      spot={labSpot}
      style={style}
      settings={settings}
      raiseTo={labRaise}
      playedAction={
        reviewDecision ? toDecisionAction(reviewDecision.action) : undefined
      }
      locked={labLocked}
      guess={labGuess}
      reviewing={reviewing}
      review={review}
      themeKey={themeKey}
      resetKey={
        reviewDecision
          ? `review-${game.id}-${reviewIndex}`
          : `live-${decisionId}`
      }
      onSettings={updateSettings}
      onReveal={() => dispatch({ type: 'guess', value: null })}
      onLesson={(id) => {
        setLesson(id)
        setView('learn')
        setSheetOpen(false)
      }}
    />
  )

  const ThemeIcon =
    settings.theme === 'dark'
      ? Moon
      : settings.theme === 'light'
        ? Sun
        : Monitor
  const nextTheme: Settings['theme'] =
    settings.theme === 'system'
      ? 'light'
      : settings.theme === 'light'
        ? 'dark'
        : 'system'

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="header">
        <button
          className="brand"
          onClick={() => setView('play')}
          aria-label="QuantPoker, back to the table"
        >
          <span className="brand-mark">
            <Spade size={18} fill="currentColor" />
          </span>
          <span>
            quant<span className="brand-light">poker</span>
          </span>
        </button>
        <nav className="nav" aria-label="Main">
          {(
            [
              ['play', 'Play', Diamond],
              ['learn', 'Learn', BookOpen],
              ['progress', 'Progress', ChartNoAxesCombined],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              className={view === key ? 'on' : ''}
              aria-current={view === key ? 'page' : undefined}
              data-tour={key === 'progress' ? 'progress' : undefined}
              onClick={() => {
                setView(key)
                if (key === 'learn') setLesson(null)
              }}
            >
              <Icon size={15} /> <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="header-tools">
          <span className="pill">
            <i /> Play money
          </span>
          <button
            className="icon-btn header-theme"
            onClick={() => updateSettings({ theme: nextTheme })}
            aria-label={`Theme: ${settings.theme}. Switch to ${nextTheme}.`}
            title={`Theme: ${settings.theme}`}
          >
            <ThemeIcon size={17} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setDialog('help')}
            aria-label="How it works"
            title="How it works (?)"
          >
            <CircleHelp size={17} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setDialog('settings')}
            aria-label="Settings"
            title="Settings"
          >
            <Settings2 size={17} />
          </button>
        </div>
      </header>

      <main id="main">
        {view === 'play' && (
          <div className="workspace">
            <section className="play-column" aria-label="Play">
              <Table
                game={game}
                style={style}
                bubble={trainer.bubble}
                paused={paused}
                yourTurn={yourTurn}
                guidedStep={trainer.guidedStep}
                showBubbles={settings.atlasVoice}
                onTogglePause={() => setPaused(!paused)}
                onHistory={() => setDialog('history')}
                onSettings={() => setDialog('settings')}
                onSkipGuided={skipGuided}
              />
              <ActionBar
                game={game}
                legal={legal}
                yourTurn={yourTurn}
                heroTurn={heroTurn}
                paused={paused}
                raiseTo={raiseTo}
                presets={presets}
                math={actionMath}
                shortcuts={finePointer}
                guess={{
                  show: guessPending || typeof guessEntry === 'number',
                  value: guessValue,
                  locked:
                    typeof guessEntry === 'number'
                      ? {
                          guess: guessEntry,
                          actual: liveOutcome?.equity ?? null,
                        }
                      : null,
                  onChange: (value) =>
                    setGuessDraft({ key: currentGuessKey, value }),
                  onLock: lockGuess,
                  onSkip: () => dispatch({ type: 'guess', value: null }),
                }}
                onRaiseTo={setRaiseTo}
                onAct={heroAct}
                onDeal={deal}
                onReview={showReview}
              />
              {trainer.notice && (
                <p className="notice" role="status">
                  <span>{trainer.notice}</span>
                  <button
                    className="icon-btn"
                    aria-label="Dismiss"
                    onClick={() => dispatch({ type: 'clearNotice' })}
                  >
                    <X size={14} />
                  </button>
                </p>
              )}
              {!storageOk && (
                <p className="notice">
                  Browser storage is unavailable. Progress lasts only until you
                  leave this page.
                </p>
              )}
              <div className="session">
                <div>
                  <Coins size={17} />
                  <span>
                    Session
                    <strong className={sessionNet < 0 ? 'negative' : ''}>
                      {sessionNet >= 0 ? '+' : '−'}
                      {chips(Math.abs(sessionNet))}
                    </strong>
                  </span>
                </div>
                <div>
                  <Gauge size={17} />
                  <span>
                    Accuracy
                    <strong>
                      {sessionAccuracy === null
                        ? '—'
                        : Math.round(sessionAccuracy)}
                    </strong>
                  </span>
                </div>
                <div>
                  <Target size={17} />
                  <span>
                    Read error
                    <strong>
                      {readError === null
                        ? '—'
                        : `±${Math.round(readError * 100)}`}
                    </strong>
                  </span>
                </div>
                <button
                  onClick={() => {
                    setLesson(null)
                    setView('learn')
                  }}
                >
                  <GraduationCap size={17} />
                  <span>
                    Lessons
                    <strong>
                      {progress.lessons.length}
                      <small>/6</small>
                    </strong>
                  </span>
                </button>
              </div>
              {settings.hints && !tipHidden && (
                <div className="tip">
                  <Lightbulb size={17} />
                  <p>{TIPS[game.id % TIPS.length]}</p>
                  <button
                    className="icon-btn"
                    aria-label="Hide tip"
                    onClick={() => setTipHidden(true)}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </section>
            {compact ? (
              <div className={`sheet ${sheetOpen ? 'open' : ''}`} ref={labRef}>
                <button
                  className="sheet-handle"
                  aria-expanded={sheetOpen}
                  aria-controls="sheet-body"
                  data-tour="lab"
                  onClick={() => setSheetOpen(!sheetOpen)}
                >
                  <span className="grabber" />
                  {sheetSummary}
                  <ChevronUp size={16} className={sheetOpen ? 'rotated' : ''} />
                </button>
                <div id="sheet-body" className="sheet-body" hidden={!sheetOpen}>
                  {lab}
                </div>
              </div>
            ) : (
              <div className="lab-column" ref={labRef}>
                {lab}
              </div>
            )}
          </div>
        )}
        {view === 'learn' && (
          <LearnView
            selected={lesson}
            completed={progress.lessons}
            onSelect={(id) => {
              setLesson(id)
              window.scrollTo({ top: 0 })
            }}
            onComplete={(id) =>
              setProgress((p) =>
                p.lessons.includes(id)
                  ? p
                  : { ...p, lessons: [...p.lessons, id] },
              )
            }
            onPlay={() => setView('play')}
          />
        )}
        {view === 'progress' && (
          <ProgressView
            progress={progress}
            sessionId={sessionId.current}
            onReplace={(next) => setProgress({ ...next, onboarded: true })}
            onClear={() =>
              setProgress((p) => ({
                ...emptyProgress(),
                settings: p.settings,
                onboarded: true,
                guidedComplete: p.guidedComplete,
              }))
            }
            onPlay={() => setView('play')}
          />
        )}
      </main>

      <footer className="footer">
        <span>
          <Spade size={12} fill="currentColor" /> A better feel for risk.
        </span>
        <span>
          For learning, not financial advice. No deposits, no withdrawals. Just
          practice.
        </span>
      </footer>

      {dialog === 'settings' && (
        <SettingsDialog
          settings={settings}
          onChange={updateSettings}
          onClose={() => setDialog(null)}
          onReplayGuided={() => {
            dispatch({ type: 'startGuided' })
            setDialog(null)
            setView('play')
          }}
        />
      )}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
      {dialog === 'history' && (
        <HistoryDialog game={game} onClose={() => setDialog(null)} />
      )}
      {welcome && (
        <WelcomeDialog
          onChoose={(mode) => {
            setProgress((p) => ({
              ...p,
              onboarded: true,
              settings: { ...p.settings, mode },
            }))
            setView('play')
            setTour(true)
          }}
        />
      )}
      {tour && view === 'play' && (
        <Tour
          steps={tourSteps.filter(
            (s) => s.target !== 'guess' || settings.guessFirst,
          )}
          onDone={() => setTour(false)}
        />
      )}
    </>
  )
}
