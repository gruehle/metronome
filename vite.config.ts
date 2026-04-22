import { defineConfig } from 'vite';

export default defineConfig({
  base: '/metronome/',
  server: { host: true, port: 5185, strictPort: true },
  build: { target: 'es2022' },
});
