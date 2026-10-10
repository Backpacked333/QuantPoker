import { callEV } from './finance'

export type CallSimulation = {
  chance: number
  call: number
  outcomes: boolean[]
  cumulative: number[]
  wins: number
  net: number
  expectedNet: number
}

export function simulateCalls(
  chance: number,
  call: number,
  random: () => number = Math.random,
): CallSimulation {
  if (!Number.isFinite(chance) || chance < 0 || chance > 100)
    throw new RangeError('Win chance must be between 0 and 100.')
  if (!Number.isFinite(call) || call < 0)
    throw new RangeError('Call price must be nonnegative.')
  const outcomes: boolean[] = []
  const cumulative = [0]
  let wins = 0
  let net = 0
  for (let i = 0; i < 100; i++) {
    const win = random() < chance / 100
    outcomes.push(win)
    if (win) wins++
    net += win ? 100 : -call
    cumulative.push(net)
  }
  return {
    chance,
    call,
    outcomes,
    cumulative,
    wins,
    net,
    expectedNet: callEV(chance / 100, 100, call) * 100,
  }
}
