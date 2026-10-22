import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { root, desktop } from '../project.mjs';

const require = createRequire(path.join(desktop, 'package.json'));
const viteEntry = require.resolve('vite');
const { createServer } = await import(pathToFileURL(viteEntry).href);

async function availablePort() {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

test('concurrent Vite servers retain each other’s Tauri modules and optimized chunks', { timeout: 60000 }, async () => {
  const servers = [];
  const previousPort = process.env.MAAVERGE_DEV_PORT;
  const previousCI = process.env.CI;
  // Programmatic test servers must not attach Vite's interactive stdin handler.
  process.env.CI = 'true';
  try {
    async function start(extra = {}) {
      const port = await availablePort();
      process.env.MAAVERGE_DEV_PORT = String(port);
      const server = await createServer({
        root: desktop, configFile: path.join(desktop, 'vite.config.ts'), logLevel: 'error',
        // Cache isolation needs HTTP transforms, without live file watching.
        // Set null after config merging, which otherwise skips null overrides.
        plugins: [{ name: 'cache-test-no-watch', configResolved(config) { config.server.watch = null; } }],
        server: { host: '127.0.0.1', port, strictPort: true }, ...extra,
      });
      servers.push(server);
      await server.listen();
      return { server, origin: `http://127.0.0.1:${port}` };
    }
    async function source(url) {
      const response = await fetch(url);
      assert.equal(response.status, 200, `${url} returned ${response.status}: ${await response.clone().text()}`);
      return response.text();
    }
    const first = await start();
    const modules = new Map();
    const pending = [];
    function imports(code, base) {
      for (const match of code.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/gu)) {
        if (!/^[./]/u.test(match[1])) continue;
        const url = new URL(match[1], base).href;
        if (url.includes('/node_modules/.vite/') && !modules.has(url)) pending.push(url);
      }
    }
    for (const file of ['transport.ts', 'desktop-window.ts']) {
      const url = `${first.origin}/@fs/${path.join(root, 'packages/contracts/src', file).replaceAll('\\', '/')}`;
      imports(await source(url), url);
    }
    while (pending.length) {
      const url = pending.shift();
      if (modules.has(url)) continue;
      const code = await source(url);
      modules.set(url, code);
      imports(code, url);
    }
    for (const name of ['core', 'event', 'window', 'webviewWindow']) {
      assert.ok([...modules.keys()].some(url => url.includes(`api_${name}.js`)), `Missing optimized Tauri ${name} module`);
    }
    // A different dependency graph forces optimization without sharing the first
    // server's generated chunk files, as browser and desktop cold starts can do.
    const second = await start({ optimizeDeps: { noDiscovery: true, include: ['react'] } });
    assert.notEqual(first.server.config.cacheDir, second.server.config.cacheDir);
    await source(`${second.origin}/src/main.tsx`);
    for (const [url, code] of modules) assert.equal(await source(url), code, `Another Vite server replaced ${url}`);
  } finally {
    await Promise.all(servers.map(server => server.close()));
    if (previousPort === undefined) delete process.env.MAAVERGE_DEV_PORT;
    else process.env.MAAVERGE_DEV_PORT = previousPort;
    if (previousCI === undefined) delete process.env.CI;
    else process.env.CI = previousCI;
  }
});
