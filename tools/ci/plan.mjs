import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { platformRuntimeTests } from './runtime-suite.mjs';

const fullPlan = {
  version: 2,
  full: true,
  code: true,
  native: true,
};

const infrastructure =
  /^(?:\.github\/(?:actions\/|workflows\/ci\.yml$)|tools\/ci\/|tools\/(?:check|check-native|test-runtime|test-agent|probe-bun|setup-bun|environment|project|prepare-native-check)\.mjs$|(?:.*\/)?package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|\.node-version$|\.bun-version$|\.npmrc$|rust-toolchain\.toml$)/u;
const documentation =
  /(?:\.md$|^(?:docs\/|\.skill\/|\.vscode\/|services\/backend\/src\/modules\/knowledge\/product-knowledge\.generated\.json$|LICENSE(?:\..*)?$|\.editorconfig$|\.gitattributes$|\.gitignore$|\.prettier[^/]*$))/u;
const frontend =
  /^(?:apps\/desktop\/(?:src\/|public\/|index\.html$|vite\.config\.[^/]+$|tsconfig[^/]*\.json$)|tests\/ui\/|playwright\.config\.[^/]+$)/u;
const native =
  /^(?:services\/(?:backend|native)\/|packages\/(?:agent|contracts)\/|apps\/desktop\/src-tauri\/|tools\/|\.github\/workflows\/release\.yml$)/u;
const platformBoundary =
  /^(?:services\/native\/|packages\/contracts\/|apps\/desktop\/src-tauri\/|tools\/|\.github\/workflows\/release\.yml$|services\/backend\/(?:src\/(?:entry\.ts$|app\/|transport\/|infrastructure\/|modules\/(?:updates|schedules|devices|execution)\/)|tests\/archive-fixture\.ts$))/u;
const platformTests = new Set(Object.values(platformRuntimeTests).flat());

/** Unknown paths and shared CI inputs deliberately retain the complete matrix. */
export function createCiPlan(files, { full = false } = {}) {
  if (!Array.isArray(files) || files.some((file) => typeof file !== 'string'))
    throw new Error('CI changed paths must be an array of strings');
  const paths = [...new Set(files.map((file) => file.replaceAll('\\', '/')))];
  if (
    full ||
    paths.length === 0 ||
    paths.some(
      (file) =>
        infrastructure.test(file) ||
        (!documentation.test(file) && !frontend.test(file) && !native.test(file)),
    )
  )
    return { ...fullPlan };

  const codePaths = paths.filter((file) => !documentation.test(file));
  return {
    version: 2,
    full: false,
    code: codePaths.length > 0,
    native: codePaths.some((file) => platformBoundary.test(file) || platformTests.has(file)),
  };
}

export function readCiPlan(value = process.env.MAAVERGE_CI_PLAN) {
  if (!value) throw new Error('MAAVERGE_CI_PLAN is required for CI checks');
  const plan = JSON.parse(value);
  if (
    plan?.version !== 2 ||
    Object.keys(plan).some((key) => !['version', 'full', 'code', 'native'].includes(key)) ||
    ['full', 'code', 'native'].some((key) => typeof plan[key] !== 'boolean') ||
    (plan.native && !plan.code) ||
    (plan.full && (!plan.native || !plan.code))
  )
    throw new Error('Invalid CI plan; refusing to skip checks');
  return plan;
}

export function nativeHosts({ full }) {
  return [
    { os: 'windows-2022', architecture: 'x64' },
    { os: 'macos-15', architecture: 'arm64' },
    ...(full ? [{ os: 'macos-15-intel', architecture: 'x64' }] : []),
  ];
}

/** Compare both sides of renames; a missing/invalid base falls back to full checks. */
export function changedFiles(
  eventName,
  event,
  git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }),
) {
  const head = eventName === 'pull_request' ? event.pull_request?.head?.sha : event.after;
  const base = eventName === 'pull_request' ? event.pull_request?.base?.sha : event.before;
  const sha = /^[0-9a-f]{40}$/u;
  if (!sha.test(base ?? '') || /^0+$/u.test(base) || !sha.test(head ?? '')) return null;
  try {
    const range = eventName === 'pull_request' ? [`${base}...${head}`] : [base, head];
    return git(['diff', '--name-only', '--no-renames', '-z', ...range, '--'])
      .split('\0')
      .filter(Boolean);
  } catch {
    return null;
  }
}

export function planForEvent(eventName, event, ref, git) {
  const force =
    eventName === 'workflow_dispatch' || (eventName === 'push' && ref === 'refs/heads/main');
  const files = force ? null : changedFiles(eventName, event, git);
  const plan = createCiPlan(files ?? [], { full: force || files === null });
  return { changedFiles: files, plan };
}

function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const result = planForEvent(process.env.GITHUB_EVENT_NAME, event, process.env.GITHUB_REF);
  const { plan } = result;
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `plan=${JSON.stringify(plan)}\nfull=${plan.full}\nnative=${plan.native}\nhosts=${JSON.stringify(nativeHosts(plan))}\n`,
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
