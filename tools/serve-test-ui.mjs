import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { desktop, port, fail } from './project.mjs';
import { assertWorkspaceDependencies } from './environment.mjs';

// Playwright owns this process. Keeping Vite in it avoids detached development
// process groups outliving the test runner and holding its output pipes open.
async function main() {
  assertWorkspaceDependencies();
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('MAAVERGE_DEV_PORT must be between 1024 and 65535');
  process.env.MAAVERGE_DEV_PORT = String(port);
  const require = createRequire(path.join(desktop, 'package.json'));
  const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
  const server = await createServer({
    root: desktop,
    configFile: path.join(desktop, 'vite.config.ts'),
    server: { host: '127.0.0.1', port, strictPort: true },
  });
  await server.listen();
  server.printUrls();
}

main().catch(fail);
