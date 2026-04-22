import type { Store } from '../state/store';

const DENS = [2, 4, 8, 16] as const;

export function TimeSignature(store: Store): HTMLElement {
  const root = document.createElement('section');
  root.className = 'timesig';

  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = 'Time Signature';

  const controls = document.createElement('div');
  controls.className = 'timesig__controls';

  const numSelect = document.createElement('select');
  numSelect.className = 'timesig__num';
  numSelect.setAttribute('aria-label', 'Beats per measure');
  for (let i = 1; i <= 16; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = String(i);
    numSelect.append(opt);
  }

  const slash = document.createElement('div');
  slash.className = 'timesig__slash';
  slash.textContent = '/';

  const denSelect = document.createElement('select');
  denSelect.className = 'timesig__den';
  denSelect.setAttribute('aria-label', 'Beat value');
  for (const d of DENS) {
    const opt = document.createElement('option');
    opt.value = String(d);
    opt.textContent = String(d);
    denSelect.append(opt);
  }

  numSelect.addEventListener('change', () => {
    const v = Math.max(1, Math.min(16, Number(numSelect.value)));
    store.update((d) => {
      d.sig.num = v;
    });
  });
  denSelect.addEventListener('change', () => {
    const v = Number(denSelect.value) as 2 | 4 | 8 | 16;
    store.update((d) => {
      d.sig.den = v;
    });
  });

  controls.append(numSelect, slash, denSelect);
  root.append(label, controls);

  store.subscribe((s) => {
    if (numSelect.value !== String(s.sig.num)) numSelect.value = String(s.sig.num);
    if (denSelect.value !== String(s.sig.den)) denSelect.value = String(s.sig.den);
  });

  return root;
}
