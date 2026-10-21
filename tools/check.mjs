import { run, fail } from './project.mjs';

async function main() {
  await run('pnpm', ['contracts:check']);
  await run('pnpm', ['-r', 'check']);
  await run('node', ['tools/build-core-worker.mjs']);
  await run('node', ['tools/test-runtime.mjs']);
  await run('node', ['--test', 'packages/contracts/test/validators.test.mjs']);
  await run('uv', ['run', '--frozen', 'ruff', 'check', 'services/runtime']);
  await run('uv', ['run', '--frozen', 'mypy']);
  await run('uv', ['run', '--frozen', 'pytest']);
  await run('node', ['tools/check-native.mjs']);
}
main().catch(fail);
