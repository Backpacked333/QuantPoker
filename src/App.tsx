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
  History,
  Lightbulb,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Spade,
  X,
} from 'lucide-react'
import {
  act,
  botAction,
  cardKey,
  evaluate,
  guidedHand,
  legalActions,
  newHand,
  other,
} from './lib/poker'
import type { Action, EquityAnalysis, Game } from './lib/poker'
import type { Lens } from './lib/finance'
import { readProgress, saveProgress } from './lib/storage'
import { PlayingCard } from './components/PlayingCard'
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
  const [game, setGame] = useState(guidedHand)
  const [lens, setLens] = useState<Lens>('equity')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [lesson, setLesson] = useState<Lens | null>(null)
  const [progress, setProgress] = useState(readProgress)
  const [paused, setPaused] = useState(false)
  const [showTip, setShowTip] = useState(true)
  const [raiseTo, setRaiseTo] = useState(100)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [sound, setSound] = useState(false)
  const [notice, setNotice] = useState('')
  const [lastDecision, setLastDecision] = useState<{
    game: Game
    action: Action
    raiseTo: number
  } | null>(null)
  const sessionId = useRef(crypto.randomUUID())
  const audio = useRef<AudioContext | null>(null)
  const review =
    game.result && lastDecision?.game.id === game.id ? lastDecision : null
  const analysis = useEquity(review?.game ?? game)
  const legal = legalActions(game)
  const yourTurn = game.turn === 0 && !game.result && !paused
  const betAmount = Math.max(
    legal.minRaiseTo,
    Math.min(legal.maxRaiseTo, raiseTo),
  )
  const handName =
    game.board.length >= 3
      ? evaluate([...game.cards[0], ...game.board]).name
      : game.cards[0][0].rank === game.cards[0][1].rank
        ? 'Pocket pair'
        : 'Your hole cards'
  const activeRecords = progress.hands.filter((h) =>
    h.id.startsWith(sessionId.current),
  )
  const sessionNet = activeRecords.reduce((sum, hand) => sum + hand.net, 0)

  useEffect(() => {
    if (game.turn !== 1 || game.result || paused) return
    const timeout = window.setTimeout(
      () => setGame(act(game, botAction(game))),
      1100,
    )
    return () => window.clearTimeout(timeout)
  }, [game, paused])

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
  useEffect(
    () => () => {
      void audio.current?.close()
    },
    [],
  )

  function playSound() {
    if (!sound) return
    try {
      audio.current ??= new AudioContext()
      void audio.current.resume()
      const oscillator = audio.current.createOscillator(),
        gain = audio.current.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(620, audio.current.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(
        330,
        audio.current.currentTime + 0.09,
      )
      gain.gain.setValueAtTime(0.045, audio.current.currentTime)
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audio.current.currentTime + 0.12,
      )
      oscillator.connect(gain).connect(audio.current.destination)
      oscillator.start()
      oscillator.stop(audio.current.currentTime + 0.12)
    } catch {
      setSound(false)
    }
  }

  function choose(action: Action) {
    if (!yourTurn) return
    playSound()
    setLastDecision({ game, action, raiseTo: betAmount })
    setGame(act(game, action))
    setNotice('')
  }

  function deal() {
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
    <>
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
      <main id="table" className="workspace">
        <section className="game-column" aria-label="Poker table">
          <div className="workspace-heading">
            <div>
              <div className="breadcrumb">
                THE LEARNING TABLE <ChevronRight size={12} /> NO-LIMIT HOLD’EM
              </div>
              <h1>
                Play the hand.
                <br className="mobile-break" /> Understand the odds
                <span>.</span>
              </h1>
              <p>A game of chance. A lesson in making better decisions.</p>
            </div>
            <button className="how-button" onClick={() => setDialog('help')}>
              <CircleHelp size={15} /> How it works
            </button>
          </div>
          <div className="table-shell">
            <div className="table-topbar">
              <span>
                <span className="table-status-dot" />{' '}
                {game.guided ? 'Guided first hand' : 'Practice table'}{' '}
                <span className="table-top-separator">/</span>{' '}
                <span className="table-muted">Heads-up · 10 / 20</span>
              </span>
              <div>
                <button
                  className="table-icon"
                  title={paused ? 'Resume hand' : 'Pause hand'}
                  aria-label={paused ? 'Resume hand' : 'Pause hand'}
                  onClick={() => setPaused(!paused)}
                >
                  {paused ? <Play size={15} /> : <Pause size={15} />}
                </button>
                <button
                  className="table-icon"
                  aria-label="Table settings"
                  onClick={() => setDialog('settings')}
                >
                  <Settings2 size={16} />
                </button>
              </div>
            </div>
            <div className="poker-stage">
              <div className="ambient ambient-one" />
              <div className="ambient ambient-two" />
              <div className="poker-felt">
                <div className="felt-inner-ring" />
                <span className="felt-watermark">
                  <Spade size={14} fill="currentColor" /> QUANTPOKER
                </span>
                <div className="felt-bottom-mark">THINK IN PROBABILITIES</div>
              </div>
              <div
                className={`player-seat bot-seat ${game.turn === 1 && !game.result ? 'active-seat' : ''}`}
              >
                <div className="opponent-cards">
                  {game.cards[1].map((card, i) => (
                    <PlayingCard
                      key={i}
                      card={card}
                      back={!game.result?.showdown}
                      small
                    />
                  ))}
                </div>
                <div className="player-info">
                  <span className="avatar bot-avatar">
                    <span>A</span>
                    <i />
                  </span>
                  <div>
                    <strong>
                      Atlas <span className="bot-label">BOT</span>
                    </strong>
                    <span>
                      {chips(game.stacks[1])} <small>chips</small>
                    </span>
                  </div>
                  {game.dealer === 1 && <span className="dealer-chip">D</span>}
                </div>
                <span className="seat-status">
                  {game.turn === 1 && !game.result
                    ? paused
                      ? 'Paused'
                      : 'Thinking…'
                    : game.result
                      ? 'Hand complete'
                      : 'Your opponent'}
                </span>
              </div>
              <div className="community-area">
                <div className="pot-label">
                  <span className="chip-stack">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>
                    {game.result ? 'HAND COMPLETE' : 'TOTAL POT'}
                    <strong>
                      {game.result
                        ? chips(game.invested[0] + game.invested[1])
                        : chips(game.pot)}
                    </strong>
                  </span>
                </div>
                <div className="community-cards">
                  {Array.from({ length: 5 }, (_, i) => (
                    <PlayingCard
                      key={i}
                      card={game.board[i]}
                      empty={!game.board[i]}
                    />
                  ))}
                </div>
                <div className="street-indicator">
                  {['preflop', 'flop', 'turn', 'river'].map((street) => (
                    <span
                      key={street}
                      className={game.street === street ? 'current-street' : ''}
                    >
                      {street === 'preflop' ? 'Pre-flop' : street}
                      <i />
                    </span>
                  ))}
                </div>
              </div>
              <div
                className={`player-seat hero-seat ${yourTurn ? 'active-seat' : ''}`}
              >
                <div className="hero-cards">
                  {game.cards[0].map((card) => (
                    <PlayingCard key={cardKey(card)} card={card} />
                  ))}
                </div>
                <div className="player-info">
                  <span className="avatar hero-avatar">Y</span>
                  <div>
                    <strong>
                      You{' '}
                      <span className="you-label">
                        {yourTurn ? 'YOUR TURN' : ''}
                      </span>
                    </strong>
                    <span>
                      {chips(game.stacks[0])} <small>chips</small>
                    </span>
                  </div>
                  {game.dealer === 0 && <span className="dealer-chip">D</span>}
                </div>
              </div>
              <div className="table-hand-tag">
                <span className="mini-spade">♠</span>
                {handName}
              </div>
              <div className="table-hand-number">
                HAND #{String(game.id).padStart(3, '0')}
              </div>
              {paused && !game.result && (
                <div className="paused-overlay">
                  <Pause size={25} />
                  <h3>Take your time.</h3>
                  <p>The table can wait. Explore the models.</p>
                  <button onClick={() => setPaused(false)}>
                    <Play size={14} /> Resume hand
                  </button>
                </div>
              )}
            </div>
            <div className="action-area">
              <div className="action-context" aria-live="polite">
                {game.result ? (
                  <>
                    <span
                      className={`result-dot ${game.result.net < 0 ? 'loss' : ''}`}
                    />
                    <strong>{game.result.text}</strong>
                    <span
                      className={
                        game.result.net >= 0 ? 'table-profit' : 'table-loss'
                      }
                    >
                      {game.result.net >= 0 ? '+' : '−'}
                      {chips(Math.abs(game.result.net))} chips
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className={yourTurn ? 'your-turn-dot' : 'waiting-dot'}
                    />
                    <strong>
                      {paused
                        ? 'Table paused'
                        : yourTurn
                          ? 'Your move'
                          : 'Atlas is thinking'}
                    </strong>
                    <span>
                      {yourTurn
                        ? legal.toCall
                          ? `· ${chips(legal.toCall)} to call`
                          : '· You can check for free'
                        : '· No rush. Think in probabilities.'}
                    </span>
                  </>
                )}
              </div>
              {game.result ? (
                <div className="result-actions">
                  <p>One outcome is a data point, not a verdict.</p>
                  <button className="next-hand-button" onClick={deal}>
                    {game.stacks.some((s) => s === 0)
                      ? 'Refill & deal next hand'
                      : 'Deal next hand'}
                    <ArrowRight size={17} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="action-buttons">
                    <button
                      disabled={!yourTurn}
                      className="fold-button"
                      onClick={() => choose({ type: 'fold' })}
                    >
                      Fold<span>Step away</span>
                    </button>
                    <button
                      disabled={!yourTurn}
                      className="call-button"
                      onClick={() =>
                        choose({ type: legal.canCheck ? 'check' : 'call' })
                      }
                    >
                      {legal.canCheck ? 'Check' : `Call ${chips(legal.toCall)}`}
                      <span>
                        {legal.canCheck
                          ? 'Keep your options open'
                          : 'Stay in the hand'}
                      </span>
                    </button>
                    <button
                      disabled={!yourTurn || !legal.canRaise}
                      className="raise-button"
                      onClick={() => choose({ type: 'raise', to: betAmount })}
                    >
                      {Math.max(...game.bets) === 0 ? 'Bet' : 'Raise to'}{' '}
                      {chips(betAmount)}
                      <ArrowUpRight size={16} />
                      <span>
                        {betAmount === legal.maxRaiseTo
                          ? 'Maximum effective bet'
                          : 'Put your conviction to work'}
                      </span>
                    </button>
                  </div>
                  <div className="bet-sizing">
                    <label htmlFor="raise-size">
                      {Math.max(...game.bets) === 0 ? 'Bet' : 'Raise'} size
                    </label>
                    <input
                      id="raise-size"
                      aria-label="Raise total"
                      type="range"
                      min={legal.minRaiseTo}
                      max={Math.max(legal.minRaiseTo, legal.maxRaiseTo)}
                      step="1"
                      value={betAmount}
                      disabled={!yourTurn || !legal.canRaise}
                      onChange={(e) => setRaiseTo(Number(e.target.value))}
                    />
                    <div className="bet-presets">
                      {[
                        {
                          label: '½ pot',
                          amount:
                            Math.max(...game.bets) +
                            Math.round((game.pot + legal.toCall) / 2),
                        },
                        {
                          label: 'Pot',
                          amount:
                            Math.max(...game.bets) + game.pot + legal.toCall,
                        },
                        { label: 'Max', amount: legal.maxRaiseTo },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          disabled={!yourTurn || !legal.canRaise}
                          onClick={() =>
                            setRaiseTo(
                              Math.min(
                                legal.maxRaiseTo,
                                Math.max(legal.minRaiseTo, preset.amount),
                              ),
                            )
                          }
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="table-bottom">
              <span>
                <ShieldCheck size={13} /> Zero stakes. Real understanding.
              </span>
              <button onClick={() => setDialog('history')}>
                <History size={13} /> Hand history
              </button>
            </div>
          </div>
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
        <Modal
          title="Poker is the beginning. Not the point."
          onClose={() => setDialog(null)}
        >
          <div className="help-content">
            <p className="modal-intro">
              Learn how to make decisions when the outcome is uncertain.
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
              onClick={() => setSound(!sound)}
              aria-pressed={sound}
            >
              <span>
                <AudioLines size={19} />
                <span>
                  <strong>Gentle action sounds</strong>
                  <small>A subtle cue when you act. Off by default.</small>
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
            <p className="modal-note">
              No account required. Lesson completion and the last 100 hand
              results stay in this browser. Reloading starts a fresh table, not
              a saved hand.
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
    </>
  )
}
