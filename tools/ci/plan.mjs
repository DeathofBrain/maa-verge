import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectUiSpecs } from './ui-suite.mjs';

const fullPlan = {
  version: 1,
  full: true,
  native: true,
  rust: true,
  packaging: true,
  workerTools: true,
  ui: 'full',
  uiFiles: [],
};

const infrastructure =
  /^(?:\.github\/(?:actions\/|workflows\/ci\.yml$)|tools\/ci\/|tools\/(?:check|check-native|test-runtime|test-agent|probe-bun|setup-bun|environment|project|prepare-native-check)\.mjs$|(?:.*\/)?package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|\.node-version$|\.bun-version$|\.npmrc$|rust-toolchain\.toml$)/u;
const documentation =
  /(?:\.md$|^(?:docs\/|\.skill\/|\.vscode\/|services\/backend\/src\/modules\/knowledge\/product-knowledge\.generated\.json$|LICENSE(?:\..*)?$|\.editorconfig$|\.gitattributes$|\.gitignore$|\.prettier[^/]*$))/u;
const frontend =
  /^(?:apps\/desktop\/(?:src\/|public\/|index\.html$|vite\.config\.[^/]+$|tsconfig[^/]*\.json$)|tests\/ui\/|playwright\.config\.[^/]+$)/u;
const native =
  /^(?:services\/(?:backend|native)\/|packages\/(?:agent|contracts)\/|apps\/desktop\/src-tauri\/|tools\/|\.github\/workflows\/release\.yml$)/u;
const packaging =
  /^(?:tools\/(?:test-support\/|(?:tests\/)?(?:build|package-runtime|app-updater-release|release-assets|runtime-notices|windows[^/]*|linux[^/]*|macos[^/]*|prepare-windows-components|smoke-[^/]*|verify-macos-bundle)(?:\.test)?\.(?:mjs|json)$)|services\/backend\/(?:src\/(?:infrastructure\/(?:filesystem|network|native)\/|modules\/updates\/)|tests\/archive-fixture\.ts$)|apps\/desktop\/src-tauri\/(?:Cargo\.(?:toml|lock)$|tauri[^/]*\.json$|.*[Ee]ntitlements\.plist$|icons\/|windows\/)|\.github\/workflows\/release\.yml$)/u;

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
    return { ...fullPlan, uiFiles: [] };

  const codePaths = paths.filter((file) => !documentation.test(file));
  const selected = selectUiSpecs(codePaths);
  const hasNative = codePaths.some((file) => native.test(file));
  const rust = codePaths.some((file) =>
    /^(?:apps\/desktop\/src-tauri\/|services\/native\/|packages\/contracts\/|tools\/)/u.test(file),
  );
  const hasCode = codePaths.length > 0;
  return {
    version: 1,
    full: false,
    native: hasNative,
    rust: hasNative && rust,
    packaging: codePaths.some((file) => packaging.test(file)),
    workerTools: codePaths.some((file) =>
      /^(?:tools\/(?:tests\/)?(?:build-core-worker|setup-rust|bootstrap)[^/]*|services\/native\/(?:CMakeLists\.txt|CMakePresets\.json|cmake\/))/u.test(
        file,
      ),
    ),
    ui: !hasCode ? 'none' : selected.full ? 'full' : 'selected',
    uiFiles: selected.full ? [] : selected.files,
  };
}

export function readCiPlan(value = process.env.MAAVERGE_CI_PLAN) {
  if (!value) throw new Error('MAAVERGE_CI_PLAN is required for CI checks');
  const plan = JSON.parse(value);
  if (
    plan?.version !== 1 ||
    ['full', 'native', 'rust', 'packaging', 'workerTools'].some(
      (key) => typeof plan[key] !== 'boolean',
    ) ||
    !['none', 'selected', 'full'].includes(plan.ui) ||
    !Array.isArray(plan.uiFiles) ||
    plan.uiFiles.some(
      (file) => typeof file !== 'string' || !/^tests\/ui\/[a-z0-9-]+\.spec\.ts$/u.test(file),
    ) ||
    ((plan.rust || plan.packaging || plan.workerTools) && !plan.native) ||
    (plan.full &&
      (!plan.native || !plan.rust || !plan.packaging || !plan.workerTools || plan.ui !== 'full'))
  )
    throw new Error('Invalid CI plan; refusing to skip checks');
  return plan;
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
      `plan=${JSON.stringify(plan)}\nfull=${plan.full}\nnative=${plan.native}\nrust=${plan.rust}\npackaging=${plan.packaging}\n`,
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
