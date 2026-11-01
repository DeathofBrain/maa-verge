import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBun } from './setup-bun.mjs';
import { root, run, fail } from './project.mjs';
import { frameworkSdkDirectory, frameworkTarget, verifyFrameworkSdk } from './maafw-assets.mjs';

export async function ensureMaaFramework({ target = frameworkTarget(), download = true } = {}) {
  const bun = await ensureBun({ download });
  await run(bun, [
    '--tsconfig-override',
    path.join(root, 'services/backend/tsconfig.json'),
    path.join(root, 'tools/prepare-maafw-sdk.ts'),
    '--target',
    target,
    ...(download ? [] : ['--no-download']),
  ]);
  const directory = frameworkSdkDirectory(target);
  await verifyFrameworkSdk(directory, target);
  return directory;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--target');
  ensureMaaFramework({
    target: index < 0 ? frameworkTarget() : process.argv[index + 1],
    download: !process.argv.includes('--no-download'),
  }).catch(fail);
}
