// Dedicated timer worker. setInterval here keeps firing even when the main
// thread's tab is throttled (backgrounded) — which is essential for a
// metronome's stability on mobile.

let intervalId: ReturnType<typeof setInterval> | null = null;

type InMessage = { type: 'start'; intervalMs: number } | { type: 'stop' };

self.addEventListener('message', (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  if (msg.type === 'start') {
    if (intervalId !== null) clearInterval(intervalId);
    intervalId = setInterval(() => {
      (self as unknown as Worker).postMessage('tick');
    }, msg.intervalMs);
  } else if (msg.type === 'stop') {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
});
