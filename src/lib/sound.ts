// Small synthesized sound kit. No audio files; nothing plays unless enabled.
// Cards and chips are filtered noise bursts (paper snap, clay clack); tonal
// cues are kept for state changes. Everything runs through one master gain.
export type SoundKind = 'deal' | 'chip' | 'check' | 'fold' | 'win' | 'lose'

let context: AudioContext | null = null
let master: GainNode | null = null
let noise: AudioBuffer | null = null
let volume = 0.7

/** Master volume, 0–1. Applies to the next and any playing sounds. */
export function setVolume(value: number) {
  volume = Math.min(1, Math.max(0, value))
  if (master && context) master.gain.setValueAtTime(volume, context.currentTime)
}

function setup() {
  context ??= new AudioContext()
  if (!master) {
    master = context.createGain()
    master.gain.value = volume
    master.connect(context.destination)
  }
  if (!noise) {
    noise = context.createBuffer(
      1,
      context.sampleRate * 0.25,
      context.sampleRate,
    )
    const data = noise.getChannelData(0)
    // Deterministic noise keeps every snap sounding the same.
    let seed = 7
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647
      data[i] = (seed / 2147483647) * 2 - 1
    }
  }
  return { ctx: context, out: master, buffer: noise }
}

function tone(
  ctx: AudioContext,
  out: AudioNode,
  start: number,
  from: number,
  to: number,
  duration: number,
  level: number,
  type: OscillatorType = 'sine',
) {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(from, start)
  oscillator.frequency.exponentialRampToValueAtTime(to, start + duration)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(level, start + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain).connect(out)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

/** A filtered noise burst: `frequency` sets the material, `q` its ring. */
function burst(
  ctx: AudioContext,
  out: AudioNode,
  buffer: AudioBuffer,
  start: number,
  frequency: number,
  q: number,
  duration: number,
  level: number,
) {
  const source = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  source.buffer = buffer
  filter.type = 'bandpass'
  filter.frequency.value = frequency
  filter.Q.value = q
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(level, start + 0.003)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  source.connect(filter).connect(gain).connect(out)
  source.start(start, Math.random() * 0.15)
  source.stop(start + duration + 0.02)
}

export function playSound(kind: SoundKind): boolean {
  try {
    const { ctx, out, buffer } = setup()
    void ctx.resume()
    const now = ctx.currentTime
    if (kind === 'deal') {
      // Card leaving the deck, then landing on felt.
      burst(ctx, out, buffer, now, 3800, 0.9, 0.05, 0.22)
      burst(ctx, out, buffer, now + 0.045, 1400, 1.2, 0.04, 0.12)
    } else if (kind === 'chip') {
      // Two clay chips meeting: a bright clack and a short ring.
      burst(ctx, out, buffer, now, 5200, 6, 0.035, 0.35)
      tone(ctx, out, now, 3900, 3700, 0.06, 0.03)
      burst(ctx, out, buffer, now + 0.06, 4600, 6, 0.03, 0.22)
    } else if (kind === 'check') {
      // Knuckles on the rail.
      burst(ctx, out, buffer, now, 260, 2, 0.07, 0.5)
      burst(ctx, out, buffer, now + 0.11, 240, 2, 0.06, 0.35)
    } else if (kind === 'fold') {
      burst(ctx, out, buffer, now, 2200, 0.7, 0.14, 0.14)
      tone(ctx, out, now, 320, 190, 0.18, 0.03)
    } else if (kind === 'win') {
      tone(ctx, out, now, 660, 660, 0.16, 0.05)
      tone(ctx, out, now + 0.1, 830, 830, 0.18, 0.045)
      tone(ctx, out, now + 0.2, 990, 990, 0.3, 0.045)
    } else {
      tone(ctx, out, now, 380, 280, 0.26, 0.04)
    }
    return true
  } catch {
    return false
  }
}
