import assert from 'node:assert/strict';
import test from 'node:test';
import { changedFiles, createCiPlan, planForEvent, readCiPlan } from '../ci/plan.mjs';

test('documentation skips UI and native while unknown paths and shared inputs fail closed', () => {
  const docs = createCiPlan([
    'docs/STATUS.md',
    'AGENTS.md',
    '.skill/example/SKILL.md',
    'services/backend/README.md',
    'services/native/README.md',
    'tools/test-support/README.md',
    'tools/bootstrap-notes.md',
    'services/backend/src/modules/knowledge/product-knowledge.generated.json',
  ]);
  assert.equal(docs.ui, 'none');
  assert.equal(docs.native, false);
  for (const file of [
    'unclassified/new.ts',
    'pnpm-lock.yaml',
    'packages/agent/package.json',
    'tools/ci/run.sh',
    '.github/workflows/ci.yml',
  ])
    assert.equal(createCiPlan([file]).full, true, file);
  assert.equal(createCiPlan([]).full, true);
});

test('frontend changes keep smoke and affected UI without native; shared UI runs full UI', () => {
  const feature = createCiPlan(['apps/desktop/src/features/copilot/CopilotPage.tsx']);
  assert.equal(feature.ui, 'selected');
  assert.equal(feature.native, false);
  assert.ok(feature.uiFiles.includes('tests/ui/copilot-center.spec.ts'));
  const shared = createCiPlan(['apps/desktop/src/kit/Button.tsx']);
  assert.equal(shared.ui, 'full');
  assert.equal(shared.native, false);
});

test('backend changes retain platform runtime without unrelated Rust and packaging work', () => {
  const plan = createCiPlan([
    'services/backend/src/modules/plans/plans.ts',
    'services/native/README.md',
    'tools/test-support/README.md',
  ]);
  assert.equal(plan.native, true);
  assert.equal(plan.rust, false);
  assert.equal(plan.packaging, false);
  assert.equal(plan.workerTools, false);
  assert.notEqual(plan.ui, 'none');
});

test('native build and installer changes select their own fixture gates', () => {
  const cpp = createCiPlan(['services/native/CMakeLists.txt']);
  assert.equal(cpp.native, true);
  assert.equal(cpp.rust, true);
  assert.equal(cpp.workerTools, true);
  assert.equal(cpp.packaging, false);
  const installer = createCiPlan(['tools/windows-distribution.mjs']);
  assert.equal(installer.native, true);
  assert.equal(installer.packaging, true);
  const macos = createCiPlan(['apps/desktop/src-tauri/RuntimeEntitlements.plist']);
  assert.equal(macos.packaging, true);
  assert.equal(macos.rust, true);
  for (const file of [
    'tools/test-support/windows-components.ts',
    'tools/test-support/dependency-tar.mjs',
    'services/backend/src/infrastructure/filesystem/archives.ts',
    'services/backend/src/infrastructure/filesystem/snapshot-integrity.ts',
    'services/backend/src/modules/updates/updates.ts',
  ])
    assert.equal(createCiPlan([file]).packaging, true, file);
  const full = createCiPlan(['docs/STATUS.md'], { full: true });
  assert.equal(full.full, true);
  assert.equal(full.ui, 'full');
  assert.equal(full.native && full.rust && full.packaging && full.workerTools, true);
});

test('main and manual runs remain complete while dev and PR use the reviewed diff', () => {
  const event = {
    before: 'a'.repeat(40),
    after: 'b'.repeat(40),
    pull_request: { base: { sha: 'a'.repeat(40) }, head: { sha: 'b'.repeat(40) } },
  };
  const git = () => 'docs/STATUS.md\0';
  for (const [name, ref] of [
    ['push', 'refs/heads/main'],
    ['workflow_dispatch', 'refs/tags/v0.1.3-alpha.1'],
  ])
    assert.equal(planForEvent(name, event, ref, git).plan.full, true);
  for (const [name, ref] of [
    ['push', 'refs/heads/dev'],
    ['pull_request', 'refs/pull/1/merge'],
  ]) {
    const { plan } = planForEvent(name, event, ref, git);
    assert.equal(plan.full, false);
    assert.equal(plan.native, false);
    assert.equal(plan.ui, 'none');
  }
  assert.equal(planForEvent('push', {}, 'refs/heads/dev', git).plan.full, true);
});

test('CI plan parsing rejects missing, malformed and inconsistent skip instructions', () => {
  const plan = createCiPlan(['docs/STATUS.md']);
  assert.deepEqual(readCiPlan(JSON.stringify(plan)), plan);
  for (const value of [
    '',
    '{}',
    '{',
    JSON.stringify({ ...plan, full: true }),
    JSON.stringify({ ...plan, rust: true }),
    JSON.stringify({ ...plan, uiFiles: ['../../outside.spec.ts'] }),
  ])
    assert.throws(() => readCiPlan(value));
});

test('PR diff uses merge base, push diff uses previous commit and renames retain both paths', () => {
  const before = 'a'.repeat(40),
    after = 'b'.repeat(40);
  const calls = [];
  const git = (args) => {
    calls.push(args);
    return 'apps/desktop/src/features/plans/old.ts\0services/backend/src/new.ts\0';
  };
  assert.deepEqual(
    changedFiles(
      'pull_request',
      { pull_request: { base: { sha: before }, head: { sha: after } } },
      git,
    ),
    ['apps/desktop/src/features/plans/old.ts', 'services/backend/src/new.ts'],
  );
  changedFiles('push', { before, after }, git);
  assert.deepEqual(calls[0], [
    'diff',
    '--name-only',
    '--no-renames',
    '-z',
    `${before}...${after}`,
    '--',
  ]);
  assert.deepEqual(calls[1], ['diff', '--name-only', '--no-renames', '-z', before, after, '--']);
  assert.equal(changedFiles('push', { before: '0'.repeat(40), after }, git), null);
  assert.equal(
    changedFiles('push', { before, after }, () => {
      throw new Error('base not found');
    }),
    null,
  );
});
