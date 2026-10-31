import { run, fail } from '../project.mjs';
import { readCiPlan } from './plan.mjs';

async function main() {
  const plan =
    process.env.MAAVERGE_CI_PLAN === undefined ? { full: true, code: true } : readCiPlan();
  if (!plan.code) {
    console.log('Documentation-only checks do not run Playwright.');
    return;
  }
  console.log(`UI fixtures: ${plan.full ? 'full' : '@smoke'}`);
  await run('pnpm', [
    'exec',
    'playwright',
    'test',
    '--workers=2',
    ...(plan.full ? [] : ['--grep', '@smoke']),
    ...process.argv.slice(2),
  ]);
}

main().catch(fail);
