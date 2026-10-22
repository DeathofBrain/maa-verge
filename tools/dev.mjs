import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root, desktop, port, run, start, terminate, devEnvironment, fail } from './project.mjs';
import { assertWorkspaceDependencies } from './environment.mjs';

const mock = process.argv.includes('--mock');
const environment = { ...devEnvironment(), MAAVERGE_MODE: mock ? 'mock' : process.env.MAAVERGE_MODE || 'native' };
const url = `http://127.0.0.1:${port}`;
console.log(`Maa Verge ${mock ? 'browser mock' : 'desktop'} · ${url}`);
console.log(`运行模式: ${environment.MAAVERGE_MODE === 'native' ? '真实设备（native）' : '模拟（mock）'}`);
console.log(`数据目录: ${environment.MAAVERGE_DATA_DIR}`);

async function main() {
  assertWorkspaceDependencies();
  if (!['mock', 'native'].includes(environment.MAAVERGE_MODE)) throw new Error('MAAVERGE_MODE must be mock or native');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('MAAVERGE_DEV_PORT must be between 1024 and 65535');
  if (!mock) {
    if (process.env.MAAVERGE_BACKEND === 'python') await run('uv', ['sync', '--frozen']);
    else {
      await run('node', ['tools/setup-bun.mjs']);
      await run('node', ['tools/doctor.mjs', '--native']);
      await run('node', ['tools/build-core-worker.mjs', '--production']);
    }
    if (!existsSync(path.join(root, 'apps', 'desktop', 'src-tauri', 'Cargo.lock'))) {
      throw new Error('Cargo.lock missing. Run cargo generate-lockfile --manifest-path apps/desktop/src-tauri/Cargo.toml');
    }
    await run('node', ['tools/prepare-native-check.mjs']);
  }
  const vite = start('pnpm', ['--filter', '@maaverge/desktop', 'dev', '--port', String(port), '--strictPort'], {
    env: { ...environment, MAAVERGE_DEV_PORT: String(port), VITE_MAAVERGE_MOCK: mock ? '1' : '0' },
  });
  let viteError;
  vite.once('error', (error) => { viteError = error; });
  let tauri;
  const cleanup = () => {
    terminate(vite);
    terminate(tauri);
  };
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
  if (mock) {
    await new Promise((resolve, reject) => {
      vite.once('error', reject);
      vite.once('exit', (code) => code === 0 || code === null ? resolve() : reject(new Error(`Vite exited ${code}`)));
    });
    return;
  }
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (viteError) throw viteError;
      if (vite.exitCode !== null) throw new Error('Vite stopped before native startup');
      try { ready = (await fetch(url)).ok; } catch { /* waiting for Vite */ }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error('Vite startup timed out');
    const configDirectory = path.join(root, '.maaverge');
    mkdirSync(configDirectory, { recursive: true });
    const config = path.join(configDirectory, 'tauri-dev.json');
    writeFileSync(config, JSON.stringify({ identifier: `io.maaverge.dev.w${environment.VITE_WORKSPACE_ID}`, build: { devUrl: url } }));
    tauri = start('pnpm', ['exec', 'tauri', 'dev', '--config', config], { cwd: desktop, env: environment });
    await new Promise((resolve, reject) => {
      tauri.once('error', reject);
      tauri.once('exit', (code) => code === 0 || code === null ? resolve() : reject(new Error(`Tauri exited ${code}`)));
    });
  } finally { cleanup(); }
}

main().catch(fail);
