import type { Engine } from '../audio/engine';
import type { Store } from '../state/store';

export type PlayButtonHandle = {
  el: HTMLElement;
  flash: (beatIndex: number) => void;
};

// Duration the button holds its "peak" scale+shadow before the base CSS
// transition carries it back to rest. Shorter than any realistic beat
// interval (200 ms at 300 BPM) so each beat gets a full attack phase.
const PULSE_HOLD_MS = 90;

export function PlayButton(store: Store, engine: Engine): PlayButtonHandle {
  const wrapper = document.createElement('div');
  wrapper.className = 'play-button__wrapper';

  const btn = document.createElement('button');
  btn.className = 'play-button';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Start');
  btn.setAttribute('aria-pressed', 'false');

  // Play triangle is shown when stopped; the beat number takes over
  // during playback. Both live in the button so CSS can cross-fade via
  // is-playing without touching the DOM on each beat.
  const icon = document.createElement('span');
  icon.className = 'play-button__icon';
  icon.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="7,4 21,12 7,20"/></svg>';

  const beat = document.createElement('span');
  beat.className = 'play-button__beat';
  beat.setAttribute('aria-hidden', 'true');

  btn.append(icon, beat);

  // Dedicated polite live-region so screen readers announce the play-state
  // transition (once per toggle). The beat counter is intentionally left
  // silent; announcing every beat would be unusable.
  const status = document.createElement('span');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  wrapper.append(btn, status);

  let pulseTimer: ReturnType<typeof setTimeout> | null = null;

  const updateVisual = (): void => {
    const playing = store.get().playing;
    btn.classList.toggle('is-playing', playing);
    btn.setAttribute('aria-label', playing ? 'Stop' : 'Start');
    btn.setAttribute('aria-pressed', String(playing));
    const nextStatus = playing ? 'Playing' : 'Stopped';
    // Guard the textContent write so unrelated store updates (volume
    // drags, etc.) don't spam a "Playing" re-announce.
    if (status.textContent !== nextStatus) status.textContent = nextStatus;
    if (!playing) {
      beat.textContent = '';
      btn.classList.remove('is-pulse', 'is-downbeat');
      if (pulseTimer) {
        clearTimeout(pulseTimer);
        pulseTimer = null;
      }
    }
  };

  btn.addEventListener('click', async () => {
    const { playing } = store.get();
    if (playing) {
      engine.stop();
      store.update((d) => {
        d.playing = false;
      });
    } else {
      await engine.start();
      store.update((d) => {
        d.playing = true;
      });
    }
  });

  store.subscribe(updateVisual);

  return {
    el: wrapper,
    flash(beatIndex: number): void {
      beat.textContent = String(beatIndex + 1);
      btn.classList.toggle('is-downbeat', beatIndex === 0);
      // Add is-pulse to snap transform/box-shadow to the peak (short CSS
      // transition), then remove it after a hold so the longer base
      // transition decays back smoothly. If the next beat lands during
      // the decay, the transition interpolates from the current mid-
      // animation value to the peak again — no visual snap.
      btn.classList.add('is-pulse');
      if (pulseTimer) clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => {
        btn.classList.remove('is-pulse');
        pulseTimer = null;
      }, PULSE_HOLD_MS);
    },
  };
}
