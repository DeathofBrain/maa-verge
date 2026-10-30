import { ensureBun, cleanRuntimeEnvironment } from './setup-bun.mjs';
import { root, run, fail } from './project.mjs';
import path from 'node:path';

try {
  const bun = await ensureBun({ download: false });
  await run(
    bun,
    [
      path.join(root, 'services/backend/src/modules/knowledge/knowledge-build.ts'),
      ...process.argv.slice(2),
    ],
    { env: cleanRuntimeEnvironment() },
  );
} catch (error) {
  fail(error);
}
