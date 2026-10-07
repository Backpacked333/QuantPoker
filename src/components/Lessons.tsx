import { useState } from 'react'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  GraduationCap,
  ShieldCheck,
  TrendingUp,
  ArrowUpRight,
} from 'lucide-react'
import type { Lens } from '../lib/finance'

const lessons = {
  equity: {
    title: 'Think in expected value',
    subtitle: 'A good bet can still lose. A bad bet can still win.',
    icon: TrendingUp,
    body: 'Imagine a pot of 160 chips and a 40-chip call. If you have a 30% chance of winning, your expected value is 0.30 × 160 − 0.70 × 40 = +20 chips. Over many identical decisions, your average gain would approach 20—not because every call wins, but because the payoff compensates for the losses.',
    connection:
      'Investors and insurers also weigh possible outcomes by their probabilities. Expected value is useful, but it does not capture how painful a loss might be, how uncertain your estimate is, or whether you can survive a losing streak.',
    caveat:
      'This shortcut assumes no more betting. In real poker, future actions and an opponent’s range can change the decision.',
    question: 'The pot is 150. Calling costs 50. What equity breaks even?',
    choices: ['25%', '33%', '50%'],
    answer: 0,
    explanation:
      '50 ÷ (150 + 50) = 25%. At that equity, 25% × 150 − 75% × 50 = 0.',
  },
  options: {
    title: 'See the shape of an option',
    subtitle: 'Limited downside. A different kind of upside.',
    icon: ArrowUpRight,
    body: 'A call option gives you the right to buy an asset at a fixed strike price. Suppose the strike is 100 and the premium is 10. If the asset ends at 130, the right is worth 30 and your net profit is 20. If it ends at 80, you let the right expire and lose only the 10 premium.',
    connection:
      'A poker draw has a similar intuition: pay something today for the chance of a favorable future. But paying to stay in a hand is not literally buying an option. There is no underlying traded asset, and later betting can create additional costs.',
    caveat:
      'Expiration payoff is not the option’s price before expiration. Time, volatility, rates, dividends, and the pricing model matter.',
    question: 'Strike 100, premium 10. At expiration, where do you break even?',
    choices: ['100', '110', '120'],
    answer: 1,
    explanation:
      'At 110, the option’s 10 intrinsic value exactly covers its 10 premium.',
  },
  insurance: {
    title: 'Put a price on protection',
    subtitle: 'A smaller range of outcomes has a cost.',
    icon: ShieldCheck,
    body: 'Suppose there is a 20% chance of losing 200 chips, and an 80% chance of losing nothing. Your expected loss is 40 chips. A policy that pays the full 200 in the bad state has a fair premium of 40, before any expenses or profit margin.',
    connection:
      'Buying fair insurance does not improve expected wealth; it reduces uncertainty. A risk-averse person may prefer a certain 40-chip cost over a one-in-five chance of losing 200. That is different from simply maximizing expected value.',
    caveat:
      'Real insurance includes exclusions, deductibles, expenses, and correlated losses. This is an educational model, not a policy offer or poker side bet.',
    question: 'A 10% chance of a 100-chip payout has what fair premium?',
    choices: ['1 chip', '10 chips', '100 chips'],
    answer: 1,
    explanation:
      'Expected payout is 0.10 × 100 = 10 chips. A real insurer would normally charge more.',
  },
}

export function Lessons({
  selected,
  onSelect,
  completed,
  onComplete,
}: {
  selected: Lens | null
  onSelect: (lens: Lens) => void
  completed: Lens[]
  onComplete: (lens: Lens) => void
}) {
  const [choice, setChoice] = useState<number | null>(null)
  if (!selected)
    return (
      <div className="lesson-library">
        <p className="modal-intro">
          Learn the ideas behind the table. No finance background needed.
        </p>
        {(Object.keys(lessons) as Lens[]).map((key) => {
          const lesson = lessons[key],
            Icon = lesson.icon
          return (
            <button
              className="library-card"
              key={key}
              onClick={() => {
                setChoice(null)
                onSelect(key)
              }}
            >
              <span className={`library-icon ${key}`}>
                <Icon size={24} />
              </span>
              <div>
                <span className="eyebrow">
                  {completed.includes(key) ? 'COMPLETED' : '2 MIN · BEGINNER'}
                </span>
                <h3>{lesson.title}</h3>
                <p>{lesson.subtitle}</p>
              </div>
              {completed.includes(key) ? (
                <CheckCircle2 size={21} />
              ) : (
                <ArrowRight size={21} />
              )}
            </button>
          )
        })}
        <div className="library-note">
          <GraduationCap size={20} />
          <span>
            Build intuition here. Always question the assumptions behind a
            model.
          </span>
        </div>
      </div>
    )
  const lesson = lessons[selected]
  return (
    <article className="lesson-detail">
      <div className="lesson-meta">
        <Clock3 size={14} /> 2-minute lesson <span>·</span> Beginner friendly
      </div>
      <h3>{lesson.title}</h3>
      <p className="lesson-subtitle">{lesson.subtitle}</p>
      <h4>The idea</h4>
      <p>{lesson.body}</p>
      <h4>Beyond the poker table</h4>
      <p>{lesson.connection}</p>
      <div className="lesson-caveat">{lesson.caveat}</div>
      <div className="quiz">
        <span className="eyebrow">CHECK YOUR INTUITION</span>
        <h4>{lesson.question}</h4>
        <div className="quiz-choices">
          {lesson.choices.map((answer, i) => (
            <button
              key={answer}
              className={
                choice === i
                  ? i === lesson.answer
                    ? 'correct'
                    : 'incorrect'
                  : ''
              }
              onClick={() => {
                setChoice(i)
                if (i === lesson.answer) onComplete(selected)
              }}
            >
              {answer}
              {choice === i && i === lesson.answer ? <Check size={16} /> : null}
            </button>
          ))}
        </div>
        {choice !== null && (
          <p className="quiz-feedback" role="status">
            {choice === lesson.answer
              ? `Exactly. ${lesson.explanation}`
              : 'Not quite. Try weighing the cost against the possible payoff.'}
          </p>
        )}
      </div>
    </article>
  )
}
