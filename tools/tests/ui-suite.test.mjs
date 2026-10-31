import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { selectUiSpecs, resolveUiTargets, smokeTests } from '../ci/ui-suite.mjs';
import { root as repositoryRoot } from '../project.mjs';

function fixture(t, transform = (text) => text) {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-ui-suite-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = new Map();
  for (const { file, title } of smokeTests)
    files.set(file, `${files.get(file) || ''}test(${JSON.stringify(title)}, () => {});\n`);
  for (const [file, text] of files) {
    const absolute = path.join(root, file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, transform(text, file));
  }
  return root;
}

test('feature changes select their behavior specs and combine domains without duplicates', () => {
  const result = selectUiSpecs([
    'apps/desktop/src/features/copilot/CopilotPage.tsx',
    'apps\\desktop\\src\\features\\tools\\toolbox.css',
  ]);
  assert.equal(result.full, false);
  assert.ok(result.files.includes('tests/ui/copilot-cache.spec.ts'));
  assert.ok(result.files.includes('tests/ui/recognition.spec.ts'));
  assert.ok(!result.files.includes('tests/ui/app-updates.spec.ts'));
  assert.equal(new Set(result.files).size, result.files.length);
});

test('change planning can import the selector in a checkout without node_modules', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-ui-planning-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'tools/ci'), { recursive: true });
  for (const file of ['.node-version', 'tools/project.mjs', 'tools/ci/ui-suite.mjs'])
    copyFileSync(path.join(repositoryRoot, file), path.join(root, file));
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import { selectUiSpecs } from './tools/ci/ui-suite.mjs'; if (selectUiSpecs(['apps/desktop/src/app/App.tsx']).full !== true) process.exit(2);",
    ],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  );
  assert.equal(result.status, 0, result.stderr);
});

test('all current feature domains have a nonempty behavior selection', () => {
  for (const domain of [
    'agent',
    'copilot',
    'devices',
    'execution',
    'history',
    'home',
    'plans',
    'schedules',
    'settings',
    'tools',
    'updates',
  ]) {
    const result = selectUiSpecs([`apps/desktop/src/features/${domain}/changed.tsx`]);
    assert.equal(result.full, false, domain);
    assert.ok(result.files.length > 0, domain);
  }
});

test('known spec changes select the whole spec while new specs and fixtures use full coverage', () => {
  assert.deepEqual(selectUiSpecs(['tests/ui/select.spec.ts']), {
    full: false,
    files: ['tests/ui/select.spec.ts'],
  });
  for (const file of ['tests/ui/new-feature.spec.ts', 'tests/ui/fixtures/runtime.ts'])
    assert.deepEqual(selectUiSpecs([file]), { full: true, files: [] });
});

test('shared UI, contracts, configuration and unknown frontend changes conservatively use full coverage', () => {
  for (const file of [
    'apps/desktop/src/app/App.tsx',
    'apps/desktop/src/kit/Button.tsx',
    'apps/desktop/src/shared/ui/ExternalLink.tsx',
    'apps/desktop/src/main.tsx',
    'apps/desktop/src/features/new-feature/Page.tsx',
    'apps/desktop/package.json',
    'packages/contracts/src/types.ts',
    'playwright.config.ts',
    'tools/serve-test-ui.mjs',
    '../tests/ui/workspace.spec.ts',
  ])
    assert.deepEqual(selectUiSpecs([file]), { full: true, files: [] }, file);
});

test('backend functions used by browser fixtures select home coverage and unrelated backend changes add no UI specs', () => {
  for (const file of [
    'services/backend/src/modules/home/home-info.ts',
    'services/backend/src/modules/recognition/user-data-sync.ts',
  ]) {
    const result = selectUiSpecs([file]);
    assert.equal(result.full, false);
    assert.ok(result.files.includes('tests/ui/game-info.spec.ts'));
  }
  assert.deepEqual(
    selectUiSpecs([
      'services/backend/src/modules/updates/updates.ts',
      'apps/desktop/src-tauri/src/lib.rs',
      'docs/STATUS.md',
    ]),
    { full: false, files: [] },
  );
});

test('every configured smoke title exists exactly once in current repository sources', () => {
  const targets = resolveUiTargets({ ui: 'selected' });
  assert.ok(targets.length >= 10 && targets.length <= 20);
  assert.equal(targets.length, smokeTests.length);
  assert.equal(new Set(targets).size, targets.length);
  for (const target of targets) assert.match(target, /^tests\/ui\/[\w-]+\.spec\.ts:\d+$/u);
});

test('AST resolution follows shifted calls and ignores matching titles inside comments', (t) => {
  const root = fixture(t, (text) => `// test('not a real test', () => {});\n\n${text}`);
  const targets = resolveUiTargets({ ui: 'selected' }, root);
  assert.ok(targets.includes(`${smokeTests[0].file}:3`));
  assert.ok(!targets.some((target) => target.endsWith(':1')));
});

test('a missing, renamed or duplicate smoke call fails instead of shrinking the suite', (t) => {
  for (const transform of [
    (text) => text.replaceAll('test(', 'test.skip('),
    (text) => `test.describe.skip('disabled', () => { ${text} });`,
    (text) => `${text}${text}`,
  ]) {
    const root = fixture(t, transform);
    assert.throws(() => resolveUiTargets({ ui: 'selected' }, root), /exactly one smoke test/u);
  }
});

test('whole spec selection replaces smoke line selectors for that file', (t) => {
  const root = fixture(t);
  const file = smokeTests[0].file;
  const targets = resolveUiTargets({ ui: 'selected', uiFiles: [file, file] }, root);
  assert.ok(targets.includes(file));
  assert.ok(!targets.some((target) => target.startsWith(`${file}:`)));
  assert.equal(targets.filter((target) => target === file).length, 1);
});

test('unknown selected specs and malformed plans fail instead of running a partial suite', () => {
  for (const uiFiles of [['tests/ui/new.spec.ts'], ['../workspace.spec.ts'], 'workspace'])
    assert.throws(() => resolveUiTargets({ ui: 'selected', uiFiles }));
  assert.throws(() => resolveUiTargets({ ui: 'unexpected' }), /Unknown CI UI selection/u);
  assert.deepEqual(resolveUiTargets({ ui: 'full' }), []);
  assert.deepEqual(resolveUiTargets({ ui: 'none' }), []);
});
