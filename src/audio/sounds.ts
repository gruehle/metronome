import type { SoundId } from '../state/store';

export type ClickOptions = {
  // Pitch bias: 0 = normal, positive raises, negative lowers. Used so e.g.
  // the downbeat and beat layers can share the same sound but remain
  // distinguishable.
  pitch?: number;
};

// All sounds are short synthesized transients so there are no assets to load.
// They connect: osc|noise -> filter? -> gain -> destination gain.
export function playClick(
  ctx: AudioContext,
  destination: AudioNode,
  when: number,
  volume: number,
  sound: SoundId,
  options: ClickOptions = {},
): void {
  if (volume <= 0) return;
  const safeVol = Math.min(1, volume);

  const out = ctx.createGain();
  out.gain.value = safeVol;
  out.connect(destination);

  const pitchMul = Math.pow(2, (options.pitch ?? 0) / 12);

  let source: AudioScheduledSourceNode;
  switch (sound) {
    case 'click':
      source = synthBlip(ctx, out, when, 1000 * pitchMul, 'square', 0.03);
      break;
    case 'woodblock':
      source = synthWoodblock(ctx, out, when, 880 * pitchMul);
      break;
    case 'cowbell':
      source = synthCowbell(ctx, out, when, 560 * pitchMul);
      break;
    case 'beep':
      source = synthBlip(ctx, out, when, 1760 * pitchMul, 'sine', 0.05);
      break;
    case 'shaker':
      source = synthShaker(ctx, out, when);
      break;
  }

  // Disconnect once the source has fully stopped. `onended` fires on the
  // audio thread so it can't race with the envelope the way a setTimeout
  // keyed off `when` could (that version cut sound off when `when` landed
  // slightly before `ctx.currentTime`).
  source.onended = (): void => {
    try {
      out.disconnect();
    } catch {
      /* already disconnected */
    }
  };
}

function synthBlip(
  ctx: AudioContext,
  out: AudioNode,
  when: number,
  freq: number,
  type: OscillatorType,
  decay: number,
): OscillatorNode {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(1, when + 0.001);
  env.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  osc.connect(env).connect(out);
  osc.start(when);
  osc.stop(when + decay + 0.02);
  return osc;
}

function synthWoodblock(
  ctx: AudioContext,
  out: AudioNode,
  when: number,
  freq: number,
): OscillatorNode {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'triangle';
  // Short pitch drop gives the characteristic "tok".
  osc.frequency.setValueAtTime(freq * 1.35, when);
  osc.frequency.exponentialRampToValueAtTime(freq, when + 0.015);

  // Pure-exponential envelope. Mixing linear and exponential ramps can
  // cause per-hit attack variance when the ramp-junction sample doesn't
  // quantize the same way each time — this is the common WebAudio
  // "click" pattern: start tiny, exp-ramp up, exp-ramp down.
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(1, when + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);

  osc.connect(env).connect(out);
  osc.start(when);
  osc.stop(when + 0.1);
  return osc;
}

function synthCowbell(
  ctx: AudioContext,
  out: AudioNode,
  when: number,
  base: number,
): OscillatorNode {
  // Two detuned square oscillators through a bandpass — the classic 808 recipe.
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = base * 1.5;
  bp.Q.value = 2;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(1, when + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, when + 0.2);

  const o1 = ctx.createOscillator();
  o1.type = 'square';
  o1.frequency.value = base;
  const o2 = ctx.createOscillator();
  o2.type = 'square';
  o2.frequency.value = base * 1.48;

  o1.connect(bp);
  o2.connect(bp);
  bp.connect(env).connect(out);
  o1.start(when);
  o2.start(when);
  o1.stop(when + 0.22);
  o2.stop(when + 0.22);
  // o1 and o2 stop at the same time — pick one to signal completion.
  return o1;
}

let noiseBuffer: AudioBuffer | null = null;
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = Math.floor(ctx.sampleRate * 0.25);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

function synthShaker(ctx: AudioContext, out: AudioNode, when: number): AudioBufferSourceNode {
  // Shaker = noise through a mid-frequency bandpass, softer attack and
  // longer tail than a hi-hat — gives the characteristic "shh-ka" sound.
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 5000;
  bp.Q.value = 1.1;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(1, when + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);

  src.connect(bp).connect(env).connect(out);
  src.start(when);
  src.stop(when + 0.15);
  return src;
}
