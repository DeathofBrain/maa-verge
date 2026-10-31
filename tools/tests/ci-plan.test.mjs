import assert from 'node:assert/strict';
import test from 'node:test';
import { changedFiles, createCiPlan, nativeHosts, planForEvent, readCiPlan } from '../ci/plan.mjs';

test('documentation stays static and ordinary frontend or domain changes use the Linux baseline', () => {
  assert.deepEqual(
    createCiPlan([
      'docs/STATUS.md',
      'AGENTS.md',
      '.skill/example/SKILL.md',
      'services/native/README.md',
      'services/backend/src/modules/knowledge/product-knowledge.generated.json',
    ]),
    { version: 2, full: false, code: false, native: false },
  );
  for (const file of [
    'apps/desktop/src/features/copilot/CopilotPage.tsx',
    'apps/desktop/src/kit/Button.tsx',
    'tests/ui/workspace.spec.ts',
    'services/backend/src/modules/plans/task-policy.ts',
    'services/backend/tests/policy-parity.test.ts',
    'packages/agent/src/deterministic.ts',
  ])
    assert.deepEqual(
      createCiPlan([file]),
      { version: 2, full: false, code: true, native: false },
      file,
    );
});

test('OS boundaries select three systems while complete plans add Intel macOS and the release marker', () => {
  for (const file of [
    'services/native/CMakeLists.txt',
    'apps/desktop/src-tauri/src/runtime.rs',
    'packages/contracts/schemas/runtime.schema.json',
    'tools/windows-distribution.mjs',
    'services/backend/src/app/runtime.ts',
    'services/backend/src/infrastructure/storage/storage.ts',
    'services/backend/src/modules/updates/updates.ts',
    'services/backend/src/modules/schedules/scheduler.ts',
    'services/backend/tests/mirrorchyan.test.ts',
    'services/backend/tests/lifecycle.test.ts',
    'services/backend/tests/macos-components.test.ts',
  ]) {
    const plan = createCiPlan([file]);
    assert.deepEqual(plan, { version: 2, full: false, code: true, native: true }, file);
    assert.deepEqual(nativeHosts(plan), [
      { os: 'windows-2022', architecture: 'x64' },
      { os: 'macos-15', architecture: 'arm64' },
    ]);
  }
  for (const [files, full, count] of [
    [['docs/STATUS.md'], false, 2],
    [['apps/desktop/src/kit/Button.tsx'], false, 2],
    [['services/native/src/main.cpp'], false, 4],
    [['docs/STATUS.md'], true, 6],
  ]) {
    const plan = createCiPlan(files, { full });
    assert.equal(2 + (plan.native ? nativeHosts(plan).length : 0) + Number(plan.full), count);
    if (full)
      assert.deepEqual(nativeHosts(plan).at(-1), { os: 'macos-15-intel', architecture: 'x64' });
  }
});

test('unknown paths, dependencies, shared CI inputs and a missing diff retain complete checks', () => {
  for (const file of [
    'unclassified/new.ts',
    'pnpm-lock.yaml',
    'packages/agent/package.json',
    'tools/ci/run.sh',
    '.github/workflows/ci.yml',
  ])
    assert.deepEqual(
      createCiPlan([file]),
      { version: 2, full: true, code: true, native: true },
      file,
    );
  assert.equal(createCiPlan([]).full, true);
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
    ['workflow_dispatch', 'refs/tags/v0.1.3'],
  ])
    assert.equal(planForEvent(name, event, ref, git).plan.full, true);
  for (const [name, ref] of [
    ['push', 'refs/heads/dev'],
    ['pull_request', 'refs/pull/1/merge'],
  ])
    assert.deepEqual(planForEvent(name, event, ref, git).plan, {
      version: 2,
      full: false,
      code: false,
      native: false,
    });
  assert.equal(planForEvent('push', {}, 'refs/heads/dev', git).plan.full, true);
});

test('CI plan parsing rejects old, missing, malformed and inconsistent skip instructions', () => {
  const plan = createCiPlan(['docs/STATUS.md']);
  assert.deepEqual(readCiPlan(JSON.stringify(plan)), plan);
  for (const value of [
    '',
    '{}',
    '{',
    'null',
    JSON.stringify({ ...plan, version: 1 }),
    JSON.stringify({ ...plan, full: true }),
    JSON.stringify({ ...plan, native: true }),
    JSON.stringify({ ...plan, rust: true }),
    JSON.stringify({ ...plan, uiFiles: [] }),
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
