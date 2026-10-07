export const callEV = (equity: number, pot: number, call: number) =>
  equity * pot - (1 - equity) * call
export const breakEvenEquity = (pot: number, call: number) =>
  call === 0 ? 0 : call / (pot + call)
export const optionProfit = (price: number, strike: number, premium: number) =>
  Math.max(price - strike, 0) - premium
export const insuranceProfit = (
  loss: number,
  coverage: number,
  premium: number,
) => -loss + Math.min(loss, coverage) - premium
export const fairPremium = (probability: number, coverage: number) =>
  probability * coverage

export type Lens = 'equity' | 'options' | 'insurance'
export function surfaceValue(lens: Lens, x: number, z: number): number {
  if (lens === 'equity') return x - (1 - x) * z * 2
  if (lens === 'options') return (Math.max(x * 200 - z * 160, 0) - 10) / 70
  return (-x * 200 + Math.min(x * 200, z * 200) - z * 40) / 100
}
