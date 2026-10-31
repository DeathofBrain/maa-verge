import { makeTemporaryDirectorySync } from '../test-support/temporary-directory.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { root } from '../project.mjs';
import {
  discoverRuntimeTests,
  parseRuntimeArguments,
  platformRuntimeTests,
  selectRuntimeTests,
} from '../ci/runtime-suite.mjs';

test('default commands and Linux discover every test; other hosts require their OS regressions', (t) => {
  const files = discoverRuntimeTests(root);
  for (const platform of ['linux', 'win32', 'darwin'])
    assert.deepEqual(selectRuntimeTests(files, { platform }), files);
  assert.deepEqual(selectRuntimeTests(files, { platformOnly: true, platform: 'linux' }), files);
  for (const platform of ['win32', 'darwin']) {
    const selected = selectRuntimeTests(files, { platformOnly: true, platform });
    assert.equal(new Set(selected).size, selected.length);
    assert.ok(selected.includes('services/backend/tests/lifecycle.test.ts'));
    assert.ok(selected.includes('services/backend/tests/mirrorchyan.test.ts'));
    assert.ok(!selected.includes('services/backend/tests/policy-parity.test.ts'));
    assert.throws(
      () =>
        selectRuntimeTests(
          files.filter((file) => file !== selected[0]),
          { platformOnly: true, platform },
        ),
      /Required platform runtime suite is missing/u,
    );
  }
  assert.ok(platformRuntimeTests.win32.includes('services/backend/tests/windows-adb.test.ts'));
  assert.ok(
    platformRuntimeTests.darwin.includes('services/backend/tests/macos-components.test.ts'),
  );

  const directory = makeTemporaryDirectorySync(path.join(os.tmpdir(), 'maaverge-runtime-suite-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const added = [
    'packages/agent/tests/new-agent.test.ts',
    'services/backend/tests/nested/new-backend.test.ts',
  ];
  for (const file of added) {
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, '');
  }
  assert.deepEqual(discoverRuntimeTests(directory), added);
  assert.deepEqual(
    selectRuntimeTests([...files, ...added], { platformOnly: true, platform: 'win32' }),
    selectRuntimeTests(files, { platformOnly: true, platform: 'win32' }),
  );
});

test('runtime CLI rejects unknown and duplicate flags and can require native fixtures', () => {
  assert.deepEqual(parseRuntimeArguments([]), { platformOnly: false, requireNative: false });
  assert.deepEqual(parseRuntimeArguments(['--platform', '--require-native']), {
    platformOnly: true,
    requireNative: true,
  });
  for (const args of [
    ['--platform-only'],
    ['--platform', '--platform'],
    ['services/backend/tests'],
  ])
    assert.throws(() => parseRuntimeArguments(args), /Usage:/u);
});
