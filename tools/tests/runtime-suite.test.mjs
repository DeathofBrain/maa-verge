import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { root } from '../project.mjs';
import {
  discoverRuntimeTests,
  parseRuntimeArguments,
  partitionRuntimeTests,
  portableRuntimeTests,
  selectRuntimeTests,
} from '../ci/runtime-suite.mjs';

test('runtime partitions cover every discovered test exactly once and the exclusion list exists', () => {
  const files = discoverRuntimeTests(root);
  const groups = partitionRuntimeTests(files);
  const combined = [...groups.portable, ...groups.platform];
  assert.ok(groups.portable.length > 0);
  assert.ok(groups.platform.length > 0);
  assert.deepEqual(combined.sort(), files);
  assert.equal(new Set(combined).size, files.length);
  assert.equal(new Set(portableRuntimeTests).size, portableRuntimeTests.length);
  assert.deepEqual(groups.portable, [...portableRuntimeTests].sort());
});

test('new and nested Agent or backend tests run on every platform by default', (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'maaverge-runtime-suite-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const files = [
    'packages/agent/tests/new-agent.test.ts',
    'services/backend/tests/new-backend.test.ts',
    'services/backend/tests/nested/new-native.test.ts',
    'services/backend/tests/new-script.test.js',
    'services/backend/tests/new-component.spec.tsx',
    'services/backend/tests/new_module_test.ts',
  ].sort();
  for (const file of [...files, 'services/backend/tests/fixtures/helper.ts']) {
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, '');
  }
  assert.deepEqual(discoverRuntimeTests(directory), files);
  for (const platform of ['win32', 'darwin'])
    assert.deepEqual(selectRuntimeTests(files, { platformOnly: true, platform }), files);
});

test('Linux and the default command retain the full suite on every host', () => {
  const files = discoverRuntimeTests(root);
  for (const platform of ['linux', 'win32', 'darwin'])
    assert.deepEqual(selectRuntimeTests(files, { platform }), files);
  assert.deepEqual(selectRuntimeTests(files, { platformOnly: true, platform: 'linux' }), files);
  for (const platform of ['win32', 'darwin'])
    assert.deepEqual(
      selectRuntimeTests(files, { platformOnly: true, platform }),
      partitionRuntimeTests(files).platform,
    );
});

test('updates and platform I/O boundaries remain in every platform suite', () => {
  const files = discoverRuntimeTests(root);
  const protectedTests = files.filter(
    (file) =>
      /(?:update|download|proxy|mirrorchyan|archive|snapshot|lease|lifecycle|native-environment|notification|scheduler|integrity)/u.test(
        file,
      ) ||
      [
        'packages/agent/tests/tracing.test.ts',
        'packages/agent/tests/langchain-tools.test.ts',
        'services/backend/tests/app-release.test.ts',
        'services/backend/tests/core-release-channel.test.ts',
        'services/backend/tests/agent-tools.test.ts',
        'services/backend/tests/account-knowledge.test.ts',
        'services/backend/tests/copilot-rating.test.ts',
        'services/backend/tests/copilot-storage.test.ts',
        'services/backend/tests/knowledge.test.ts',
        'services/backend/tests/product-knowledge.test.ts',
        'services/backend/tests/resource-knowledge.test.ts',
        'services/backend/tests/item-resources.test.ts',
        'services/backend/tests/operator-resources.test.ts',
        'services/backend/tests/plan-device-bindings.test.ts',
        'services/backend/tests/wire-json.test.ts',
      ].includes(file),
  );
  assert.ok(protectedTests.length > 0);
  for (const platform of ['win32', 'darwin']) {
    const selected = new Set(selectRuntimeTests(files, { platformOnly: true, platform }));
    for (const file of protectedTests)
      assert.ok(selected.has(file), `${platform} must run ${file}`);
  }
});

test('runtime CLI rejects unknown and duplicate flags instead of silently reducing coverage', () => {
  assert.deepEqual(parseRuntimeArguments([]), { platformOnly: false });
  assert.deepEqual(parseRuntimeArguments(['--platform']), { platformOnly: true });
  for (const args of [
    ['--platform-only'],
    ['--platform', '--platform'],
    ['services/backend/tests'],
  ])
    assert.throws(() => parseRuntimeArguments(args), /Usage:/u);
});
