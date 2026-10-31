import { makeTemporaryDirectorySync } from '../test-support/temporary-directory.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { missingWorkspaceDependencies, resolveCmake } from '../environment.mjs';

function fixture(t) {
  const directory = makeTemporaryDirectorySync(path.join(tmpdir(), 'maa verge environment-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function json(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}

test('detects a newly added backend workspace even when frontend dependencies are present', (t) => {
  const directory = fixture(t);
  json(path.join(directory, 'package.json'), {});
  json(path.join(directory, 'apps/desktop/package.json'), { dependencies: { react: '^19' } });
  json(path.join(directory, 'apps/desktop/node_modules/react/package.json'), { version: '19.0.0' });
  json(path.join(directory, 'services/backend/package.json'), {
    dependencies: { tar: '7.5.22', yauzl: '3.4.0' },
    devDependencies: { '@types/bun': '1.4.3' },
  });
  assert.deepEqual(
    missingWorkspaceDependencies(directory),
    ['tar', 'yauzl', '@types/bun'].map((name) => `${path.join('services', 'backend')}: ${name}`),
  );
  for (const name of ['tar', 'yauzl', '@types/bun'])
    json(path.join(directory, 'services/backend/node_modules', name, 'package.json'), {});
  assert.deepEqual(missingWorkspaceDependencies(directory), []);
});

test('rejects Ubuntu 22.04 default CMake 3.22 before configuring native targets', () => {
  assert.throws(
    () =>
      resolveCmake({
        platform: 'linux',
        execute: () => ({ status: 0, stdout: 'cmake version 3.22.1\n' }),
      }),
    /CMake >=3\.25.*3\.22\.1/u,
  );
});

test('accepts CMake 3.25 and 4.x', () => {
  for (const version of ['3.25.0', '4.4.4']) {
    assert.equal(
      resolveCmake({ execute: () => ({ status: 0, stdout: `cmake version ${version}\n` }) })
        .version,
      version,
    );
  }
});

test('an outdated local CMake does not shadow a supported system installation', (t) => {
  const directory = fixture(t);
  const local = path.join(
    directory,
    '.tools/cmake/bin',
    process.platform === 'win32' ? 'cmake.exe' : 'cmake',
  );
  const system = path.join(directory, 'system/bin', path.basename(local));
  for (const file of [local, system]) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, 'fixture');
  }
  const result = resolveCmake({
    projectRoot: directory,
    environment: { PATH: [path.dirname(local), path.dirname(system)].join(path.delimiter) },
    execute: (program) => ({
      status: 0,
      stdout: `cmake version ${program === local ? '3.22.1' : '3.30.0'}\n`,
    }),
  });
  assert.equal(result.executable, system);
});

test('Windows falls back from an old PATH CMake to Visual Studio bundled CMake', (t) => {
  const directory = fixture(t);
  const vswhere = path.join(directory, 'Microsoft Visual Studio/Installer/vswhere.exe');
  mkdirSync(path.dirname(vswhere), { recursive: true });
  writeFileSync(vswhere, 'fixture');
  const visualStudio = path.join(directory, 'Visual Studio 2022');
  const bundled = path.join(
    visualStudio,
    'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe',
  );
  const result = resolveCmake({
    platform: 'win32',
    environment: { 'ProgramFiles(x86)': directory },
    execute: (program) => {
      if (program === vswhere) return { status: 0, stdout: `${visualStudio}\r\n` };
      if (program === bundled) return { status: 0, stdout: 'cmake version 3.31.6\n' };
      assert.equal(program, 'cmake');
      return { status: 0, stdout: 'cmake version 3.22.1\n' };
    },
  });
  assert.equal(result.executable, bundled);
});

test('missing CMake reports platform-specific installation guidance', () => {
  for (const [platform, message] of [
    ['win32', /Visual Studio/u],
    ['darwin', /xcode-select/u],
    ['linux', /pkg-config/u],
  ]) {
    assert.throws(
      () =>
        resolveCmake({
          platform,
          environment: {},
          execute: () => ({ status: null, error: new Error('ENOENT') }),
        }),
      message,
    );
  }
});
