import type { State } from '../state/store';
import { Scheduler } from './scheduler';
import type { BeatEvent } from './scheduler';

export type { BeatEvent };

export class Engine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private scheduler: Scheduler | null = null;
  private beatListeners = new Set<(e: BeatEvent) => void>();
  private silentUnlock: HTMLAudioElement | null = null;

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
      // Phones are quiet through speakers, so boost the pre-limiter feed.
      // Signals can now peak above 0 dBFS; the compressor below catches
      // them so the output never digitally clips at the destination.
      this.masterGain.gain.value = 3.5;

      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -6;
      compressor.knee.value = 6;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.05;

      this.masterGain.connect(compressor).connect(this.ctx.destination);

      this.scheduler = new Scheduler(this.ctx, this.masterGain, {
        getState: this.getState,
        onBeat: (e) => this.beatListeners.forEach((fn) => fn(e)),
      });
    }
    // iOS Safari routes AudioContext through the "ambient" audio session
    // by default, which is muted by the hardware ringer/silent switch.
    // Playing a short silent HTMLMediaElement during the user gesture
    // flips the session to "playback" so media volume (not the silent
    // switch) controls audibility.
    this.primeSilentUnlock();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  private primeSilentUnlock(): void {
    if (this.silentUnlock) return;
    const audio = new Audio(buildSilentWavDataUrl());
    audio.loop = true;
    audio.volume = 0.001;
    audio.setAttribute('playsinline', '');
    // Ignore rejection: if autoplay policy blocks it for some reason, the
    // normal `ctx.resume()` path is still attempted below.
    audio.play().catch(() => {});
    this.silentUnlock = audio;
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

// Generates a 100 ms silent 8-bit mono WAV as a data URL. Tiny (~870 B
// encoded) and doesn't depend on bundled assets. The audio element playing
// this flips iOS Safari out of the ambient audio session.
function buildSilentWavDataUrl(): string {
  const sampleRate = 8000;
  const samples = 800;
  const totalSize = 44 + samples;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  // RIFF header
  view.setUint32(0, 0x52494646, false); // 'RIFF'
  view.setUint32(4, totalSize - 8, true);
  view.setUint32(8, 0x57415645, false); // 'WAVE'
  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // 'fmt '
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  // data chunk
  view.setUint32(36, 0x64617461, false); // 'data'
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) view.setUint8(44 + i, 0x80); // silent center for unsigned 8-bit
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
}
