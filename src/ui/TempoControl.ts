import { MAX_BPM, MIN_BPM } from '../state/store';
import type { Store } from '../state/store';

export type TempoControlParts = {
  readout: HTMLElement;
  sliderRow: HTMLElement;
};

export function TempoControl(store: Store): TempoControlParts {
  const readout = document.createElement('div');
  readout.className = 'tempo__readout';
  const bpmInput = document.createElement('input');
  bpmInput.type = 'text';
  bpmInput.inputMode = 'numeric';
  bpmInput.autocomplete = 'off';
  bpmInput.maxLength = 3;
  bpmInput.className = 'tempo__bpm';
  bpmInput.setAttribute('aria-label', 'Tempo BPM');
  const bpmLabel = document.createElement('span');
  bpmLabel.className = 'tempo__label';
  bpmLabel.textContent = 'BPM';
  readout.append(bpmInput, bpmLabel);

  const sliderRow = document.createElement('div');
  sliderRow.className = 'tempo__slider-row';

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'step-button';
  minus.setAttribute('aria-label', 'Decrease tempo');
  minus.textContent = '−';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(MIN_BPM);
  slider.max = String(MAX_BPM);
  slider.step = '1';
  slider.className = 'tempo__slider';
  slider.setAttribute('aria-label', 'Tempo');

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'step-button';
  plus.setAttribute('aria-label', 'Increase tempo');
  plus.textContent = '+';

  const setBpm = (value: number): void => {
    const clamped = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(value)));
    store.update((d) => {
      d.bpm = clamped;
    });
  };

  minus.addEventListener('click', () => setBpm(store.get().bpm - 1));
  plus.addEventListener('click', () => setBpm(store.get().bpm + 1));
  slider.addEventListener('input', () => setBpm(Number(slider.value)));

  const commitBpmInput = (): void => {
    const parsed = parseInt(bpmInput.value.replace(/[^\d]/g, ''), 10);
    const current = store.get().bpm;
    const next = Number.isFinite(parsed) ? parsed : current;
    setBpm(next);
    // Ensure display reflects the clamped value even when the input was
    // already inside the valid range (setBpm's store update would otherwise
    // be a no-op and leave stale text like "042" visible).
    bpmInput.value = String(Math.max(MIN_BPM, Math.min(MAX_BPM, next)));
  };

  bpmInput.addEventListener('focus', () => bpmInput.select());
  bpmInput.addEventListener('blur', commitBpmInput);
  bpmInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      bpmInput.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      bpmInput.value = String(store.get().bpm);
      bpmInput.blur();
    }
  });
  // Block the keystroke/paste before it produces a value that would be
  // silently truncated by maxLength — so 4+ digits are actively rejected
  // rather than trimmed without user feedback.
  bpmInput.addEventListener('beforeinput', (e) => {
    const ev = e as InputEvent;
    if (!ev.data) return; // deletion / composition events
    const hasNonDigit = /[^\d]/.test(ev.data);
    const selStart = bpmInput.selectionStart ?? bpmInput.value.length;
    const selEnd = bpmInput.selectionEnd ?? bpmInput.value.length;
    const remaining = bpmInput.value.length - (selEnd - selStart);
    if (hasNonDigit || remaining + ev.data.length > 3) {
      e.preventDefault();
    }
  });
  bpmInput.addEventListener('input', () => {
    // Safety net for IMEs / legacy browsers that ignore beforeinput — strip
    // anything that slipped through and enforce the 3-digit cap.
    const cleaned = bpmInput.value.replace(/[^\d]/g, '').slice(0, 3);
    if (cleaned !== bpmInput.value) bpmInput.value = cleaned;
  });

  sliderRow.append(minus, slider, plus);

  store.subscribe((s) => {
    // Don't clobber what the user is typing.
    if (document.activeElement !== bpmInput) bpmInput.value = String(s.bpm);
    if (slider.value !== String(s.bpm)) slider.value = String(s.bpm);
  });

  return { readout, sliderRow };
}
