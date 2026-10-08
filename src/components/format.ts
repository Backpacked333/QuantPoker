export const pct = (v: number) => `${(v * 100).toFixed(1)}%`
export const pct0 = (v: number) => `${Math.round(v * 100)}%`
export const signed = (v: number) =>
  Math.abs(v) < 0.05
    ? '0'
    : `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(Math.abs(v) < 100 ? 1 : 0)}`
