import assert from 'node:assert/strict';
import test from 'node:test';
import { syncPython } from '../sync-python.mjs';

const uvExecutable = 'checkout tools/uv/uv';
const windowsCacheError =
  'Failed to build maaverge-runtime\n' +
  'failed to open file `C:\\Users\\fixture\\AppData\\Local\\uv\\cache\\archive-v0\\broken\\trove_classifiers-2026.9.21.13.dist-info\\WHEEL`: ' +
  'The system cannot find the file specified. (os error 2)\n';

function fixture(results) {
  const calls = [];
  const reports = [];
  const run = () =>
    syncPython(uvExecutable, {
      execute(program, args, options) {
        calls.push({ program, args, options, reported: reports.join('') });
        assert.ok(calls.length <= results.length, 'unexpected extra uv invocation');
        return results[calls.length - 1];
      },
      report(message) {
        reports.push(message);
      },
    });
  return { run, calls, reports };
}

function assertCommands(calls, expected) {
  assert.deepEqual(
    calls.map(({ program, args }) => ({ program, args })),
    expected.map((args) => ({ program: uvExecutable, args })),
  );
}

test('a successful frozen sync completes once and reports uv diagnostics', () => {
  const diagnostics = 'Audited 23 packages in 1ms\n';
  const f = fixture([{ status: 0, stderr: diagnostics }]);
  assert.equal(f.run(), undefined);
  assertCommands(f.calls, [['sync', '--frozen']]);
  assert.ok(f.reports.join('').includes(diagnostics));
});

test('a missing Windows wheel cache retries a frozen sync without using the cache', () => {
  const f = fixture([
    { status: 1, stderr: windowsCacheError },
    { status: 0, stderr: 'Installed 23 packages\n' },
  ]);
  assert.equal(f.run(), undefined);
  assertCommands(f.calls, [
    ['sync', '--frozen'],
    ['sync', '--frozen', '--no-cache'],
  ]);
  assert.ok(f.reports.join('').includes(windowsCacheError));
  assert.ok(f.calls[1].reported.includes(windowsCacheError));
  assert.ok(f.reports.join('').includes('Installed 23 packages'));
});

test('a missing POSIX wheel cache also retries without using the cache', () => {
  const diagnostics =
    'failed to open file `/home/fixture/.cache/uv/archive-v0/broken/pkg.dist-info/WHEEL`: No such file or directory (os error 2)\n';
  const f = fixture([
    { status: 1, stderr: diagnostics },
    { status: 0, stderr: '' },
  ]);
  assert.equal(f.run(), undefined);
  assertCommands(f.calls, [
    ['sync', '--frozen'],
    ['sync', '--frozen', '--no-cache'],
  ]);
  assert.ok(f.reports.join('').includes(diagnostics));
});

test('ordinary build, network, and filesystem failures are reported without retrying', async (t) => {
  const failures = [
    ['build', 'Failed to build maaverge-runtime: the build backend returned an error\n'],
    ['network', 'Failed to download hatchling: connection timed out\n'],
    [
      'missing project source',
      'failed to open file `/checkout/source.py`: No such file or directory (os error 2)\n',
    ],
    [
      'cache permission error',
      'failed to open file `/cache/archive-v0/broken/pkg.dist-info/WHEEL`: Access is denied (os error 5)\n',
    ],
    [
      'other missing cache operation',
      'failed to write file `/cache/archive-v0/file` (os error 2)\n',
    ],
  ];
  for (const [name, diagnostics] of failures) {
    await t.test(name, () => {
      const f = fixture([{ status: 1, stderr: diagnostics }]);
      assert.throws(f.run, Error);
      assertCommands(f.calls, [['sync', '--frozen']]);
      assert.ok(f.reports.join('').includes(diagnostics));
    });
  }
});

test('a failed cache bypass reports its diagnostics and throws without a third attempt', () => {
  const diagnostics = 'Failed to download hatchling: connection timed out\n';
  const f = fixture([
    { status: 1, stderr: windowsCacheError },
    { status: 1, stderr: diagnostics },
  ]);
  assert.throws(f.run, /Python dependency sync failed.*uv exited 1/iu);
  assertCommands(f.calls, [
    ['sync', '--frozen'],
    ['sync', '--frozen', '--no-cache'],
  ]);
  const output = f.reports.join('');
  assert.ok(output.includes(windowsCacheError));
  assert.ok(output.includes(diagnostics));
  assert.ok(output.indexOf(windowsCacheError) < output.indexOf(diagnostics));
});

test('a second missing cache failure still stops after the cache bypass', () => {
  const f = fixture([
    { status: 1, stderr: windowsCacheError },
    { status: 1, stderr: windowsCacheError },
  ]);
  assert.throws(f.run, Error);
  assertCommands(f.calls, [
    ['sync', '--frozen'],
    ['sync', '--frozen', '--no-cache'],
  ]);
});

test('a uv process launch failure throws without retrying', () => {
  const f = fixture([{ status: null, stderr: '', error: new Error('spawn uv ENOENT') }]);
  assert.throws(f.run, /ENOENT/u);
  assertCommands(f.calls, [['sync', '--frozen']]);
});
