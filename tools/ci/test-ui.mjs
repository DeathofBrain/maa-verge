import { run, fail } from '../project.mjs';
import { resolveUiTargets } from './ui-suite.mjs';

async function main() {
  const plan =
    process.env.MAAVERGE_CI_PLAN === undefined
      ? { ui: 'full' }
      : JSON.parse(process.env.MAAVERGE_CI_PLAN);
  const targets = resolveUiTargets(plan);
  if (plan.ui === 'none') {
    console.log('UI fixtures are not affected; skipping Playwright.');
    return;
  }
  console.log(`UI fixtures: ${plan.ui}${targets.length ? ` (${targets.length} targets)` : ''}`);
  await run('pnpm', [
    'exec',
    'playwright',
    'test',
    '--workers=2',
    ...targets,
    ...process.argv.slice(2),
  ]);
}

main().catch(fail);
