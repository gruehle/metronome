import { MAX_BPM, MIN_BPM } from '../state/store';
import type { Store } from '../state/store';

const RESET_GAP_MS = 2000;
const MAX_TAPS = 4;

export function TapTempo(store: Store): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip chip--tap tap-button';
  btn.textContent = 'Tap';

  const taps: number[] = [];
  btn.addEventListener('click', () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > RESET_GAP_MS) taps.length = 0;
    taps.push(now);
    if (taps.length > MAX_TAPS) taps.shift();
    if (taps.length >= 2) {
      const deltas: number[] = [];
      for (let i = 1; i < taps.length; i++) deltas.push(taps[i] - taps[i - 1]);
      const avgMs = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      const bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(60000 / avgMs)));
      store.update((d) => {
        d.bpm = bpm;
      });
    }
  });

  return btn;
}
