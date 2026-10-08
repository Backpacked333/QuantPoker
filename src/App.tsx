import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  ChartNoAxesCombined,
  Check,
  CircleHelp,
  Cloud,
  Diamond,
  Keyboard,
  Lightbulb,
  Pause,
  RotateCcw,
  Sparkles,
  Spade,
  X,
} from 'lucide-react'
import {
  act,
  botAction,
  guidedHand,
  legalActions,
  newHand,
  other,
} from './lib/poker'
import type { Action, EquityAnalysis, Game } from './lib/poker'
import type { Lens } from './lib/finance'
import { readProgress, saveProgress } from './lib/storage'
import { PokerTable } from './components/PokerTable'
import { useTablePresentation } from './lib/use-table-presentation'
import { useTableSound } from './lib/use-table-sound'
import './game.css'
import { FinancePanel } from './components/FinancePanel'
import { Modal } from './components/Modal'
import { Lessons } from './components/Lessons'
import { AccountPanel } from './components/AccountPanel'
import { useCloud } from './lib/cloud-context'
import { mergeProgress } from './lib/cloud-data'

type Dialog =
  | 'library'
  | 'stats'
  | 'history'
  | 'help'
  | 'settings'
  | 'account'
  | null
const chips = (n: number) => n.toLocaleString('en-US')
const wideLayoutQuery = '(min-width: 1100px)'
const subscribeLayout = (listener: () => void) => {
  const media = window.matchMedia(wideLayoutQuery)
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}
const getWideLayout = () => window.matchMedia(wideLayoutQuery).matches

function useEquity(game: Game) {
  const key = JSON.stringify({ hole: game.cards[0], board: game.board })
  const [estimate, setEstimate] = useState<{
    key: string
    analysis: EquityAnalysis
  } | null>(null)
  useEffect(() => {
    const worker = new Worker(
      new URL('./lib/equity.worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.onmessage = (
      e: MessageEvent<{ key: string; analysis: EquityAnalysis }>,
    ) => setEstimate(e.data)
    worker.postMessage({ key, ...JSON.parse(key) })
    return () => worker.terminate()
  }, [key])
  return estimate?.key === key ? estimate.analysis : null
}

export default function App() {
  const cloud = useCloud()
  const cloudStore = cloud?.state.user ? cloud.store : null
  const cloudProgress = cloud?.state.cache.progress
  const cloudSettings = cloud?.state.cache.settings
  const [engineGame, setGame] = useState(guidedHand)
  const [lens, setLens] = useState<Lens>('equity')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [lesson, setLesson] = useState<Lens | null>(null)
  const [progress, setProgress] = useState(
    () => cloudStore?.snapshot().cache.progress ?? readProgress(),
  )
  const [paused, setPaused] = useState(false)
  const [showTip, setShowTip] = useState(true)
  const [raiseTo, setRaiseTo] = useState(100)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [progressError, setProgressError] = useState('')
  const [clearing, setClearing] = useState(false)
  const [sound, setSound] = useState(
    cloudStore?.snapshot().cache.settings.sound ?? false,
  )
  const [fast, setFast] = useState(
    cloudStore?.snapshot().cache.settings.fast ?? false,
  )
  const wideLayout = useSyncExternalStore(
    subscribeLayout,
    getWideLayout,
    () => false,
  )
  const [desktopAnalysisOpen, setDesktopAnalysisOpen] = useState(true)
  const [mobileAnalysisOpen, setMobileAnalysisOpen] = useState(false)
  const analysisOpen = wideLayout ? desktopAnalysisOpen : mobileAnalysisOpen
  const analysisModal = analysisOpen && !wideLayout
  function setAnalysisOpen(open: boolean) {
    if (wideLayout) setDesktopAnalysisOpen(open)
    else setMobileAnalysisOpen(open)
  }
  const analysisDialog = useRef<HTMLDialogElement>(null)
  const focusAnalysisOnOpen = useRef(false)
  useEffect(() => {
    const element = analysisDialog.current
    if (!element) return
    element.close()
    if (analysisOpen) {
      // A docked panel must not steal focus or make the table inert.
      if (wideLayout) element.open = true
      else element.showModal()
      if (focusAnalysisOnOpen.current) {
        element.focus()
        focusAnalysisOnOpen.current = false
      }
    }
    return () => element.close()
  }, [analysisOpen, wideLayout])
  const [shortcuts, setShortcuts] = useState(false)
  const presentation = useTablePresentation(
    engineGame,
    paused || dialog !== null || analysisModal,
    fast,
  )
  const game = presentation.game
  const unlockAudio = useTableSound(
    presentation,
    sound,
    paused || dialog !== null || analysisModal,
  )
  const [notice, setNotice] = useState('')
  const [lastDecision, setLastDecision] = useState<{
    game: Game
    action: Action
    raiseTo: number
  } | null>(null)
  const sessionId = useRef(crypto.randomUUID())
  const review =
    game.result && lastDecision?.game.id === game.id ? lastDecision : null
  const analysis = useEquity(review?.game ?? game)
  const legal = legalActions(game)
  const yourTurn =
    game.turn === 0 &&
    !game.result &&
    !paused &&
    !presentation.busy &&
    !dialog &&
    !analysisModal
  const betAmount = Math.max(
    legal.minRaiseTo,
    Math.min(legal.maxRaiseTo, raiseTo),
  )
  const activeRecords = progress.hands.filter((h) =>
    h.id.startsWith(sessionId.current),
  )
  const sessionNet = activeRecords.reduce((sum, hand) => sum + hand.net, 0)

  useEffect(() => {
    if (
      game.turn !== 1 ||
      game.result ||
      paused ||
      presentation.busy ||
      dialog ||
      analysisModal
    )
      return
    const timeout = window.setTimeout(
      () => setGame(act(game, botAction(game))),
      fast ? 600 : 1300,
    )
    return () => window.clearTimeout(timeout)
  }, [game, paused, presentation.busy, fast, dialog, analysisModal])

  useEffect(() => {
    if (!game.result) return
    const result = game.result
    const id = `${sessionId.current}:${game.id}`
    setProgress((previous) =>
      previous.hands.some((h) => h.id === id)
        ? previous
        : {
            ...previous,
            hands: [
              ...previous.hands,
              {
                id,
                hand: game.id,
                net: result.net,
                result: result.text,
                guided: game.guided,
              },
            ].slice(-100),
          },
    )
  }, [game.id, game.result, game.guided])

  useEffect(() => {
    if (cloudStore) cloudStore.writeProgress(progress)
    else setStorageAvailable(saveProgress(progress))
  }, [progress, cloudStore])
  useEffect(() => {
    if (cloudStore && cloudProgress)
      setProgress((current) =>
        JSON.stringify(current) === JSON.stringify(cloudProgress)
          ? current
          : cloudProgress,
      )
  }, [cloudStore, cloudProgress])
  useEffect(() => {
    if (cloudStore && cloudSettings) {
      setSound(cloudSettings.sound)
      setFast(cloudSettings.fast)
    }
  }, [cloudStore, cloudSettings])
  useEffect(() => {
    if (cloudStore)
      cloudStore.writeSettings({
        ...cloudStore.snapshot().cache.settings,
        sound,
        fast,
      })
  }, [sound, fast, cloudStore])

  function choose(action: Action) {
    if (!yourTurn) return
    unlockAudio()
    setLastDecision({ game, action, raiseTo: betAmount })
    setGame(act(game, action))
    setNotice('')
  }

  function deal() {
    if (!game.result || presentation.busy) return
    unlockAudio()
    const rebuy = game.stacks.some((s) => s === 0)
    setGame(
      newHand(
        game.id + 1,
        rebuy ? [2000, 2000] : game.stacks,
        other(game.dealer),
      ),
    )
    setPaused(false)
    setRaiseTo(60)
    setNotice(
      rebuy
        ? 'Fresh practice stacks: 2,000 chips each. Session results are kept.'
        : '',
    )
  }

  function openLesson(value: Lens | null) {
    setLesson(value)
    setDialog('library')
  }

  return (
    <div className="qp-app">
      <header className="qp-top">
        <a href="#table" className="qp-brand" aria-label="QuantPoker home">
          <span className="qp-brand-mark">
            <Spade size={16} fill="currentColor" />
          </span>
          <span>
            quant<b>poker</b>
          </span>
        </a>
        <nav aria-label="Main navigation" className="qp-nav">
          <button
            aria-label="Play poker"
            className={!dialog || dialog === 'history' ? 'active' : ''}
            onClick={() => setDialog(null)}
          >
            <Diamond size={14} /> <span>Play</span>
          </button>
          <button
            aria-label="Learning library"
            className={dialog === 'library' ? 'active' : ''}
            onClick={() => openLesson(null)}
          >
            <BookOpen size={14} /> <span>Learn</span>
            <span className="qp-count">{progress.lessons.length}/3</span>
          </button>
          <button
            aria-label="Your progress"
            className={dialog === 'stats' ? 'active' : ''}
            onClick={() => setDialog('stats')}
          >
            <ChartNoAxesCombined size={14} /> <span>Progress</span>
          </button>
        </nav>
        <div className="qp-top-right">
          {cloud?.store.client && (
            <button
              className="qp-cloud"
              aria-label="Account and cloud saves"
              onClick={() => setDialog('account')}
            >
              <Cloud size={16} />
              <span>
                {cloud.state.status === 'loading'
                  ? 'Connecting'
                  : cloud.state.status === 'offline'
                    ? 'Sync paused'
                    : cloud.state.status === 'saving'
                      ? 'Saving…'
                      : cloud.state.user
                        ? 'Cloud saved'
                        : 'Save progress'}
              </span>
            </button>
          )}
          <span className="qp-session" aria-label="Session result">
            <span>Session</span>
            <strong
              className={sessionNet < 0 ? 'neg' : sessionNet > 0 ? 'pos' : ''}
            >
              {sessionNet >= 0 ? '+' : '−'}
              {chips(Math.abs(sessionNet))}
            </strong>
            <span>
              {activeRecords.length}{' '}
              {activeRecords.length === 1 ? 'hand' : 'hands'}
            </span>
          </span>
          <span className="qp-play-money">Play money</span>
          <button
            className="qp-icon"
            aria-label="How it works"
            onClick={() => setDialog('help')}
          >
            <CircleHelp size={17} />
          </button>
        </div>
      </header>
      <main
        id="table"
        className={`qp-main ${wideLayout && analysisOpen ? 'qp-with-analysis' : ''} ${analysisModal ? 'analysis-open' : ''}`}
      >
        <section className="qp-game" aria-label="Poker table">
          <PokerTable
            game={game}
            frame={presentation}
            busy={presentation.busy}
            paused={paused}
            yourTurn={yourTurn}
            betAmount={betAmount}
            analysis={analysis}
            onRaise={setRaiseTo}
            onAction={choose}
            onDeal={deal}
            onPause={() => setPaused(!paused)}
            onSettings={() => setDialog('settings')}
            onHistory={() => setDialog('history')}
            sound={sound}
            onSound={() => {
              unlockAudio()
              setSound(!sound)
            }}
            analysisOpen={analysisOpen}
            onToggleAnalysis={() => setAnalysisOpen(!analysisOpen)}
            onExplain={() => {
              if (analysisOpen) analysisDialog.current?.focus()
              else focusAnalysisOnOpen.current = true
              setAnalysisOpen(true)
            }}
            onUnlock={unlockAudio}
            shortcuts={shortcuts}
            dialogOpen={dialog !== null || analysisModal}
            tip={
              showTip
                ? game.guided && game.street === 'flop'
                  ? 'A flush draw, facing a bet. Is the price worth it? Compare your equity below.'
                  : 'Judge the decision, not the result. Good calls still lose sometimes.'
                : undefined
            }
            onDismissTip={() => setShowTip(false)}
            notice={
              notice ||
              (storageAvailable
                ? undefined
                : 'Browser storage is unavailable; progress lasts until you leave.')
            }
          />
        </section>
        <dialog
          ref={analysisDialog}
          id="hand-analysis"
          className={`qp-analysis ${wideLayout ? 'qp-analysis-docked' : ''}`}
          aria-label="Analysis and coach"
          aria-modal={analysisModal || undefined}
          tabIndex={-1}
          onCancel={() => setAnalysisOpen(false)}
          onClick={(event) => {
            if (wideLayout || event.target !== event.currentTarget) return
            const bounds = event.currentTarget.getBoundingClientRect()
            if (
              event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom
            )
              setAnalysisOpen(false)
          }}
        >
          <div className="qp-analysis-head">
            <strong>
              <BookOpen size={15} /> Learning studio
            </strong>
            <span>
              {analysisModal || paused
                ? 'Game paused · Take your time'
                : 'Live with this hand'}
            </span>
            <button
              className="qp-icon"
              aria-label="Close analysis"
              onClick={() => setAnalysisOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <FinancePanel
            key={`${game.id}-${game.result ? 'review' : 'live'}`}
            game={review?.game ?? game}
            analysis={analysis}
            raiseTo={review?.raiseTo ?? betAmount}
            playedAction={review?.action}
            settledResult={game.result}
            lens={lens}
            onLens={setLens}
            onLesson={openLesson}
          />
          <p className="qp-disclaimer">
            For learning, not financial advice · No deposits · No withdrawals
          </p>
        </dialog>
      </main>
      {dialog === 'library' && (
        <Modal
          title={
            lesson
              ? 'A little knowledge. A better decision.'
              : 'The learning library'
          }
          onClose={() => setDialog(null)}
          wide
        >
          {lesson && (
            <button className="back-link" onClick={() => setLesson(null)}>
              ← All lessons
            </button>
          )}
          <Lessons
            key={lesson ?? 'library'}
            selected={lesson}
            onSelect={setLesson}
            completed={progress.lessons}
            onComplete={(value) =>
              setProgress((previous) => ({
                ...previous,
                lessons: previous.lessons.includes(value)
                  ? previous.lessons
                  : [...previous.lessons, value],
              }))
            }
          />
        </Modal>
      )}
      {dialog === 'help' && (
        <Modal title="A seat at the table." onClose={() => setDialog(null)}>
          <div className="help-content">
            <p className="modal-intro">
              Play heads-up Hold’em at your own pace. Learn to read the odds as
              you play.
            </p>
            <div>
              <span>01</span>
              <section>
                <h3>Play a real hand</h3>
                <p>
                  You and Atlas each get two cards. Make the best five-card hand
                  using your cards and the five shared cards. Fold, check, call,
                  or raise through four betting rounds.
                </p>
              </section>
            </div>
            <div>
              <span>02</span>
              <section>
                <h3>See the mathematics</h3>
                <p>
                  The Finance Lens estimates your equity using only what you can
                  see. The 3D models reveal how risk and payoff change together.
                </p>
              </section>
            </div>
            <div>
              <span>03</span>
              <section>
                <h3>Connect the ideas</h3>
                <p>
                  Explore options and insurance, change the assumptions, and
                  check your intuition with short lessons. Analogies have
                  limits—we explain those too.
                </p>
              </section>
            </div>
            <div className="lesson-caveat">
              Heads-up no-limit Hold’em · blinds 10 / 20 · 2,000 starting chips
              · no rake. The first hand is a labeled teaching setup; every next
              hand is shuffled. Atlas is a simple practice bot, not a poker
              solver.
            </div>
            <h4>Hand rankings, strongest first</h4>
            <p>
              Straight flush → four of a kind → full house → flush → straight →
              three of a kind → two pair → one pair → high card.
            </p>
            <button className="primary-button" onClick={() => setDialog(null)}>
              Let’s play <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
      {dialog === 'settings' && (
        <Modal title="Your table, your pace." onClose={() => setDialog(null)}>
          <div className="settings-content">
            <button
              className="setting-row"
              onClick={() => {
                unlockAudio()
                setSound(!sound)
              }}
              aria-pressed={sound}
            >
              <span>
                <AudioLines size={19} />
                <span>
                  <strong>Table sounds</strong>
                  <small>
                    Cards, chips, and a winning hand. Off by default.
                  </small>
                </span>
              </span>
              <span className={`switch ${sound ? 'on' : ''}`} />
            </button>
            <button
              className="setting-row"
              onClick={() => setShowTip(!showTip)}
              aria-pressed={showTip}
            >
              <span>
                <Lightbulb size={19} />
                <span>
                  <strong>Learning hints</strong>
                  <small>Friendly reminders beneath the table.</small>
                </span>
              </span>
              <span className={`switch ${showTip ? 'on' : ''}`} />
            </button>
            <button
              className="setting-row"
              onClick={() => setPaused(!paused)}
              aria-pressed={paused}
            >
              <span>
                <Pause size={19} />
                <span>
                  <strong>Pause the table</strong>
                  <small>Read and explore without the bot acting.</small>
                </span>
              </span>
              <span className={`switch ${paused ? 'on' : ''}`} />
            </button>
            <button
              className="setting-row"
              onClick={() => setFast(!fast)}
              aria-pressed={fast}
            >
              <span>
                <RotateCcw size={19} />
                <span>
                  <strong>Quick play</strong>
                  <small>
                    Shorter deals, reveals, and opponent thinking time.
                  </small>
                </span>
              </span>
              <span className={`switch ${fast ? 'on' : ''}`} />
            </button>
            <button
              className="setting-row"
              onClick={() => setShortcuts(!shortcuts)}
              aria-pressed={shortcuts}
            >
              <span>
                <Keyboard size={19} />
                <span>
                  <strong>Keyboard actions</strong>
                  <small>
                    F to fold · C to check/call · R to bet/raise. Off by
                    default.
                  </small>
                </span>
              </span>
              <span className={`switch ${shortcuts ? 'on' : ''}`} />
            </button>
            <p className="modal-note">
              Reduced-motion preferences are respected automatically. Maximum
              bets require confirmation. No account required. Lesson completion
              and the last 100 hand results stay in this browser. Reloading
              starts a fresh table, not a saved hand.
            </p>
          </div>
        </Modal>
      )}
      {dialog === 'history' && (
        <Modal
          title={`Hand #${game.id} · Action history`}
          onClose={() => setDialog(null)}
        >
          <ol className="history-list">
            {game.log.map((entry, i) => (
              <li key={i}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                {entry}
              </li>
            ))}
          </ol>
          <p className="modal-note">
            Only the current hand’s actions are shown. Completed results are
            available in Your progress.
          </p>
        </Modal>
      )}
      {dialog === 'stats' && (
        <Modal
          title="Small decisions. Lasting intuition."
          onClose={() => setDialog(null)}
          wide
        >
          <p className="modal-intro">
            {cloudStore
              ? 'Your learning progress, saved to your private account. Showing your latest 100 hands.'
              : 'Your learning progress, saved on this device.'}
          </p>
          <div className="stats-summary">
            <div>
              <span>Hands recorded</span>
              <strong>{progress.hands.length}</strong>
              <small>Last 100, including guided hands</small>
            </div>
            <div>
              <span>Lessons completed</span>
              <strong>
                {progress.lessons.length}
                <em> / 3</em>
              </strong>
              <small>Answer a lesson’s question to complete it</small>
            </div>
            <div>
              <span>Recorded net result</span>
              <strong>
                {progress.hands.reduce((s, h) => s + h.net, 0) >= 0 ? '+' : ''}
                {chips(progress.hands.reduce((s, h) => s + h.net, 0))}
              </strong>
              <small>Play chips · not a skill rating</small>
            </div>
          </div>
          <h3 className="stats-heading">Your recent hands</h3>
          {progress.hands.length ? (
            <div className="results-list">
              {progress.hands
                .slice(-10)
                .reverse()
                .map((hand) => (
                  <div key={hand.id}>
                    <span
                      className={`result-icon ${hand.net >= 0 ? 'win' : ''}`}
                    >
                      {hand.net >= 0 ? (
                        <ArrowUpRight size={18} />
                      ) : (
                        <ArrowDownRight size={18} />
                      )}
                    </span>
                    <span>
                      <strong>{hand.result}</strong>
                      <small>
                        Hand #{hand.hand} ·{' '}
                        {hand.guided ? 'Guided setup' : 'Random deal'}
                      </small>
                    </span>
                    <b className={hand.net >= 0 ? 'positive' : 'negative'}>
                      {hand.net >= 0 ? '+' : ''}
                      {hand.net}
                    </b>
                  </div>
                ))}
            </div>
          ) : (
            <div className="empty-state">
              <Sparkles size={25} />
              <h3>Your first insight is one hand away.</h3>
              <p>Play a hand and your result will appear here.</p>
            </div>
          )}
          <div className="stats-bottom">
            <span>
              <Check size={14} />{' '}
              {cloudStore
                ? cloud?.state.status === 'offline'
                  ? 'Waiting to sync'
                  : 'Private cloud save'
                : 'Stored on this device only'}
            </span>
            <button
              disabled={clearing}
              onClick={async () => {
                if (
                  window.confirm(
                    'Clear saved lesson progress and hand results? Your current hand will not change.',
                  )
                ) {
                  setClearing(true)
                  setProgressError('')
                  try {
                    if (cloudStore) await cloudStore.clearProgress()
                    setProgress({ hands: [], lessons: [] })
                  } catch (cause) {
                    setProgressError(
                      cause instanceof Error
                        ? cause.message
                        : 'Could not clear progress.',
                    )
                  } finally {
                    setClearing(false)
                  }
                }
              }}
            >
              <RotateCcw size={13} /> Clear saved progress
            </button>
          </div>
          {progressError && <p role="alert">{progressError}</p>}
        </Modal>
      )}
      {dialog === 'account' && (
        <Modal title="Your learning account" onClose={() => setDialog(null)}>
          <AccountPanel
            onImport={() =>
              setProgress((previous) => mergeProgress(previous, readProgress()))
            }
          />
        </Modal>
      )}
    </div>
  )
}
