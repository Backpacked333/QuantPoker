export type LabId =
  | 'odds'
  | 'outs'
  | 'equity'
  | 'pricing'
  | 'fold'
  | 'variance'
  | 'replication'
  | 'risk'
export type ModuleId = LabId
export type Question = {
  prompt: string
  choices: string[]
  correct: number
  explanation: string
}
export type Module = {
  id: ModuleId
  number: string
  title: string
  subtitle: string
  stage: 'Foundations' | 'Decision science' | 'Market mechanics'
  minutes: number
  poker: string
  finance: string
  tags: string[]
  prerequisites: ModuleId[]
  objectives: string[]
  bridge: string
  boundary: string
  scenario: {
    title: string
    body: string
    calculation: string
    takeaway: string
  }
  concepts: { title: string; body: string }[]
  formula: string
  formulaKey: string
  questions: Question[]
  source: { label: string; url: string }
}

export const modules: Module[] = [
  {
    id: 'odds',
    number: '01',
    title: 'The price of a decision',
    subtitle: 'Know what a chance to win is actually worth.',
    stage: 'Foundations',
    minutes: 12,
    poker: 'Pot odds',
    finance: 'Expected payoff',
    tags: ['Pot odds', 'Expected payoff', 'Break-even'],
    prerequisites: [],
    objectives: [
      'Calculate the break-even equity of a call.',
      'Separate gross payoff from net profit.',
      'Value a decision from now, not from sunk costs.',
    ],
    bridge:
      'A call is a price paid for a share of uncertain future proceeds. Like buying a contingent claim, the decision starts with the entry price, possible payouts, and their probabilities.',
    boundary:
      'Pot odds give a decision threshold, not a market price. A physical expected payoff is not automatically a fair option value: discounting, risk, and replication matter in markets.',
    scenario: {
      title: 'A price you can work with',
      body: 'There are 100 chips in the pot, including your opponent’s bet. Calling costs 25 chips. Assume no more betting, no rake, no ties, and a 30% chance of winning.',
      calculation: 'EV(call) = 0.30 × 100 − 0.70 × 25 = +12.5 chips',
      takeaway:
        'You need only 25 / 125 = 20% equity. At 30%, calling earns 12.5 chips on average relative to folding, even though most individual calls lose.',
    },
    concepts: [
      {
        title: 'Set the clock to now',
        body: 'Chips already committed are sunk costs. Folding has incremental value zero; the relevant cost is the additional call. The pot here includes the opponent’s bet but not your call.',
      },
      {
        title: 'Price the two branches',
        body: 'Win: collect the existing pot as net profit. Lose: lose the call. Equivalently, equity × final pot minus the call gives the same answer.',
      },
      {
        title: 'Translate to a claim',
        body: 'For an undiscounted binary claim paying 125 or 0 with physical probability 30%, the expected gross payoff is 37.5. Buying it for 25 has physical expected profit 12.5, not a guaranteed return.',
      },
    ],
    formula: 'EV = eP − (1 − e)C',
    formulaKey: 'e = equity · P = pot before your call · C = call cost',
    questions: [
      {
        prompt:
          'The pot is 120 chips before your call. Calling costs 40. What is the break-even equity?',
        choices: ['20%', '25%', '33.3%'],
        correct: 1,
        explanation:
          '40 / (120 + 40) = 25%. Include your call in the final pot denominator.',
      },
      {
        prompt: 'A call has positive expected value. What does that imply?',
        choices: [
          'The next call will win.',
          'It is risk-free.',
          'Its probability-weighted incremental profit is positive.',
        ],
        correct: 2,
        explanation:
          'Expectation describes a weighted average over outcomes, not a promise about the next hand.',
      },
    ],
    source: {
      label: 'PokerStars Learn · Pot odds',
      url: 'https://www.pokerstars.com/poker/learn/strategies/pot-odds/',
    },
  },
  {
    id: 'outs',
    number: '02',
    title: 'Count the possible futures',
    subtitle: 'Turn unseen cards into a probability distribution.',
    stage: 'Foundations',
    minutes: 14,
    poker: 'Outs',
    finance: 'State probabilities',
    tags: ['Outs', 'Probability', 'State space'],
    prerequisites: ['odds'],
    objectives: [
      'Compute one-card and two-card hit probabilities.',
      'Explain why the rule of four is an approximation.',
      'Distinguish making a hand from winning a pot.',
    ],
    bridge:
      'Outs partition possible future cards into states. An options payoff model also starts with future states, but market-state probabilities must be estimated or inferred rather than counted from a known deck.',
    boundary:
      'A clean out improves your hand, but hitting it may not win. The lab assumes fixed clean outs and uniform draws without replacement; it is not a hand evaluator or an equity engine.',
    scenario: {
      title: 'Nine cards that change the story',
      body: 'You hold two hearts and see two hearts on the flop. Nine hearts remain among 47 unseen cards. Assume all nine are clean outs and you will see both remaining board cards.',
      calculation: 'P(hit by river) = 1 − (38/47) × (37/46) = 34.97%',
      takeaway:
        'The rule of four estimates 36%, close but not exact. Seeing the river for free is a separate assumption from having the outs.',
    },
    concepts: [
      {
        title: 'Count the complement',
        body: 'It is easier to calculate missing every out, then subtract that probability from one. Without replacement, both the unseen-card count and the miss count shrink after a miss.',
      },
      {
        title: 'Audit your outs',
        body: 'A heart that pairs the board may give an opponent a full house. “Dirty” outs, overlapping draws, and redraws invalidate a naive count. The lab intentionally isolates clean fixed outs.',
      },
      {
        title: 'States before prices',
        body: 'A state space lists what could happen; a probability model assigns weights. A deck supplies combinatorial weights. An asset-price model needs assumptions about dynamics, calibration, and which probability measure is being used.',
      },
    ],
    formula: 'P(hit) = 1 − ∏ (U − O − i) / (U − i)',
    formulaKey:
      'O = clean outs · U = unseen cards · i = 0 to cards-to-come − 1',
    questions: [
      {
        prompt:
          'With 9 clean outs among 46 unseen cards and one card to come, the hit probability is…',
        choices: ['About 19.6%', 'About 36%', 'Exactly 25%'],
        correct: 0,
        explanation:
          'For one draw, divide outs by unseen cards: 9 / 46 ≈ 19.57%.',
      },
      {
        prompt: 'A 35% chance of making a flush means…',
        choices: [
          'Exactly 35% showdown equity.',
          'A 35% chance of the modeled event, not necessarily of winning.',
          'A fair option price of 35.',
        ],
        correct: 1,
        explanation:
          'Hitting a draw and winning are different events. Opponent hands and redraws affect actual equity.',
      },
    ],
    source: {
      label: 'OpenStax · Probability topics',
      url: 'https://openstax.org/books/introductory-statistics-2e/pages/3-introduction',
    },
  },
  {
    id: 'equity',
    number: '03',
    title: 'Your share of uncertainty',
    subtitle: 'Separate winning chances from pricing weights.',
    stage: 'Foundations',
    minutes: 16,
    poker: 'Equity',
    finance: 'Physical vs. risk-neutral probability',
    tags: ['Equity', 'Risk-neutral pricing', 'Probability'],
    prerequisites: ['outs'],
    objectives: [
      'Include ties in heads-up showdown equity.',
      'Explain why equity depends on an opponent range.',
      'Distinguish a physical probability from a risk-neutral weight.',
    ],
    bridge:
      'Equity is an expected share of the pot across possible showdowns. Finance also computes weighted payoffs, but risk-neutral probabilities are pricing weights chosen to make discounted tradable prices consistent with no arbitrage.',
    boundary:
      'Poker equity is neither a stock ownership stake nor option delta. Risk-neutral weights are not forecasts of how often an asset will rise. Equity realization also changes when future betting or folds are possible.',
    scenario: {
      title: 'The split pot matters',
      body: 'Against a specified opponent range, suppose you win 40% of showdowns, tie 10%, and lose 50%. The pot is shared equally in ties, with no side pots.',
      calculation: 'Equity = 40% + ½ × 10% = 45%',
      takeaway:
        'Your expected share is 45%, not your 40% outright win rate. Change the opponent range and the probabilities change.',
    },
    concepts: [
      {
        title: 'A range, not a feeling',
        body: 'Your cards alone do not determine equity. Board cards, opponents’ possible hands, and weights on those hands all matter. Here you enter probabilities rather than pretending to solve a full range.',
      },
      {
        title: 'Two sets of weights',
        body: 'Physical probabilities describe beliefs about outcomes. Risk-neutral weights price replicable claims under a model. They can differ because investors demand compensation for risk.',
      },
      {
        title: 'Share versus sensitivity',
        body: 'Equity is an expected fraction of the pot. Delta is the change in an option’s value for a small move in its underlying, or the stock units in a replicating portfolio. Similar-looking numbers do not make them the same quantity.',
      },
    ],
    formula: 'Equity = P(win) + ½ P(tie)',
    formulaKey: 'Heads-up · equal split on ties · no side pots',
    questions: [
      {
        prompt:
          'You win 30% and tie 20% in a heads-up showdown. What is your equity?',
        choices: ['30%', '40%', '50%'],
        correct: 1,
        explanation: '30% + half of 20% = 40% of the pot on average.',
      },
      {
        prompt: 'A risk-neutral up-state weight of 60% is…',
        choices: [
          'A guaranteed 60% real-world frequency.',
          'The same as poker equity.',
          'A model-derived pricing weight, not necessarily a forecast.',
        ],
        correct: 2,
        explanation:
          'Risk-neutral weights enforce pricing consistency with the risk-free asset and underlying; physical forecasts need not match.',
      },
    ],
    source: {
      label: 'MIT OpenCourseWare · Finance theory',
      url: 'https://ocw.mit.edu/courses/15-401-finance-theory-i-fall-2008/',
    },
  },
  {
    id: 'pricing',
    number: '04',
    title: 'Good bets. Fair prices.',
    subtitle: 'Move from expected value to no-arbitrage valuation.',
    stage: 'Decision science',
    minutes: 20,
    poker: 'Expected value',
    finance: 'Risk-neutral pricing',
    tags: ['Expected value', 'Risk-neutral pricing', 'Expected payoff'],
    prerequisites: ['odds', 'equity'],
    objectives: [
      'Price a European call in a one-step binomial model.',
      'Compare physical expectation with no-arbitrage value.',
      'Check the no-arbitrage condition before using a formula.',
    ],
    bridge:
      'Both poker EV and option valuation aggregate state-contingent payoffs. The crucial extra step in options is replication: a tradable hedge determines pricing weights and discounting, rather than simply using a player’s beliefs.',
    boundary:
      'A positive poker EV does not imply arbitrage. Discounting a physical expected option payoff at the risk-free rate generally does not give a no-arbitrage price.',
    scenario: {
      title: 'One stock. Two futures.',
      body: 'A stock costs 100 and will be worth 120 or 80 in one period. A call has strike 100. The risk-free return over the entire period is 5%. Assume frictionless trading, borrowing, and shorting.',
      calculation:
        'q = (1.05 − 0.80) / (1.20 − 0.80) = 0.625; C₀ = (0.625 × 20) / 1.05 = 11.90',
      takeaway:
        'A 50% physical up probability gives expected payoff 10, but the replicating price is 11.90. Pricing and forecasting answer different questions.',
    },
    concepts: [
      {
        title: 'Write the terminal payoff',
        body: 'A European call pays max(S − K, 0) at expiry. This is a gross payoff. Profit for the buyer also depends on the premium paid and its financing.',
      },
      {
        title: 'Make the weights tradable',
        body: 'With up factor u, down factor d, and period risk-free return r, q = (1 + r − d) / (u − d). A valid non-degenerate model requires d < 1 + r < u.',
      },
      {
        title: 'Discount once',
        body: 'The one-step price is the q-weighted expiry payoff divided by 1 + r. Here r is a simple return for the full period, not an annual continuously compounded rate.',
      },
    ],
    formula: 'V₀ = [qVᵤ + (1 − q)V𝒹] / (1 + r)',
    formulaKey: 'q = (1 + r − d) / (u − d) · d < 1 + r < u',
    questions: [
      {
        prompt: 'For u = 1.2, d = 0.8, and a 0% period rate, what is q?',
        choices: ['0.2', '0.5', '0.8'],
        correct: 1,
        explanation:
          '(1 − 0.8) / (1.2 − 0.8) = 0.5. This follows from tradable prices, not from a forecast.',
      },
      {
        prompt:
          'Which change directly alters a replicating call price in this fixed one-step model?',
        choices: [
          'Changing only your physical up-probability forecast.',
          'Changing the terminal stock prices.',
          'Changing your last poker result.',
        ],
        correct: 1,
        explanation:
          'Terminal stock prices change payoffs and the replicating hedge. Personal probabilities alone do not change this no-arbitrage price.',
      },
    ],
    source: {
      label: 'MIT OpenCourseWare · Finance theory',
      url: 'https://ocw.mit.edu/courses/15-401-finance-theory-i-fall-2008/',
    },
  },
  {
    id: 'fold',
    number: '05',
    title: 'The value of a response',
    subtitle: 'Price the branch where your opponent walks away.',
    stage: 'Decision science',
    minutes: 16,
    poker: 'Fold equity',
    finance: 'Contingent payoff trees',
    tags: ['Fold equity', 'Expected value', 'Payoff trees'],
    prerequisites: ['pricing'],
    objectives: [
      'Combine fold and called branches into bet EV.',
      'Find a pure bluff’s break-even fold frequency.',
      'Separate strategic behavior from contractual option payoffs.',
    ],
    bridge:
      'A betting decision is a payoff tree: one branch ends now, another continues to a showdown. The same bookkeeping helps organize contingent financial payoffs, while exposing the extra strategic variable in poker.',
    boundary:
      'Fold equity (sometimes called folding equity) is not option delta or an option premium. An opponent chooses whether to fold; a vanilla option’s expiry payoff follows a contract. This analogy is structural, not a pricing identity.',
    scenario: {
      title: 'Two ways to win',
      body: 'You bet 50 into a pot of 100. Your opponent folds 40% of the time. If called, you have 25% equity. Assume one opponent, equal matched bets, and no further betting or rake.',
      calculation:
        'EV(bet) = 0.40 × 100 + 0.60 × [0.25 × 150 − 0.75 × 50] = +40',
      takeaway:
        'The called branch breaks even; the fold branch adds 40 chips. This is incremental bet EV, not proof that betting beats checking.',
    },
    concepts: [
      {
        title: 'Do not count your own bet as profit',
        body: 'When the opponent folds, your new bet returns to you; net profit is the old pot. When called and you win, net profit is the old pot plus the opponent’s call.',
      },
      {
        title: 'Condition the equity',
        body: 'Showdown equity must be measured against the calling range, not the entire pre-bet range. A larger bet can simultaneously increase folds and strengthen the range that calls.',
      },
      {
        title: 'Know the missing alternative',
        body: 'A pure bluff breaks even at f = B / (P + B). But comparing a value bet with checking needs a model of check outcomes too. Positive bet EV alone does not identify the best action.',
      },
    ],
    formula: 'EV(bet) = fP + (1 − f)[e(P + B) − (1 − e)B]',
    formulaKey:
      'f = fold probability · e = equity when called · P = old pot · B = matched bet',
    questions: [
      {
        prompt:
          'A pure bluff bets 50 into 100. How often must opponents fold to break even?',
        choices: ['25%', '33.3%', '50%'],
        correct: 1,
        explanation:
          '50 / (100 + 50) = 1/3. If called, a pure bluff always loses its 50-chip bet.',
      },
      {
        prompt: 'Which equity belongs in the called branch?',
        choices: [
          'Equity against the opponent’s calling range.',
          'Equity against every possible hand equally.',
          'The fold probability.',
        ],
        correct: 0,
        explanation:
          'Condition on the response. A calling range is usually stronger than the range before facing the bet.',
      },
    ],
    source: {
      label: 'OpenStax · Discrete random variables',
      url: 'https://openstax.org/books/introductory-statistics-2e/pages/4-introduction',
    },
  },
  {
    id: 'variance',
    number: '06',
    title: 'An edge is not a smooth line',
    subtitle: 'Understand dispersion before you price uncertainty.',
    stage: 'Market mechanics',
    minutes: 18,
    poker: 'Variance',
    finance: 'Implied volatility',
    tags: ['Variance', 'Implied volatility', 'Risk'],
    prerequisites: ['pricing'],
    objectives: [
      'Measure the dispersion of a binary poker payoff.',
      'Distinguish standard deviation from variance.',
      'Explain how market prices imply model volatility.',
    ],
    bridge:
      'Poker variance and financial return volatility both describe dispersion. For a vanilla option, uncertainty also affects the value of a convex payoff; implied volatility is the model input that reproduces an observed option price.',
    boundary:
      'Poker payoff standard deviation is measured in chips. Asset volatility is usually annualized return dispersion. They are not interchangeable, and historical volatility is not implied volatility.',
    scenario: {
      title: 'Same edge, different ride',
      body: 'A repeated independent decision wins 100 chips with probability 55% and loses 100 otherwise. The expected profit is 10 chips per decision.',
      calculation:
        'Var(X) = 0.55 × (100 − 10)² + 0.45 × (−100 − 10)² = 9,900; SD ≈ 99.50',
      takeaway:
        'After 100 independent decisions, expected total profit is 1,000 chips but total SD is about 995. A profitable strategy can still experience substantial losing stretches.',
    },
    concepts: [
      {
        title: 'Scale carefully',
        body: 'For independent identical decisions, the total mean grows with n and total standard deviation with √n. Correlation, changing strategy, and bankroll constraints break this simple scaling.',
      },
      {
        title: 'Invert the pricing model',
        body: 'Black–Scholes maps volatility to a European option price. Implied volatility solves the reverse problem. The lab generates a synthetic market premium from a chosen volatility, then numerically recovers that volatility.',
      },
      {
        title: 'Hold the rest fixed',
        body: 'In the Black–Scholes model, increasing volatility raises a vanilla call’s value when spot, strike, expiry, and rates are held fixed. This does not say that higher variance makes every poker bet better.',
      },
    ],
    formula: 'Var(X) = Σ pᵢ(xᵢ − μ)²',
    formulaKey:
      'μ = expected profit · SD = √Var · IV solves modelPrice(σ) = marketPrice',
    questions: [
      {
        prompt:
          'For independent identical hands, increasing the number of hands from 100 to 400 multiplies total SD by…',
        choices: ['2', '4', '16'],
        correct: 0,
        explanation:
          'Total standard deviation scales with √n, so √400 / √100 = 2.',
      },
      {
        prompt: 'Implied volatility is…',
        choices: [
          'A guaranteed forecast of next month’s moves.',
          'An option pricing model input inferred from a market premium.',
          'Poker equity in percentage form.',
        ],
        correct: 1,
        explanation:
          'IV is the volatility input that fits the observed premium under specified model assumptions; it is not a guarantee.',
      },
    ],
    source: {
      label: 'Options Industry Council · Options education',
      url: 'https://www.optionseducation.org/',
    },
  },
  {
    id: 'replication',
    number: '07',
    title: 'Build the same payoff twice',
    subtitle: 'Bring it together with hedges and put-call parity.',
    stage: 'Market mechanics',
    minutes: 22,
    poker: 'Payoff accounting',
    finance: 'Delta hedging & put-call parity',
    tags: ['Delta hedging', 'Put-call parity', 'Replication'],
    prerequisites: ['fold', 'variance'],
    objectives: [
      'Build a one-step replicating portfolio.',
      'Read delta as stock units, not a probability.',
      'Verify European put-call parity state by state.',
    ],
    bridge:
      'Poker teaches you to account for every branch of a payoff tree. Finance takes the next step: if tradable portfolios have identical cash flows in every state, no arbitrage requires identical prices.',
    boundary:
      'Poker hands generally cannot be dynamically replicated with traded securities. Exact one-step replication is not a real-world riskless delta-hedging strategy; discrete rebalancing, changing delta, jumps, transaction costs, and model error create risk.',
    scenario: {
      title: 'A call made of stock and cash',
      body: 'Use S₀ = 100, Sᵤ = 120, S𝒹 = 80, K = 100, and a 5% period rate. A call pays 20 in the up state and 0 in the down state.',
      calculation:
        'Δ = (20 − 0) / (120 − 80) = 0.5; cash = (0 − 0.5 × 80) / 1.05 = −38.10',
      takeaway:
        'Half a share plus borrowing 38.10 costs 11.90 and reproduces both call payoffs. The matching put costs 7.14; call − put = 100 − 100/1.05 = 4.76.',
    },
    concepts: [
      {
        title: 'A slope is a hedge ratio',
        body: 'The one-step delta is the payoff difference divided by the stock-price difference. Holding delta shares plus a cash position replicates the option in this two-state model.',
      },
      {
        title: 'Two portfolios, one payoff',
        body: 'At expiry, call + K in cash and put + stock both pay max(S, K). Before expiry, European options with matching strike and expiry on a non-dividend stock satisfy C − P = S₀ − PV(K).',
      },
      {
        title: 'State the contract',
        body: 'The lab uses European exercise, no dividends, frictionless markets, and a simple rate for one period. Dividends, early exercise, funding spreads, and trading constraints require different treatment.',
      },
    ],
    formula: 'C − P = S₀ − K / (1 + r)',
    formulaKey:
      'European options · same strike and expiry · no dividends · one-period simple rate',
    questions: [
      {
        prompt:
          'A call pays 30 or 0 when stock ends at 130 or 70. What is its one-step delta?',
        choices: ['0.3', '0.5', '0.7'],
        correct: 1,
        explanation:
          '(30 − 0) / (130 − 70) = 0.5 shares. This is a hedge ratio, not a forecast probability.',
      },
      {
        prompt:
          'For a non-dividend stock at 100, strike 100, and zero interest, European parity says…',
        choices: [
          'The call and put have equal prices.',
          'The put is always worthless.',
          'The call price must be 100.',
        ],
        correct: 0,
        explanation:
          'C − P = 100 − 100 = 0. Equal-strike, equal-expiry European calls and puts have equal prices here.',
      },
    ],
    source: {
      label: 'Options Industry Council · Put-call parity',
      url: 'https://www.optionseducation.org/advancedconcepts/put-call-parity',
    },
  },
  {
    id: 'risk',
    number: '08',
    title: 'Survive the swings',
    subtitle: 'Trade upside for certainty without hiding the price.',
    stage: 'Market mechanics',
    minutes: 24,
    poker: 'All-in cashouts & bankroll',
    finance: 'Insurance premiums & credit protection',
    tags: [
      'All-in insurance',
      'Kelly criterion',
      'Ruin risk',
      'Credit default swaps',
    ],
    prerequisites: ['equity', 'variance'],
    objectives: [
      'Compare showdown, cashout, and run-it-twice EV and dispersion.',
      'Size repeated risks with full and fractional Kelly stakes.',
      'Explain the useful—and limited—analogy between all-in protection and a credit default swap.',
    ],
    bridge:
      'An all-in cashout sells the whole uncertain pot claim for a guaranteed settlement. Loss-only insurance and credit protection instead pay when a defined event occurs while you retain the underlying exposure. Both teach risk transfer, but they are different payoff structures; probability, coverage, fees, and counterparty terms determine the price.',
    boundary:
      'A lost poker runout is not a corporate default, and a poker site cashout is not a tradable credit default swap. CDS pricing includes default timing, recovery, discounting, risk-neutral credit spreads, counterparty credit, collateral, and legal definitions. This lab uses a one-period physical-probability model and no market calibration.',
    scenario: {
      title: 'Three ways to settle the same all-in',
      body: 'You risk 100 chips to win 100 with 55% equity. A cashout offer charges 1% of the fair gross payout. Alternatively, two independent runouts split the pot in half.',
      calculation:
        'Showdown EV = 0.55(100) − 0.45(100) = 10; fair gross payout = 110; cashout net = 110(0.99) − 100 = 8.90',
      takeaway:
        'Running twice keeps 10 chips of EV and cuts standard deviation by √2 under the independence assumption. Cashing out removes runout variance but gives up 1.10 chips of EV as a fee.',
    },
    concepts: [
      {
        title: 'Certainty has an explicit price',
        body: 'A fair cashout pays equity times the eligible pot. Subtracting a fee lowers EV by exactly that fee. It can improve a player’s experience or liquidity, but it does not create an edge.',
      },
      {
        title: 'Twice is smoother, not safer forever',
        body: 'Two equal independent runouts have the same expected payoff as one runout and half its variance. Real boards share a depleted deck, so independence is an approximation; running twice also does not repair a negative-EV all-in.',
      },
      {
        title: 'Kelly targets growth, not comfort',
        body: 'Full Kelly maximizes expected logarithmic bankroll growth under fixed, known odds. Estimation error and changing games can make it aggressive, so practitioners often use a fraction. Proportional betting never reaches literal zero in this idealized model; the lab defines ruin as crossing a chosen drawdown floor over a finite horizon.',
      },
    ],
    formula: 'f* = p − (1 − p) / b',
    formulaKey:
      'p = physical win probability · b = net profit per chip risked · repeated independent bets · known, constant edge',
    questions: [
      {
        prompt:
          'If two equal runouts are independent and each has the same equity, running it twice changes…',
        choices: [
          'Expected payoff and variance.',
          'Variance, but not expected payoff.',
          'Expected payoff, but not variance.',
        ],
        correct: 1,
        explanation:
          'Averaging two half-sized independent outcomes preserves EV and halves variance, reducing standard deviation by √2.',
      },
      {
        prompt:
          'At even-money odds with 55% win probability, full Kelly risks what fraction of bankroll?',
        choices: ['5%', '10%', '55%'],
        correct: 1,
        explanation:
          'For b = 1, f* = 0.55 − 0.45 = 0.10. Fractional Kelly scales that result rather than changing the edge.',
      },
    ],
    source: {
      label: 'ISDA · Credit Derivatives Definitions',
      url: 'https://www.isda.org/book/2014-isda-credit-derivatives-definitions/',
    },
  },
]

export const moduleById = Object.fromEntries(
  modules.map((module) => [module.id, module]),
) as Record<ModuleId, Module>
export const totalMinutes = modules.reduce(
  (sum, module) => sum + module.minutes,
  0,
)
