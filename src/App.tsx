import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  CircleHelp,
  Coins,
  Diamond,
  GraduationCap,
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
import './poker-room.css'
import { FinancePanel } from './components/FinancePanel'
import { Modal } from './components/Modal'
import { Lessons } from './components/Lessons'

type Dialog = 'library' | 'stats' | 'history' | 'help' | 'settings' | null
const chips = (n: number) => n.toLocaleString('en-US')

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
  const [engineGame, setGame] = useState(guidedHand)
  const [lens, setLens] = useState<Lens>('equity')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [lesson, setLesson] = useState<Lens | null>(null)
  const [progress, setProgress] = useState(readProgress)
  const [paused, setPaused] = useState(false)
  const [showTip, setShowTip] = useState(true)
  const [raiseTo, setRaiseTo] = useState(100)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [sound, setSound] = useState(false)
  const [fast, setFast] = useState(false)
  const [focus, setFocus] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)
  const presentation = useTablePresentation(
    engineGame,
    paused || dialog !== null,
    fast,
  )
  const game = presentation.game
  const unlockAudio = useTableSound(
    presentation,
    sound,
    paused || dialog !== null,
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
    game.turn === 0 && !game.result && !paused && !presentation.busy && !dialog
  const betAmount = Math.max(
    legal.minRaiseTo,
    Math.min(legal.maxRaiseTo, raiseTo),
  )
  const activeRecords = progress.hands.filter((h) =>
    h.id.startsWith(sessionId.current),
  )
  const sessionNet = activeRecords.reduce((sum, hand) => sum + hand.net, 0)

  useEffect(() => {
    if (game.turn !== 1 || game.result || paused || presentation.busy || dialog)
      return
    const timeout = window.setTimeout(
      () => setGame(act(game, botAction(game))),
      fast ? 600 : 1300,
    )
    return () => window.clearTimeout(timeout)
  }, [game, paused, presentation.busy, fast, dialog])

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
    setStorageAvailable(saveProgress(progress))
  }, [progress])

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
    <div className="decision-room-app">
      <header className="site-header">
        <a href="#table" className="brand" aria-label="QuantPoker home">
          <span className="brand-icon">
            <Spade size={22} fill="currentColor" />
          </span>
          <span>
            quant<span className="brand-light">poker</span>
            <sup>β</sup>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className={!dialog || dialog === 'history' ? 'nav-active' : ''}
            onClick={() => setDialog(null)}
          >
            <Diamond size={15} /> Play & learn
          </button>
          <button
            className={dialog === 'library' ? 'nav-active' : ''}
            onClick={() => openLesson(null)}
          >
            <BookOpen size={15} /> Learning library
          </button>
          <button
            className={dialog === 'stats' ? 'nav-active' : ''}
            onClick={() => setDialog('stats')}
          >
            <ChartNoAxesCombined size={15} /> Your progress
          </button>
        </nav>
        <div className="header-right">
          <span className="practice-pill">
            <i /> PLAY MONEY ONLY
          </span>
          <button
            className="profile-button"
            onClick={() => setDialog('stats')}
            aria-label="View your progress"
          >
            You
          </button>
        </div>
      </header>
      <main
        id="table"
        className={`workspace ${focus ? 'workspace-focus' : ''}`}
      >
        <section className="game-column" aria-label="Poker table">
          <div className="workspace-heading">
            <div>
              <div className="breadcrumb">
                THE DECISION ROOM <ChevronRight size={12} /> NO-LIMIT HOLD’EM
              </div>
              <h1>
                Make your next move
                <span>.</span>
              </h1>
              <p>Read the table. Trust the math. Play the moment.</p>
            </div>
            <button className="how-button" onClick={() => setDialog('help')}>
              <CircleHelp size={15} /> How it works
            </button>
          </div>
          <PokerTable
            game={game}
            frame={presentation}
            busy={presentation.busy}
            paused={paused}
            yourTurn={yourTurn}
            betAmount={betAmount}
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
            focus={focus}
            onFocus={() => setFocus(!focus)}
            onUnlock={unlockAudio}
            shortcuts={shortcuts}
            dialogOpen={dialog !== null}
          />
          {showTip && (
            <div className="below-table-tip">
              <span className="tip-bulb">
                <Lightbulb size={18} />
              </span>
              <div>
                <strong>
                  {game.guided
                    ? 'Start with a little intuition.'
                    : 'The best players think beyond one hand.'}
                </strong>
                <p>
                  {game.guided
                    ? 'Your first hand is a curated draw. Watch the Finance Lens as you play—then try randomly dealt hands.'
                    : 'Look at the expected value before the result. A thoughtful decision can still lose, and that’s okay.'}
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Dismiss table tip"
                onClick={() => setShowTip(false)}
              >
                <X size={15} />
              </button>
            </div>
          )}
          <div className="session-strip">
            <div>
              <span className="session-icon">
                <Coins size={18} />
              </span>
              <span>
                Session net
                <strong className={sessionNet < 0 ? 'negative' : ''}>
                  {sessionNet >= 0 ? '+' : '−'}
                  {chips(Math.abs(sessionNet))} <small>chips</small>
                </strong>
              </span>
            </div>
            <span className="strip-divider" />
            <div>
              <span className="session-icon">
                <ChartNoAxesCombined size={18} />
              </span>
              <span>
                Hands played<strong>{activeRecords.length}</strong>
              </span>
            </div>
            <span className="strip-divider" />
            <button onClick={() => openLesson(null)}>
              <span className="session-icon">
                <GraduationCap size={19} />
              </span>
              <span>
                Ideas explored
                <strong>
                  {progress.lessons.length} <small>/ 3</small>
                </strong>
              </span>
              <ChevronRight size={15} />
            </button>
          </div>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {!storageAvailable && (
            <p className="notice">
              Browser storage is unavailable. Progress is kept only until you
              leave this page.
            </p>
          )}
        </section>
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
      </main>
      <footer className="site-footer">
        <span>
          <Spade size={12} fill="currentColor" /> A better feel for risk.
        </span>
        <span>
          For learning, not financial advice.{' '}
          <span className="footer-dot">·</span> No deposits. No withdrawals.
          Just practice.
        </span>
        <button onClick={() => setDialog('help')}>
          Made for the curious <ArrowUpRight size={12} />
        </button>
      </footer>
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
            Your learning progress, saved on this device.
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
              <Check size={14} /> Stored on this device only
            </span>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    'Clear saved lesson progress and hand results? Your current hand will not change.',
                  )
                )
                  setProgress({ hands: [], lessons: [] })
              }}
            >
              <RotateCcw size={13} /> Clear saved progress
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
