import { ensureBun } from './setup-bun.mjs';
import { offlineAgentEnvironment } from './test-support/agent-environment.mjs';
import { run, fail } from './project.mjs';
import { assertWorkspaceDependencies } from './environment.mjs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { root } from './project.mjs';

async function main() {
  assertWorkspaceDependencies();
  const bun = await ensureBun();
  await run('pnpm', ['--filter', '@maaverge/agent', 'check']);
  await run(bun, ['test', 'packages/agent/tests'], { env: offlineAgentEnvironment() });
  if (process.argv.includes('--compile')) {
    const directory = path.join(root, '.tools/agent-verification');
    mkdirSync(directory, { recursive: true });
    const executable = path.join(directory, process.platform === 'win32' ? 'agent-smoke.exe' : 'agent-smoke');
    await run(bun, ['build', '--compile', '--no-compile-autoload-dotenv', '--no-compile-autoload-bunfig', 'packages/agent/tests/fixtures/compiled-proposal.ts', '--outfile', executable], { env: offlineAgentEnvironment() });
    await run(executable, [], { env: offlineAgentEnvironment() });
  }
}
main().catch(fail);
