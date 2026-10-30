/** Host-only integration fixture. Loads the synthetic C API library, never a device. */
import { createHash } from 'node:crypto';
import { cp, readFile } from 'node:fs/promises';
import { UpdateService, runUpdateJobStdio } from '../../src/modules/updates/updates.ts';

if (process.argv.includes('--update-job')) {
  await runUpdateJobStdio();
} else {
  const config = await Bun.stdin.json();
  process.env.MAAVERGE_CORE_WORKER_PATH = config.workerPath;
  const rows = new Map<string, any>();
  const store = {
    get: (kind: string, id: string, fallback?: any) =>
      structuredClone(rows.get(kind + '|' + id) ?? fallback),
    put: (kind: string, id: string, value: any) => {
      rows.set(kind + '|' + id, structuredClone(value));
    },
    all: (kind: string) =>
      [...rows]
        .filter(([key]) => key.startsWith(kind + '|'))
        .map(([, value]) => structuredClone(value)),
    delete: (kind: string, id: string) => {
      rows.delete(kind + '|' + id);
    },
  };
  const source = {
    check: () => ({ version: 'vsynthetic', name: 'synthetic.zip', source: 'fixture' }),
    download: async (_metadata: any, destination: string) => {
      await cp(config.archive, destination);
      return createHash('sha256')
        .update(await readFile(destination))
        .digest('hex');
    },
  };
  const updates = new UpdateService(
    config.root,
    store,
    () => {},
    () => false,
    { source },
  );
  try {
    await updates.check('core');
    await updates.prepare('core');
    process.stdout.write(
      JSON.stringify({
        standalone: Bun.isStandaloneExecutable,
        staged: store.get('staged', 'core').version,
      }) + '\n',
    );
  } finally {
    await updates.close();
  }
}
