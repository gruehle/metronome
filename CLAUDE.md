# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev      # Vite dev server on http://localhost:5185/metronome/ (host: true, so reachable on LAN for mobile testing)
npm run build    # tsc -b (typecheck via project references) then vite build → dist/
npm run preview  # serve the production build
```

There is no test runner and no linter wired up — `npm run build` (which runs `tsc -b`) is the only correctness gate. Run it after non-trivial changes.

The base path is `/metronome/` (see `vite.config.ts`), so local dev URLs must include the trailing path segment.

## Architecture

Vanilla TypeScript + Vite. No framework. Entry is `src/main.ts`, which composes three subsystems:

**Store (`src/state/store.ts`)** — tiny observable holding `{ bpm, sig, layers, playing }`. `update(recipe)` runs the recipe against a `structuredClone` of the state and fans out to subscribers. Every change is debounced 200 ms and persisted to `localStorage` (minus `playing`). On load, every field is validated and clamped against defaults — corrupt entries fall back rather than crash the scheduler. `structuredClone` is called on every `update` — fine for this state shape but watch out if the state grows.

**Engine (`src/audio/engine.ts` + `scheduler.ts` + `timer-worker.ts` + `sounds.ts`)** — owns the `AudioContext`, master gain, compressor, and a Chris-Wilson-style look-ahead scheduler. Key invariants:

- Each beat is subdivided into **24 ticks** (LCM of the subdivision layers' notes-per-beat). `secondsPerBeat = (60 / bpm) * (4 / state.sig.den)` — the denominator scales beat length (120 BPM in 6/8 means 120 eighth notes per minute).
- On every worker tick (every 25 ms), the scheduler schedules any ticks that fall within the next 100 ms window against `AudioContext.currentTime` — timing is sample-accurate, not `setTimeout`-based.
- **At most one layer fires per tick**: the scheduler walks `LAYERS` in priority order (`downbeat > beat > 8th > 8thTriplet > 16th`) and picks the first enabled one whose grid aligns. A tick with no match is silent. This is why presets don't double-trigger on coinciding subdivisions.
- `downbeat` and `beat` are picked by measure position (special-cased), not by the `LAYER_PERIOD_TICKS` table. Only subdivision layers use the period table.
- The scheduler's timer runs in a **dedicated Web Worker** (`timer-worker.ts`) specifically so `setInterval` keeps firing at full rate when the tab is backgrounded — essential for stable mobile playback while the user looks at sheet music in another app.
- **Sounds are synthesized** (oscillator + gain envelope), not samples. Envelopes use the pure-exponential "WebAudio click" pattern end-to-end; mixing linear and exponential ramps causes per-hit attack variance. Per-hit gain nodes are disconnected in `onended` so they don't accumulate.

**UI (`src/ui/*.ts`)** — each module is a factory returning `{ el, ...handles }` (no framework). Modules read state via `store.get()` and re-render in a `store.subscribe` callback; they write state via `store.update(d => ...)`. Beat-driven UI (play button counter, layer pulse) is fed by `engine.onBeat(e => ...)` in `main.ts`, which aligns DOM updates to `e.audioTime` via a `setTimeout` keyed off `AudioContext.currentTime` so visuals stay sync'd under the 100 ms lookahead.

## iOS / mobile gotchas (load-bearing, don't break)

- **iOS audio session unlock.** `engine.primeSilentUnlock()` plays a looping silent WAV `<audio>` element from inside the user gesture to flip the iOS Safari audio session from "ambient" (muted by the ringer switch) to "playback". Must run inside a click handler. If you refactor the start flow, preserve the gesture path.
- **`engine.stop()` calls `engine.quiesce()`** to pause that silent loop and suspend the `AudioContext`. Without this the app drains battery in the background because iOS keeps the media session pinned awake. `main.ts` also calls `engine.quiesce()` on `visibilitychange → hidden` when not playing, as a backstop.
- **`primeSilentUnlock` is idempotent and replays a paused element** — don't destroy `this.silentUnlock` on stop; the next `start()` (still a user gesture) replays it to re-flip the session.
- **Wake Lock** is requested in `main.ts` on play and released on stop; re-acquired on `visibilitychange → visible` while playing. Browsers auto-release on hidden, which is fine.
- **Background-while-playing is intentional.** The worker timer and scheduler keep running when the tab is hidden if `playing === true`. Do not add a "pause on hidden" gate — the whole point of the worker is to survive background throttling.

## PWA

`public/manifest.webmanifest` + icons. `index.html` references it with the correct `start_url` under `/metronome/`. No service worker.
