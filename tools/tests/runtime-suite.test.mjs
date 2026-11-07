import { makeTemporaryDirectorySync } from '../test-support/temporary-directory.mjs';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { root } from '../project.mjs';
import { withRuntimeTestEnvironment } from '../test-support/runtime-environment.mjs';
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

for (const outcome of ['success', 'failure']) {
  test(`runtime device leases stay shared within the suite and are cleaned after ${outcome}`, async (t) => {
    const configured = makeTemporaryDirectorySync(
      path.join(os.tmpdir(), 'maaverge-existing-test-locks-'),
    );
    t.after(() => rmSync(configured, { recursive: true, force: true }));
    const sentinel = path.join(configured, 'existing.lock');
    writeFileSync(sentinel, 'preserve');
    const environment = { ...process.env, MAAVERGE_DEVICE_LOCK_DIR: configured };
    let directory;
    const failure = new Error('synthetic test failure');
    const pending = withRuntimeTestEnvironment(async (env) => {
      const locks = env.MAAVERGE_DEVICE_LOCK_DIR;
      directory = path.dirname(locks);
      assert.notEqual(locks, configured);
      assert.equal(realpathSync.native(directory), directory);
      mkdirSync(locks);
      writeFileSync(path.join(locks, 'shared.lock'), 'synthetic');
      const child = spawnSync(
        process.execPath,
        [
          '-e',
          `const fs = require('node:fs');
           const path = require('node:path');
           process.stdout.write(fs.readFileSync(path.join(process.env.MAAVERGE_DEVICE_LOCK_DIR, 'shared.lock'), 'utf8'));`,
        ],
        { env, encoding: 'utf8', windowsHide: true, timeout: 10000 },
      );
      assert.equal(child.status, 0, child.stderr || child.error?.message);
      assert.equal(child.stdout, 'synthetic');
      if (outcome === 'failure') throw failure;
      return 'completed';
    }, environment);
    if (outcome === 'failure') await assert.rejects(pending, (error) => error === failure);
    else assert.equal(await pending, 'completed');
    assert.equal(existsSync(directory), false);
    assert.equal(existsSync(sentinel), true);
    assert.equal(environment.MAAVERGE_DEVICE_LOCK_DIR, configured);
  });
}
