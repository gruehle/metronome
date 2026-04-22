import type { Engine } from '../audio/engine';
import type { Store } from '../state/store';

export function PlayButton(store: Store, engine: Engine): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'play-button__wrapper';

  const btn = document.createElement('button');
  btn.className = 'play-button';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Start');
  btn.setAttribute('aria-pressed', 'false');

  // Dedicated polite live-region so screen readers announce the play-state
  // transition (once per toggle). The beat counter is intentionally left
  // silent; announcing every beat would be unusable.
  const status = document.createElement('span');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  wrapper.append(btn, status);

  const updateVisual = (): void => {
    const playing = store.get().playing;
    btn.classList.toggle('is-playing', playing);
    btn.setAttribute('aria-label', playing ? 'Stop' : 'Start');
    btn.setAttribute('aria-pressed', String(playing));
    btn.innerHTML = playing
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="7,4 21,12 7,20"/></svg>';
    status.textContent = playing ? 'Playing' : 'Stopped';
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
  return wrapper;
}
