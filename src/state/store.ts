export type SoundId =
  | 'click'
  | 'woodblock'
  | 'cowbell'
  | 'beep'
  | 'shaker';

export const SOUNDS: SoundId[] = ['click', 'woodblock', 'cowbell', 'beep', 'shaker'];

export type LayerId = 'downbeat' | 'beat' | '8th' | '8thTriplet' | '16th';

export const LAYERS: LayerId[] = ['downbeat', 'beat', '8th', '8thTriplet', '16th'];

// Subdivision layers (exclude the two quarter-grid layers). Used below for
// the period table — downbeat/beat don't have a period entry because the
// scheduler handles them via special-case logic, not modular arithmetic.
export type SubdivisionLayerId = Exclude<LayerId, 'downbeat' | 'beat'>;

export const LAYER_LABELS: Record<LayerId, string> = {
  downbeat: 'Downbeat',
  beat: 'Beat',
  '8th': '8th',
  '8thTriplet': '8th triplet',
  '16th': '16th',
};

// Each beat is divided into 24 ticks. A subdivision layer fires at ticks
// whose index is a multiple of (24 / notesPerBeat). downbeat/beat are on
// the quarter-note grid but the scheduler picks them by measure position,
// not period, so they're intentionally not in this table.
export const LAYER_PERIOD_TICKS: Record<SubdivisionLayerId, number> = {
  '8th': 12,
  '8thTriplet': 8,
  '16th': 6,
};

export type Layer = {
  volume: number; // 0..1
  sound: SoundId;
  muted: boolean;
  // remembers prior volume when muted so unmute restores it
  prevVolume: number;
};

export const MIN_BPM = 30;
export const MAX_BPM = 300;
export const MIN_SIG_NUM = 1;
export const MAX_SIG_NUM = 16;
export const VALID_DENS = [2, 4, 8, 16] as const;
export type ValidDen = (typeof VALID_DENS)[number];

export type TimeSignature = {
  num: number; // 1..16
  den: ValidDen;
};

export type State = {
  bpm: number;
  sig: TimeSignature;
  layers: Record<LayerId, Layer>;
  playing: boolean;
};

const DEFAULT_STATE: State = {
  bpm: 100,
  sig: { num: 4, den: 4 },
  layers: {
    downbeat: { volume: 1.0, sound: 'woodblock', muted: false, prevVolume: 1.0 },
    beat: { volume: 0.7, sound: 'click', muted: false, prevVolume: 0.7 },
    '8th': { volume: 0, sound: 'click', muted: false, prevVolume: 0.4 },
    '8thTriplet': { volume: 0, sound: 'click', muted: false, prevVolume: 0.4 },
    '16th': { volume: 0, sound: 'shaker', muted: false, prevVolume: 0.3 },
  },
  playing: false,
};

const STORAGE_KEY = 'metronome.state.v1';

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function validateLayer(raw: unknown, defaults: Layer): Layer {
  if (!raw || typeof raw !== 'object') return { ...defaults };
  const r = raw as Record<string, unknown>;
  const sound = SOUNDS.includes(r.sound as SoundId) ? (r.sound as SoundId) : defaults.sound;
  return {
    volume: clampNumber(r.volume, 0, 1, defaults.volume),
    prevVolume: clampNumber(r.prevVolume, 0, 1, defaults.prevVolume),
    muted: typeof r.muted === 'boolean' ? r.muted : defaults.muted,
    sound,
  };
}

function validateSig(raw: unknown): TimeSignature {
  const fallback = DEFAULT_STATE.sig;
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const r = raw as Record<string, unknown>;
  const num = Math.round(clampNumber(r.num, MIN_SIG_NUM, MAX_SIG_NUM, fallback.num));
  const den = VALID_DENS.includes(r.den as ValidDen) ? (r.den as ValidDen) : fallback.den;
  return { num, den };
}

function loadPersisted(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const bpm = Math.round(clampNumber(parsed.bpm, MIN_BPM, MAX_BPM, DEFAULT_STATE.bpm));
    const sig = validateSig(parsed.sig);

    const rawLayers =
      parsed.layers && typeof parsed.layers === 'object'
        ? (parsed.layers as Record<string, unknown>)
        : {};
    const layers = {} as Record<LayerId, Layer>;
    for (const id of LAYERS) {
      layers[id] = validateLayer(rawLayers[id], DEFAULT_STATE.layers[id]);
    }

    return { bpm, sig, layers, playing: false };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

type Listener = (state: State) => void;

export class Store {
  private state: State;
  private listeners = new Set<Listener>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.state = loadPersisted();
  }

  get(): State {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  // `structuredClone` copies the full state on every update. That's fine for
  // the tiny shape here and keeps subscribers safely reading a snapshot, but
  // note it runs on every slider-drag `input` event. If the state grows,
  // swap for an immer-style shallow/layer-level copy to avoid GC pressure.
  update(recipe: (draft: State) => void): void {
    const draft = structuredClone(this.state);
    recipe(draft);
    this.state = draft;
    for (const fn of this.listeners) fn(this.state);
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      try {
        const { playing: _playing, ...persistable } = this.state;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
      } catch {
        // ignore quota errors
      }
    }, 200);
  }
}
