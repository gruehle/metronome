import { LAYER_LABELS, LAYERS, SOUNDS } from '../state/store';
import type { LayerId, SoundId, Store } from '../state/store';

// Use widely-supported BMP codepoints (U+2669 / U+266A / U+266C) — the
// Musical Symbols block (U+1D100+) is missing from iOS system fonts and
// renders as tofu.
const LAYER_GLYPH: Record<LayerId, string> = {
  downbeat: '♩',
  beat: '♩',
  '8th': '♪',
  '8thTriplet': '♪³',
  '16th': '♬',
};

export type MixerHandle = {
  el: HTMLElement;
  pulse: (id: LayerId) => void;
};

export function LayerMixer(store: Store): MixerHandle {
  const root = document.createElement('section');
  root.className = 'mixer is-collapsed';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mixer__toggle';
  toggle.setAttribute('aria-expanded', 'false');

  const labelText = document.createElement('span');
  labelText.className = 'section-label';
  labelText.textContent = 'Mixer';

  const chevron = document.createElement('span');
  chevron.className = 'mixer__chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '▸';

  toggle.append(labelText, chevron);
  root.append(toggle);

  const grid = document.createElement('div');
  grid.className = 'mixer__grid';
  root.append(grid);

  toggle.addEventListener('click', () => {
    const expanded = root.classList.toggle('is-collapsed');
    // `is-collapsed` being present means NOT expanded; invert for aria
    toggle.setAttribute('aria-expanded', String(!expanded));
  });

  const channels = {} as Record<LayerId, ReturnType<typeof Channel>>;
  for (const id of LAYERS) {
    const ch = Channel(id, store);
    channels[id] = ch;
    grid.append(ch.el);
  }

  store.subscribe((s) => {
    for (const id of LAYERS) channels[id].sync(s.layers[id]);
  });

  return {
    el: root,
    pulse: (id) => channels[id].pulse(),
  };
}

function Channel(id: LayerId, store: Store) {
  const el = document.createElement('div');
  el.className = `channel channel--${id}`;
  el.dataset.layer = id;

  const head = document.createElement('div');
  head.className = 'channel__head';
  const glyph = document.createElement('span');
  glyph.className = 'channel__glyph';
  glyph.textContent = LAYER_GLYPH[id];
  const name = document.createElement('span');
  name.className = 'channel__name';
  name.textContent = LAYER_LABELS[id];
  head.append(glyph, name);

  const fader = document.createElement('input');
  fader.type = 'range';
  fader.min = '0';
  fader.max = '100';
  fader.step = '1';
  fader.className = 'channel__fader';
  fader.setAttribute('aria-label', `${LAYER_LABELS[id]} volume`);

  const vol = document.createElement('div');
  vol.className = 'channel__vol';

  const mute = document.createElement('button');
  mute.type = 'button';
  mute.className = 'chip chip--mute';
  mute.textContent = 'M';
  mute.setAttribute('aria-pressed', 'false');

  const sound = document.createElement('select');
  sound.className = 'channel__sound';
  sound.setAttribute('aria-label', `${LAYER_LABELS[id]} sound`);
  for (const s of SOUNDS) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    sound.append(opt);
  }

  fader.addEventListener('input', () => {
    const v = Number(fader.value) / 100;
    store.update((d) => {
      const layer = d.layers[id];
      layer.volume = v;
      if (v > 0) {
        layer.muted = false;
        layer.prevVolume = v;
      }
    });
  });

  mute.addEventListener('click', () => {
    store.update((d) => {
      const layer = d.layers[id];
      if (layer.muted || layer.volume === 0) {
        layer.muted = false;
        layer.volume = layer.prevVolume > 0 ? layer.prevVolume : 0.7;
      } else {
        layer.prevVolume = layer.volume;
        layer.muted = true;
      }
    });
  });

  sound.addEventListener('change', () => {
    store.update((d) => {
      d.layers[id].sound = sound.value as SoundId;
    });
  });

  el.append(head, fader, vol, mute, sound);

  return {
    el,
    sync(layer: { volume: number; sound: string; muted: boolean }): void {
      const pct = Math.round(layer.volume * 100);
      if (fader.value !== String(pct)) fader.value = String(pct);
      vol.textContent = layer.muted ? 'muted' : `${pct}%`;
      el.classList.toggle('is-muted', layer.muted || layer.volume === 0);
      mute.classList.toggle('is-active', layer.muted);
      mute.setAttribute('aria-pressed', String(layer.muted));
      mute.setAttribute(
        'aria-label',
        layer.muted ? `Unmute ${LAYER_LABELS[id]}` : `Mute ${LAYER_LABELS[id]}`,
      );
      if (sound.value !== layer.sound) sound.value = layer.sound;
    },
    pulse(): void {
      el.classList.remove('is-pulsing');
      // force reflow so the animation restarts
      void el.offsetWidth;
      el.classList.add('is-pulsing');
    },
  };
}
