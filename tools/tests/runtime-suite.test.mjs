import { makeTemporaryDirectorySync } from '../test-support/temporary-directory.mjs';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { root } from '../project.mjs';
import { withRuntimeTestEnvironment } from '../test-support/runtime-environment.mjs';
import { runRuntimeTests } from '../test-runtime.mjs';
import {
  discoverRuntimeTests,
  parseRuntimeArguments,
  platformRuntimeTests,
  runtimeTestDirectories,
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
  assert.deepEqual(parseRuntimeArguments([]), {
    platformOnly: false,
    requireNative: false,
    files: [],
  });
  assert.deepEqual(parseRuntimeArguments(['--platform', '--require-native']), {
    platformOnly: true,
    requireNative: true,
    files: [],
  });
  for (const args of [
    ['--platform-only'],
    ['--platform', '--platform'],
    ['services/backend/tests'],
  ])
    assert.throws(() => parseRuntimeArguments(args), /Usage:/u);
});

test('targeted runtime commands select explicit discovered files without expanding to the whole suite', () => {
  const files = discoverRuntimeTests(root);
  const selected = [
    'services/backend/tests/copilot-library.test.ts',
    files.find((file) => file.startsWith('packages/agent/tests/')),
  ];
  assert.equal(typeof selected[1], 'string');
  for (const patternArgs of [
    ['--test-name-pattern', 'preview|failure'],
    ['--test-name-pattern=preview|failure'],
  ]) {
    const options = parseRuntimeArguments([
      `./${selected[0]}`,
      selected[1].replaceAll('/', '\\'),
      '--require-native',
      ...patternArgs,
    ]);
    assert.deepEqual(options, {
      platformOnly: false,
      requireNative: true,
      files: selected,
      testNamePattern: 'preview|failure',
    });
    assert.deepEqual(selectRuntimeTests(files, options), selected);
  }
  assert.deepEqual(
    selectRuntimeTests(files, parseRuntimeArguments(['--test-name-pattern', 'preview'])),
    files,
  );
  assert.equal(
    parseRuntimeArguments(['--test-name-pattern=--literal']).testNamePattern,
    '--literal',
  );
  assert.throws(
    () =>
      selectRuntimeTests(files, parseRuntimeArguments(['services/backend/tests/absent.test.ts'])),
    /Runtime test file was not discovered/u,
  );
});

test('the unfiltered runtime runner retains both complete test directories', async () => {
  let called = false;
  await runRuntimeTests([], {
    ensureRuntime: async () => 'fixed-test-bun',
    execute: async (_runtime, args) => {
      called = true;
      assert.deepEqual(args.slice(3), runtimeTestDirectories);
    },
  });
  assert.equal(called, true);
});

test('targeted runtime CLI rejects paths and filters that could silently change the intended scope', () => {
  const file = 'services/backend/tests/copilot-library.test.ts';
  for (const args of [
    ['../services/backend/tests/copilot-library.test.ts'],
    [path.resolve(root, file)],
    ['C:\\repo\\services\\backend\\tests\\copilot-library.test.ts'],
    ['services/backend/tests/../tests/copilot-library.test.ts'],
    ['services/backend/tests'],
    ['services/backend/tests/archive-fixture.ts'],
    ['tests/ui/copilot-center.spec.ts'],
    [file, `./${file}`],
    ['--require-native', '--require-native'],
    ['--platform', file],
    ['--platform', '--test-name-pattern', 'preview'],
    ['--test-name-pattern'],
    ['--test-name-pattern='],
    ['--test-name-pattern', '--require-native'],
    ['--test-name-pattern', '['],
    ['--test-name-pattern=x', '--test-name-pattern', 'y'],
    ['--'],
    ['--unknown'],
  ])
    assert.throws(() => parseRuntimeArguments(args), /Usage:/u, JSON.stringify(args));
});

for (const outcome of ['success', 'failure']) {
  test(`targeted runner forwards only its selection and name filter inside the isolated environment after ${outcome}`, async () => {
    const file = 'services/backend/tests/copilot-library.test.ts';
    let directory;
    let runtimeSelected = false;
    let called = false;
    const failure = new Error('synthetic runner failure');
    const pending = runRuntimeTests([file, '--test-name-pattern', 'preview|failure'], {
      ensureRuntime: async () => {
        runtimeSelected = true;
        return 'fixed-test-bun';
      },
      execute: async (runtime, args, { env }) => {
        called = true;
        assert.equal(runtimeSelected, true);
        assert.equal(runtime, 'fixed-test-bun');
        assert.deepEqual(args, [
          'test',
          '--timeout',
          process.env.MAAVERGE_TEST_TIMEOUT_MS ?? '30000',
          '--test-name-pattern',
          'preview|failure',
          `./${file}`,
        ]);
        directory = path.dirname(env.MAAVERGE_DEVICE_LOCK_DIR);
        assert.equal(realpathSync.native(directory), directory);
        assert.notEqual(env.MAAVERGE_DEVICE_LOCK_DIR, process.env.MAAVERGE_DEVICE_LOCK_DIR);
        assert.ok(!Object.keys(env).some((key) => /^(?:LANGCHAIN|LANGSMITH)_/iu.test(key)));
        if (outcome === 'failure') throw failure;
      },
    });
    if (outcome === 'failure') await assert.rejects(pending, (error) => error === failure);
    else await pending;
    assert.equal(called, true);
    assert.equal(existsSync(directory), false);
  });
}

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
