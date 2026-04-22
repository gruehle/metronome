import { Engine } from './audio/engine';
import { Store } from './state/store';
import { LayerMixer } from './ui/LayerMixer';
import { PlayButton } from './ui/PlayButton';
import { Presets } from './ui/Presets';
import { TapTempo } from './ui/TapTempo';
import { TempoControl } from './ui/TempoControl';
import { TimeSignature } from './ui/TimeSignature';
import './styles.css';

const store = new Store();
const engine = new Engine(() => store.get());

const app = document.getElementById('app');
if (!app) throw new Error('missing #app');

const header = document.createElement('header');
header.className = 'app-header';
const title = document.createElement('h1');
title.textContent = 'Metronome';
header.append(title);

const playButton = PlayButton(store, engine);
const tapButton = TapTempo(store);
const tempo = TempoControl(store);
const timesig = TimeSignature(store);
const presets = Presets(store);
const mixer = LayerMixer(store);

const transport = document.createElement('section');
transport.className = 'transport';
const transportTop = document.createElement('div');
transportTop.className = 'transport__top';
transportTop.append(playButton, tempo.readout, tapButton);
transport.append(transportTop, tempo.sliderRow);

const left = document.createElement('div');
left.className = 'pane pane--left';
left.append(transport, timesig.el, presets);

const right = document.createElement('div');
right.className = 'pane pane--right';
right.append(mixer.el);

const layout = document.createElement('main');
layout.className = 'layout';
layout.append(left, right);

app.append(header, layout);

// UI sync: on each scheduled hit, flash the active beat dot and pulse
// any layer channels that fired. We align the DOM update with the actual
// audio time using setTimeout keyed off AudioContext.currentTime so the
// visuals stay sync'd under heavy scheduling lookahead.
engine.onBeat((e) => {
  const nowAudio = engine.audioTime();
  const delayMs = Math.max(0, (e.audioTime - nowAudio) * 1000);
  setTimeout(() => {
    if (e.tickInBeat === 0) timesig.flash(e.beatIndex);
    for (const id of e.firedLayers) mixer.pulse(id);
  }, delayMs);
});

// Wake Lock: request when playback starts, release when it stops.
// The subscriber below is intentionally never unsubscribed — this app is a
// single long-lived page, so the listener lives for the process lifetime
// and there's no teardown to worry about. If the app is ever embedded in
// something that mounts/unmounts, capture the returned unsubscribe.
let wakeLock: WakeLockSentinel | null = null;
type WakeLockSentinel = { release: () => Promise<void> };
type WakeLockApi = { request: (type: 'screen') => Promise<WakeLockSentinel> };

store.subscribe(async (s) => {
  const navAny = navigator as Navigator & { wakeLock?: WakeLockApi };
  if (!navAny.wakeLock) return;
  if (s.playing && !wakeLock) {
    try {
      wakeLock = await navAny.wakeLock.request('screen');
    } catch {
      /* user may deny; ignore */
    }
  } else if (!s.playing && wakeLock) {
    try {
      await wakeLock.release();
    } catch {
      /* ignore */
    }
    wakeLock = null;
  }
});

// Re-acquire the wake lock if the page becomes visible again while playing.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && store.get().playing && !wakeLock) {
    const navAny = navigator as Navigator & { wakeLock?: WakeLockApi };
    navAny.wakeLock?.request('screen').then(
      (lock) => {
        wakeLock = lock;
      },
      () => {},
    );
  }
});
