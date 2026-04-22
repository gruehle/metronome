import type { LayerId, SoundId, Store } from '../state/store';

type PresetLayer = { sound: SoundId; volume: number };
type Preset = {
  label: string;
  glyph: string;
  layers: Partial<Record<LayerId, PresetLayer>>;
};

const PRESETS: Preset[] = [
  {
    label: 'Quarter notes',
    glyph: '♩',
    layers: {
      downbeat: { sound: 'woodblock', volume: 1.0 },
      beat: { sound: 'click', volume: 0.4 },
    },
  },
  {
    label: 'Eighth notes',
    glyph: '♪',
    layers: {
      downbeat: { sound: 'woodblock', volume: 1.0 },
      beat: { sound: 'click', volume: 0.4 },
      '8th': { sound: 'click', volume: 0.02 },
    },
  },
  {
    label: 'Eighth triplets',
    glyph: '♪³',
    layers: {
      downbeat: { sound: 'woodblock', volume: 1.0 },
      beat: { sound: 'click', volume: 0.4 },
      '8thTriplet': { sound: 'click', volume: 0.02 },
    },
  },
  {
    label: 'Sixteenth notes',
    glyph: '♬',
    layers: {
      downbeat: { sound: 'woodblock', volume: 1.0 },
      beat: { sound: 'click', volume: 0.4 },
      '8th': { sound: 'click', volume: 0.03 },
      '16th': { sound: 'click', volume: 0.01 },
    },
  },
];

export function Presets(store: Store): HTMLElement {
  const root = document.createElement('section');
  root.className = 'presets';

  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = 'Presets';
  root.append(label);

  const grid = document.createElement('div');
  grid.className = 'presets__grid';
  root.append(grid);

  for (const p of PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-button';
    btn.textContent = p.glyph;
    btn.setAttribute('aria-label', p.label);
    btn.title = p.label;
    btn.addEventListener('click', () => applyPreset(store, p));
    grid.append(btn);
  }

  return root;
}

function applyPreset(store: Store, preset: Preset): void {
  store.update((d) => {
    for (const id of Object.keys(d.layers) as LayerId[]) {
      const target = preset.layers[id];
      const layer = d.layers[id];
      layer.muted = false;
      if (target) {
        layer.sound = target.sound;
        layer.volume = target.volume;
        if (target.volume > 0) layer.prevVolume = target.volume;
      } else {
        layer.volume = 0;
      }
    }
  });
}
