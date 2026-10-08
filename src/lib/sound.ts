// Tiny synthesized sound kit. No audio files; nothing plays unless enabled.
export type SoundKind = 'deal' | 'chip' | 'check' | 'fold' | 'win' | 'lose'

let context: AudioContext | null = null

function tone(
  ctx: AudioContext,
  start: number,
  from: number,
  to: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(from, start)
  oscillator.frequency.exponentialRampToValueAtTime(to, start + duration)
  gain.gain.setValueAtTime(volume, start)
  gain.gain.exponentialRampToValueAtTime(0.0008, start + duration)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

export function playSound(kind: SoundKind): boolean {
  try {
    context ??= new AudioContext()
    void context.resume()
    const now = context.currentTime
    if (kind === 'deal') tone(context, now, 1800, 900, 0.05, 0.02, 'triangle')
    else if (kind === 'chip') {
      tone(context, now, 2400, 1900, 0.04, 0.025, 'square')
      tone(context, now + 0.05, 2200, 1700, 0.04, 0.018, 'square')
    } else if (kind === 'check') tone(context, now, 420, 380, 0.06, 0.04)
    else if (kind === 'fold') tone(context, now, 320, 180, 0.16, 0.035)
    else if (kind === 'win') {
      tone(context, now, 660, 660, 0.14, 0.04)
      tone(context, now + 0.12, 880, 880, 0.2, 0.04)
    } else tone(context, now, 360, 260, 0.22, 0.035)
    return true
  } catch {
    return false
  }
}
