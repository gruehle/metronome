import type { State } from '../state/store';
import { Scheduler } from './scheduler';
import type { BeatEvent } from './scheduler';

export type { BeatEvent };

export class Engine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private scheduler: Scheduler | null = null;
  private beatListeners = new Set<(e: BeatEvent) => void>();

  constructor(private readonly getState: () => State) {}

  // Must be called from a user gesture handler on iOS before audio will play.
  async ensureReady(): Promise<void> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1.0;
      this.masterGain.connect(this.ctx.destination);
      this.scheduler = new Scheduler(this.ctx, this.masterGain, {
        getState: this.getState,
        onBeat: (e) => this.beatListeners.forEach((fn) => fn(e)),
      });
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  async start(): Promise<void> {
    await this.ensureReady();
    this.scheduler?.start();
  }

  stop(): void {
    this.scheduler?.stop();
  }

  onBeat(fn: (e: BeatEvent) => void): () => void {
    this.beatListeners.add(fn);
    return () => this.beatListeners.delete(fn);
  }

  audioTime(): number {
    return this.ctx?.currentTime ?? 0;
  }
}
