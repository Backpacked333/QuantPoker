import { breakEvenEquity, callEV, fairPremium } from './finance'
import type { Lens } from './finance'

export type LessonQuestion = {
  prompt: string
  choices: { id: string; label: string; feedback: string }[]
  answer: string
}

export type HandLessonContent = {
  title: string
  goal: string
  concept: string
  context: string
  prediction: LessonQuestion
  working: { label: string; value: string }[]
  experiment: string
  points: { label: string; x: number }[]
  transfer: LessonQuestion
  takeaway: string
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`
const chips = (value: number) =>
  `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)} chips`

const freeCheck: LessonQuestion = {
  prompt: 'There is no bet to call. What does a check cost right now?',
  choices: [
    {
      id: 'pot',
      label: 'The chips already in the pot',
      feedback:
        'Those chips were committed earlier. They are sunk costs, not a new payment for checking.',
    },
    {
      id: 'zero',
      label: 'Zero additional chips',
      feedback:
        'Exactly. Checking makes no new payment. That does not remove the risk of losing earlier chips or facing a later bet.',
    },
    {
      id: 'win',
      label: 'Nothing—and it guarantees a profit',
      feedback:
        'No new payment is not the same as a guaranteed win. Cards and future bets can still change the outcome.',
    },
  ],
  answer: 'zero',
}

export function createHandLesson(
  lens: Lens,
  pot: number,
  call: number,
): HandLessonContent {
  const threshold = breakEvenEquity(pot, call)
  const below = threshold / 2
  const above = (1 + threshold) / 2
  const context = call
    ? `${pot} chips in the pot. ${call} more to call. Start with this price—not the strength of your cards.`
    : `${pot} chips in the pot. No new chips required to check. Earlier contributions are already committed.`
  const points = [
    { label: call ? 'Below break-even' : 'At 0% equity', x: below },
    {
      label: call ? 'At break-even' : 'At 50% equity',
      x: call ? threshold : 0.5,
    },
    ...(call ? [{ label: 'Above break-even', x: above }] : []),
  ]

  if (lens === 'equity')
    return {
      title: 'A good hand needs a good price.',
      goal: 'Find the price of continuing before judging your cards.',
      concept:
        'Equity is your estimated share of the pot at showdown, including ties. Expected value (EV) is the average chip result of a decision—not a promise about this hand.',
      context,
      prediction: call
        ? {
            prompt: `Which calculation gives the break-even equity for this ${call}-chip call?`,
            choices: [
              {
                id: 'old-pot',
                label: 'Call ÷ pot before calling',
                feedback:
                  'Close, but the denominator must include the call you add. At break-even, your expected share of the final pot must repay that new payment.',
              },
              {
                id: 'final-pot',
                label: 'Call ÷ (pot + call)',
                feedback:
                  'Yes. Compare your new payment with the pot after that payment. This is the minimum equity for a zero-EV call in the no-future-betting model.',
              },
              {
                id: 'stack',
                label: 'Call ÷ your remaining stack',
                feedback:
                  'That measures bankroll exposure, not whether this pot offers a good price. A smaller fraction of your stack can still be a bad-value call.',
              },
            ],
            answer: 'final-pot',
          }
        : freeCheck,
      working: [
        { label: 'New payment', value: `${call} chips` },
        {
          label: 'Pot after calling',
          value: `${pot} + ${call} = ${pot + call} chips`,
        },
        {
          label: 'Break-even share',
          value: call
            ? `${call} ÷ ${pot + call} = ${percent(threshold)}`
            : '0% · no new payment',
        },
      ],
      experiment: call
        ? 'Compare points on either side of the break-even line. Watch the average chip result change sign; your actual cards do not change.'
        : 'Compare 0% and 50% equity. A free check has no negative immediate-payoff branch in this simplified model. Later betting is not included.',
      points,
      transfer: {
        prompt: 'A positive-EV decision loses once. What have you learned?',
        choices: [
          {
            id: 'bad',
            label: 'The original decision was necessarily bad',
            feedback:
              'A good process can produce a bad outcome. Review the price and assumptions using information available before the result.',
          },
          {
            id: 'certain',
            label: 'The model must predict the next win',
            feedback:
              'An average does not schedule wins. Each hand can lose, and an estimated probability can also be wrong.',
          },
          {
            id: 'sample',
            label: 'One result cannot establish the quality of the decision',
            feedback:
              'Right. In investing too, evaluate the price, evidence and repeated outcomes—not a single lucky or unlucky result. Positive modeled EV still depends on valid assumptions.',
          },
        ],
        answer: 'sample',
      },
      takeaway:
        'Separate price, probability and outcome. A profitable average can include many losing hands.',
    }

  if (lens === 'options')
    return {
      title: 'The right to say no has value.',
      goal: 'Distinguish a choice from an obligation—and from a guaranteed win.',
      concept:
        'An option gives a right, not an obligation. This toy curve compares committing now with declining at zero additional chips. It keeps the better modeled value, but it does not eliminate losing outcomes.',
      context,
      prediction: {
        prompt: 'Why does the toy optionality curve never go below zero?',
        choices: [
          {
            id: 'refund',
            label: 'Folding refunds the chips already committed',
            feedback:
              'Earlier chips stay in the pot. Zero means no additional payoff from this point, not a refund.',
          },
          {
            id: 'choice',
            label: 'The model can decline a negative-value commitment',
            feedback:
              'Exactly. The curve is max(continue EV, 0). This is a choice between modeled averages, not a guarantee that a chosen hand will win.',
          },
          {
            id: 'guarantee',
            label: 'Exercising a choice guarantees a winning hand',
            feedback:
              'The chosen action can still lose. Optionality removes the obligation to take a negative modeled average, not the randomness of individual outcomes.',
          },
        ],
        answer: 'choice',
      },
      working: [
        {
          label: `Continue at ${percent(below)} equity`,
          value: chips(callEV(below, pot, call)),
        },
        { label: 'Decline from this point', value: '0 additional chips' },
        {
          label: 'Value of the better choice',
          value: `max(${callEV(below, pot, call).toFixed(1)}, 0) = ${chips(Math.max(0, callEV(below, pot, call)))}`,
        },
      ],
      experiment: call
        ? 'Inspect below and above break-even. Below it, the optionality curve stays flat at zero; above it, it follows the value of continuing.'
        : 'With a free check, the current model has no negative branch to cut off. Compare 0% and 50% equity; the value of future choices is not modeled.',
      points,
      transfer: {
        prompt:
          'You buy a financial option and never exercise it. Is the total profit necessarily zero?',
        choices: [
          {
            id: 'zero',
            label: 'Yes—declining always means zero total profit',
            feedback:
              'Zero additional payoff is not zero total profit. A real option can have an upfront premium, which our poker choice curve does not price.',
          },
          {
            id: 'premium',
            label: 'No—you can still lose the premium you paid',
            feedback:
              'Correct. The right to decline is useful, but not necessarily free. A traded option price also depends on time, volatility and market assumptions absent from this toy curve.',
          },
          {
            id: 'refund',
            label: 'The seller must refund the premium',
            feedback:
              'Buying a right generally does not entitle you to a premium refund just because you do not exercise it.',
          },
        ],
        answer: 'premium',
      },
      takeaway:
        'The right to decline limits a new commitment. It does not erase sunk costs or price a real traded option.',
    }

  const coverage = call * 0.75
  const premium = fairPremium(0.25, coverage)
  return {
    title: 'Protection changes risk, not luck.',
    goal: 'Explain why a fair premium reshapes outcomes without creating expected profit.',
    concept:
      'Insurance exchanges a certain premium for a payment in a bad outcome. It changes the size of a loss, not the probability of a bad card. A fair premium equals the expected payout.',
    context: call
      ? `${call} chips are at risk in a call. For practice, protect 75% (${coverage.toFixed(1)} chips) and assume a 25% chance of loss—not a prediction about Atlas.`
      : context,
    prediction: call
      ? {
          prompt: `In that practice scenario, what is the fair premium for ${coverage.toFixed(1)} chips of protection?`,
          choices: [
            {
              id: 'all',
              label: 'The full protected amount',
              feedback:
                'That would charge for a claim on every outcome. Our scenario pays the claim only 25% of the time.',
            },
            {
              id: 'free',
              label: 'Zero—protection creates free value',
              feedback:
                'The expected claim has to be funded. Free coverage would be a subsidy, not fairly priced protection.',
            },
            {
              id: 'expected',
              label: 'Loss probability × protected amount',
              feedback:
                'Yes. Expected claims are 25% of the protected amount here. A premium equal to expected claims leaves expected net value unchanged before costs.',
            },
          ],
          answer: 'expected',
        }
      : freeCheck,
    working: [
      {
        label: 'Practice loss probability',
        value: '25% · assumed, not estimated',
      },
      { label: '75% of new chips protected', value: chips(coverage) },
      {
        label: 'Fair premium',
        value: `0.25 × ${coverage.toFixed(1)} = ${chips(premium)}`,
      },
    ],
    experiment: call
      ? 'Compare a 25% and a 75% loss probability at the same 75% coverage. More likely claims cost more, making the losing-state result worse. The graph shows that state, not overall expected value.'
      : 'There are no new chips at risk in a check, so the protection curve is flat. Model a raise below to explore a nonzero exposure; the practice question still refers to the free check.',
    points: [
      { label: '25% chance of loss', x: 0.25 },
      { label: '75% chance of loss', x: 0.75 },
    ],
    transfer: {
      prompt:
        'A real policy charges expected claims plus expenses. Why might someone still buy it?',
      choices: [
        {
          id: 'risk',
          label: 'To make a severe loss more manageable',
          feedback:
            'Exactly. Risk reduction can be worth paying for even when expected money decreases. Real policies also have exclusions, limits and capital costs.',
        },
        {
          id: 'profit',
          label: 'To increase expected profit for free',
          feedback:
            'Charging more than expected claims lowers expected money for the buyer. The benefit is a different risk profile, not free profit.',
        },
        {
          id: 'probability',
          label: 'To stop the bad event from happening',
          feedback:
            'Financial protection pays after a covered event. It does not itself lower that event’s probability.',
        },
      ],
      answer: 'risk',
    },
    takeaway:
      'Protection transfers money between outcomes. Always separate the probability of loss, its size, and the price of coverage.',
  }
}
