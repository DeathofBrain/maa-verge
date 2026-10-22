import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../project.mjs';
import { ensureBun, cleanRuntimeEnvironment } from '../setup-bun.mjs';

/** Offline test setup runs before the product and never changes production defaults. */
export async function seedNativeData(dataRoot) {
  if (typeof dataRoot !== 'string' || !dataRoot) throw new Error('Expected an isolated test data directory');
  await run(await ensureBun(), [fileURLToPath(new URL('./seed-native.ts', import.meta.url)), path.resolve(dataRoot)], {
    env: cleanRuntimeEnvironment(),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Expected one isolated test data directory');
  await seedNativeData(process.argv[2]);
}
