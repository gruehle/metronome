# Metronome

A practice metronome for phones, tablets, and desktop browsers. Sample-accurate Web Audio timing, independent per-layer volumes and sounds, tap tempo, and one-tap rhythm presets.

## Features

- Tempo 30–300 BPM with slider, ±1 step buttons, editable BPM field, and tap tempo.
- Time signature with numerator 1–16 and denominators 2 / 4 / 8 / 16. BPM respects the denominator (120 in 6/8 ticks eighth notes, not quarters).
- Five independently mixable layers: **Downbeat**, **Beat**, **8th**, **8th triplet**, **16th**. Each has its own volume, sound, and mute.
- Only one layer fires per tick — the highest-priority enabled one — so presets never double-trigger on coinciding beats.
- Five synthesized sounds (click / woodblock / cowbell / beep / shaker) — no sample assets to load.
- Four rhythm presets (quarter / 8th / 8th triplet / 16th).
- Large play button, running beat counter, and pulse animations on active layers.
- Responsive layout (phone portrait → tablet/desktop landscape mixing-board) with container queries.
- Wake Lock keeps the screen on while playing; PWA manifest for install-to-home-screen.
- All settings persisted to `localStorage` (with input validation on read).

## Stack

- **Vite + TypeScript + vanilla DOM** — small app, no framework needed.
- **Web Audio API** for all sound and timing.
- **Dedicated Worker** drives the scheduler's look-ahead loop so playback stays accurate when the tab is backgrounded on mobile.

## Getting started

```sh
npm install
npm run dev      # http://localhost:5185
npm run build    # tsc + vite build → dist/
npm run preview  # preview the production build
```

Open the dev URL on your phone via the network address Vite prints to test mobile layouts.

## Project structure

```
src/
├─ main.ts              Bootstraps the store, engine, and UI; wires beat events to the DOM and Wake Lock
├─ audio/
│  ├─ engine.ts         AudioContext lifecycle, iOS unlock, start/stop, beat-event fan-out
│  ├─ scheduler.ts      24-tick-per-beat look-ahead scheduler (Chris Wilson pattern)
│  ├─ sounds.ts         Synthesized click/woodblock/cowbell/beep/shaker via Oscillator + Gain envelopes
│  └─ timer-worker.ts   setInterval in a Worker so the scheduler keeps firing when the tab is hidden
├─ state/
│  └─ store.ts          Tiny observable store, default state, validated `localStorage` persistence
├─ ui/
│  ├─ PlayButton.ts     Play/stop toggle + sr-only live region for "Playing/Stopped" announcement
│  ├─ TempoControl.ts   Editable BPM input, slider, ± step buttons
│  ├─ TapTempo.ts       Tap-tempo pill (averages last 4 intervals)
│  ├─ TimeSignature.ts  Numerator/denominator selects + beat counter that pulses on each beat
│  ├─ Presets.ts        Four one-tap rhythm presets
│  └─ LayerMixer.ts     Collapsible mixer with per-layer volume, sound, and mute
└─ styles.css           Dark theme, responsive via CSS grid + @container queries
```

## Technical notes

### Scheduler

Each beat is subdivided into **24 ticks** (LCM of the subdivision layers' notes-per-beat). On every scheduler pass (every 25 ms in the Worker timer), the scheduler schedules any ticks that fall within the next 100 ms window:

- `secondsPerBeat = (60 / bpm) * (4 / den)` — the denominator scales the beat length.
- For each tick, pick **one** layer to fire, using LAYERS order (`downbeat > beat > 8th > 8th triplet > 16th`) and skipping any that are muted or at volume 0. A tick where no enabled layer matches is silent.
- Audio is scheduled against `AudioContext.currentTime`, not `setTimeout`, so timing is sample-accurate.

### Sounds

All sounds are short synthesized transients built from oscillators and gain envelopes — no audio files. Envelopes use the classic pure-exponential "WebAudio click" pattern (`setValueAtTime(0.0001, when) → exponentialRampToValueAtTime(1) → exponentialRampToValueAtTime(0.0001)`) because mixing linear and exponential ramps causes per-hit attack variance.

Each `playClick` hit attaches `onended` to its source node so the per-hit gain node is disconnected deterministically when the sound finishes.

### State & persistence

`Store.update(recipe)` runs the recipe against a `structuredClone` of the state and fans out to subscribers. State is persisted (debounced 200 ms) to `localStorage` on every change, minus the `playing` flag. On load, every persisted field is validated and clamped against the default — corrupt entries fall back rather than crashing the scheduler.

## Browser support

Built for evergreen Safari / Chrome / Firefox on iOS, Android, macOS, Windows. Requires Web Audio, container queries, and `structuredClone` (all shipping everywhere since Safari 16 / early 2023).
