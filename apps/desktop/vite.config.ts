import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const port = Number(process.env.MAAVERGE_DEV_PORT || 1420);

export default defineConfig({
  plugins: [react()],
  // Concurrent browser/desktop servers must not replace each other's optimized
  // modules. WebKit retains a failed dynamic import until the page is reloaded.
  cacheDir: path.join('node_modules/.vite', `port-${port}`),
  optimizeDeps: {
    include: ['core', 'event', 'window', 'webviewWindow'].map(module => `@maaverge/contracts > @tauri-apps/api/${module}`),
  },
  clearScreen: false,
  server: {
    port,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: { target: 'es2022' },
});
