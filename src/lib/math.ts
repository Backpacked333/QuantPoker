function finite(...values: number[]) {
  if (values.some((value) => !Number.isFinite(value)))
    throw new RangeError("Inputs must be finite numbers.");
}

function probability(value: number) {
  finite(value);
  if (value < 0 || value > 1)
    throw new RangeError("Probability must be between zero and one.");
}

export function callValue(pot: number, cost: number, equity: number) {
  finite(pot, cost);
  probability(equity);
  if (pot <= 0 || cost < 0)
    throw new RangeError("Use a positive pot and a nonnegative cost.");
  return {
    threshold: cost / (pot + cost),
    ev: equity * pot - (1 - equity) * cost,
    finalPot: pot + cost,
  };
}

export function hitProbability(outs: number, unseen: number, draws: number) {
  finite(outs, unseen, draws);
  if (
    ![outs, unseen, draws].every(Number.isInteger) ||
    unseen < 1 ||
    outs < 0 ||
    outs > unseen ||
    draws < 0 ||
    draws > unseen
  ) {
    throw new RangeError(
      "Use integer card counts with outs and draws no greater than unseen cards.",
    );
  }
  let miss = 1;
  for (let i = 0; i < draws; i++)
    miss *= Math.max(0, unseen - outs - i) / (unseen - i);
  return 1 - miss;
}

export function showdownEquity(win: number, tie: number) {
  probability(win);
  probability(tie);
  if (win + tie > 1 + 1e-12)
    throw new RangeError("Win and tie probabilities cannot exceed 100%.");
  return win + tie / 2;
}

export function betValue(
  pot: number,
  bet: number,
  fold: number,
  equity: number,
) {
  finite(pot, bet);
  probability(fold);
  probability(equity);
  if (pot <= 0 || bet < 0)
    throw new RangeError("Use a positive pot and a nonnegative bet.");
  const calledEV = equity * (pot + bet) - (1 - equity) * bet;
  return {
    ev: fold * pot + (1 - fold) * calledEV,
    calledEV,
    bluffThreshold: bet / (pot + bet),
  };
}

export function binaryRisk(
  win: number,
  gain: number,
  loss: number,
  hands: number,
) {
  probability(win);
  finite(gain, loss, hands);
  if (gain < 0 || loss < 0 || hands < 1 || !Number.isInteger(hands))
    throw new RangeError(
      "Use nonnegative payoffs and a positive integer number of hands.",
    );
  const mean = win * gain - (1 - win) * loss;
  const variance = win * (gain - mean) ** 2 + (1 - win) * (-loss - mean) ** 2;
  return {
    mean,
    variance,
    sd: Math.sqrt(variance),
    totalMean: hands * mean,
    totalSD: Math.sqrt(hands * variance),
  };
}

export function binomial(
  spot: number,
  strike: number,
  up: number,
  down: number,
  rate: number,
) {
  finite(spot, strike, up, down, rate);
  if (
    spot <= 0 ||
    strike <= 0 ||
    down <= 0 ||
    !(down < 1 + rate && 1 + rate < up)
  ) {
    throw new RangeError(
      "No-arbitrage requires 0 < d < 1 + r < u, with positive spot and strike.",
    );
  }
  const stockUp = spot * up;
  const stockDown = spot * down;
  const callUp = Math.max(stockUp - strike, 0);
  const callDown = Math.max(stockDown - strike, 0);
  const q = (1 + rate - down) / (up - down);
  const call = (q * callUp + (1 - q) * callDown) / (1 + rate);
  const put =
    (q * Math.max(strike - stockUp, 0) +
      (1 - q) * Math.max(strike - stockDown, 0)) /
    (1 + rate);
  const delta = (callUp - callDown) / (stockUp - stockDown);
  const cash = (callDown - delta * stockDown) / (1 + rate);
  return {
    q,
    call,
    put,
    delta,
    cash,
    stockUp,
    stockDown,
    callUp,
    callDown,
    parity: spot - strike / (1 + rate),
  };
}

export function normalCDF(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const density = Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
  const tail =
    density *
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}

export function blackScholesCall(
  spot: number,
  strike: number,
  years: number,
  rate: number,
  volatility: number,
) {
  finite(spot, strike, years, rate, volatility);
  if (spot <= 0 || strike <= 0 || years < 0 || volatility < 0)
    throw new RangeError("Invalid Black–Scholes inputs.");
  if (years === 0) return Math.max(spot - strike, 0);
  if (volatility === 0)
    return Math.max(spot - strike * Math.exp(-rate * years), 0);
  const scale = volatility * Math.sqrt(years);
  const d1 =
    (Math.log(spot / strike) + (rate + volatility ** 2 / 2) * years) / scale;
  return (
    spot * normalCDF(d1) -
    strike * Math.exp(-rate * years) * normalCDF(d1 - scale)
  );
}

export function impliedVolatility(
  premium: number,
  spot: number,
  strike: number,
  years: number,
  rate: number,
) {
  finite(premium, spot, strike, years, rate);
  if (years <= 0)
    throw new RangeError("Implied volatility needs time remaining.");
  const lower = blackScholesCall(spot, strike, years, rate, 0);
  if (premium < lower || premium >= spot)
    throw new RangeError("Premium is outside no-arbitrage bounds.");
  if (premium === lower) return 0;
  let lo = 0;
  let hi = 1;
  while (blackScholesCall(spot, strike, years, rate, hi) < premium && hi < 64)
    hi *= 2;
  if (blackScholesCall(spot, strike, years, rate, hi) < premium)
    throw new RangeError("Volatility exceeds the solver range.");
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (blackScholesCall(spot, strike, years, rate, mid) < premium) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
