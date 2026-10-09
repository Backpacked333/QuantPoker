// Bet-size presets for the action bar, shared by the Atlas trainer and live
// tables. Sizes are fractions of the pot after calling, clamped to the legal
// raise range; the trainer adds modeled EV on top.
export type Preset = { label: string; key: string; to: number; ev?: number }

export function buildPresets(
  legal: { canRaise: boolean; minRaiseTo: number; maxRaiseTo: number },
  pot: number,
  toCall: number,
  bets: readonly number[],
): Preset[] {
  if (!legal.canRaise) return []
  const current = Math.max(...bets)
  const base = pot + toCall
  return [
    { label: '½ pot', key: '1', to: Math.round(current + base / 2) },
    { label: '¾ pot', key: '2', to: Math.round(current + (base * 3) / 4) },
    { label: 'Pot', key: '3', to: Math.round(current + base) },
    { label: 'All-in', key: '4', to: legal.maxRaiseTo },
  ].map((preset) => ({
    ...preset,
    to: Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, preset.to)),
  }))
}
