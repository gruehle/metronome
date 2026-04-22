import { LAYER_PERIOD_TICKS, LAYERS } from '../state/store';
import type { LayerId, State } from '../state/store';
import { playClick } from './sounds';

const TICKS_PER_BEAT = 24;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;

// A scheduled hit that the UI may want to highlight when it actually fires.
export type BeatEvent = {
  audioTime: number; // AudioContext time at which this hit will sound
  beatIndex: number; // 0-based position within the measure
  tickInBeat: number; // 0..23
  firedLayers: LayerId[];
};

export type SchedulerCallbacks = {
  getState: () => State;
  onBeat: (event: BeatEvent) => void;
};

export class Scheduler {
  private readonly ctx: AudioContext;
  private readonly masterGain: GainNode;
  private readonly callbacks: SchedulerCallbacks;
  private worker: Worker | null = null;

  private running = false;
  private nextTickTime = 0;
  private tickCounter = 0;

  constructor(ctx: AudioContext, masterGain: GainNode, callbacks: SchedulerCallbacks) {
    this.ctx = ctx;
    this.masterGain = masterGain;
    this.callbacks = callbacks;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tickCounter = 0;
    // small offset to give the scheduler breathing room on the very first hit
    this.nextTickTime = this.ctx.currentTime + 0.05;

    if (!this.worker) {
      this.worker = new Worker(new URL('./timer-worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.addEventListener('message', (e) => {
        if (e.data === 'tick') this.scheduleWindow();
      });
    }
    this.worker.postMessage({ type: 'start', intervalMs: LOOKAHEAD_MS });
    // Schedule immediately so the first hit fires without waiting a tick.
    this.scheduleWindow();
  }

  stop(): void {
    this.running = false;
    this.worker?.postMessage({ type: 'stop' });
  }

  private scheduleWindow(): void {
    if (!this.running) return;
    const state = this.callbacks.getState();
    // BPM is expressed in "beats per minute" relative to the denominator:
    // in 6/8, a BPM of 120 means 120 eighth notes per minute. So scale by
    // 4/den so that a larger denominator (eighth/sixteenth) shortens the beat.
    const secondsPerBeat = (60 / state.bpm) * (4 / state.sig.den);
    const secondsPerTick = secondsPerBeat / TICKS_PER_BEAT;
    const ticksPerMeasure = TICKS_PER_BEAT * Math.max(1, state.sig.num);

    while (this.nextTickTime < this.ctx.currentTime + SCHEDULE_AHEAD_S) {
      const measureTick = this.tickCounter % ticksPerMeasure;
      const beatIndex = Math.floor(measureTick / TICKS_PER_BEAT);
      const tickInBeat = measureTick % TICKS_PER_BEAT;
      const isBeatStart = tickInBeat === 0;
      const isMeasureStart = measureTick === 0;

      // Pick at most one layer per tick: the highest-priority (largest note
      // value) enabled layer whose grid lines up with this tick. Priority
      // follows LAYERS order: downbeat > beat > 8th > 8th triplet > 16th.
      let chosenLayer: LayerId | null = null;
      for (const layerId of LAYERS) {
        const layer = state.layers[layerId];
        if (layer.muted || layer.volume <= 0) continue;

        if (layerId === 'downbeat') {
          if (!isMeasureStart) continue;
        } else if (layerId === 'beat') {
          // beat layer fires on every beat except beat 1 (downbeat territory)
          if (!isBeatStart || isMeasureStart) continue;
        } else {
          const period = LAYER_PERIOD_TICKS[layerId];
          if (tickInBeat % period !== 0) continue;
        }

        chosenLayer = layerId;
        break;
      }

      if (chosenLayer) {
        const layer = state.layers[chosenLayer];
        // Give the downbeat a half-step pitch lift when it shares a sound
        // with the beat layer — subtle but useful for distinguishing them.
        const pitch = chosenLayer === 'downbeat' ? 2 : 0;
        playClick(this.ctx, this.masterGain, this.nextTickTime, layer.volume, layer.sound, {
          pitch,
        });
        this.callbacks.onBeat({
          audioTime: this.nextTickTime,
          beatIndex,
          tickInBeat,
          firedLayers: [chosenLayer],
        });
      }

      this.nextTickTime += secondsPerTick;
      this.tickCounter += 1;
    }
  }
}
