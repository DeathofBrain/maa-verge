import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  loadRustNoticeMetadata,
  writeApplicationNotices,
  writeJavaScriptNotices,
  writeRustNotices,
} from '../runtime-notices.mjs';

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'maa verge runtime notices-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function write(file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function json(file, value) {
  write(file, JSON.stringify(value));
}

test('bundles application and community notices and rejects missing source attribution', (t) => {
  const projectRoot = fixture(t),
    output = path.join(projectRoot, 'output');
  const files = [
    ['LICENSE', 'MAAVERGE-LICENSE'],
    ['NOTICE.md', 'NOTICE.md'],
    ['docs/copilot-attribution.md', 'docs/copilot-attribution.md'],
    ['services/native/THIRD_PARTY_NOTICES.md', 'native-worker-notices.md'],
    ['services/backend/UNICODE-LICENSE.txt', 'UNICODE-LICENSE.txt'],
    ['services/backend/BUN-LICENSE.md', 'BUN-LICENSE.md'],
  ];
  for (const [source] of files) write(path.join(projectRoot, source), `original notice: ${source}`);
  writeApplicationNotices(output, { projectRoot });
  for (const [source, target] of files)
    assert.equal(readFileSync(path.join(output, target), 'utf8'), `original notice: ${source}`);
  rmSync(path.join(projectRoot, 'NOTICE.md'));
  assert.throws(() => writeApplicationNotices(output, { projectRoot }), /NOTICE\.md/);
});

function packageAt(
  directory,
  name,
  version,
  extra = {},
  notices = { LICENSE: `${name} ${version} license body` },
) {
  json(path.join(directory, 'package.json'), { name, version, ...extra });
  for (const [filename, text] of Object.entries(notices))
    write(path.join(directory, filename), text);
}

function outputText(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .map((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? outputText(file) : readFileSync(file, 'utf8');
    })
    .join('\n');
}

function rustFixture(t) {
  const projectRoot = fixture(t),
    output = path.join(projectRoot, 'output');
  const sysroot = path.join(projectRoot, 'toolchain');
  const documentation = path.join(sysroot, 'share/doc/rust');
  write(
    path.join(documentation, 'COPYRIGHT-library.html'),
    '<html>standard library third-party notices</html>',
  );
  write(path.join(documentation, 'licenses/MIT.txt'), 'standard library MIT license body');
  write(
    path.join(documentation, 'licenses/Apache-2.0.txt'),
    'standard library Apache license body',
  );
  json(path.join(projectRoot, 'tools/licenses/rust-overrides.json'), {});
  const metadata = { packages: [], resolve: { root: 'fixture-root', nodes: [] } };
  function crate(
    name,
    version = '1.0.0',
    {
      root = false,
      notices = { 'LICENSE-MIT': `${name} ${version} license body` },
      targets = [{ kind: ['lib'] }],
      licenseFile = null,
    } = {},
  ) {
    const id = root ? 'fixture-root' : `${name}@${version}`;
    const directory = path.join(projectRoot, 'crates', `${name}-${version}`);
    write(
      path.join(directory, 'Cargo.toml'),
      `[package]\nname = "${name}"\nversion = "${version}"\n`,
    );
    for (const [filename, text] of Object.entries(notices))
      write(path.join(directory, filename), text);
    metadata.packages.push({
      id,
      name,
      version,
      manifest_path: path.join(directory, 'Cargo.toml'),
      source: root ? null : 'registry+https://github.com/rust-lang/crates.io-index',
      license: 'MIT',
      license_file: licenseFile,
      targets,
    });
    metadata.resolve.nodes.push({ id, deps: [] });
    return id;
  }
  function dependency(from, to, kind = null) {
    metadata.resolve.nodes
      .find((node) => node.id === from)
      .deps.push({ name: to, pkg: to, dep_kinds: [{ kind, target: null }] });
  }
  crate('desktop', '0.1.0', { root: true, notices: {} });
  return {
    projectRoot,
    output,
    documentation,
    metadata,
    crate,
    dependency,
    options: {
      metadata,
      target: 'x86_64-pc-windows-msvc',
      version: 'rustc 1.90.0 (fixture)',
      sysroot,
      projectRoot,
    },
  };
}

test('collects frontend, backend and workspace production dependencies, preserving notices and dependency versions', (t) => {
  const projectRoot = fixture(t),
    output = path.join(projectRoot, 'output');
  const frontend = path.join(projectRoot, 'apps/desktop'),
    backend = path.join(projectRoot, 'services/backend');
  packageAt(
    frontend,
    '@maaverge/desktop',
    '0.1.0',
    {
      dependencies: { '@maaverge/contracts': 'workspace:*', react: '19', 'lucide-react': '1' },
      devDependencies: { vite: '7' },
    },
    {},
  );
  packageAt(
    backend,
    '@maaverge/backend',
    '0.1.0',
    { dependencies: { tar: '7', shared: '1' }, devDependencies: { typescript: '5' } },
    {},
  );
  packageAt(
    path.join(projectRoot, 'packages/contracts'),
    '@maaverge/contracts',
    '0.1.0',
    { dependencies: { '@tauri-apps/api': '2' }, devDependencies: { 'dev-only': '1' } },
    {},
  );
  // Export maps need not expose package.json for notice resolution.
  packageAt(path.join(projectRoot, 'node_modules/@tauri-apps/api'), '@tauri-apps/api', '2.9.0', {
    exports: { './core': './core.js' },
  });
  packageAt(path.join(frontend, 'node_modules/react'), 'react', '19.0.0', {
    dependencies: { shared: '1' },
  });
  packageAt(
    path.join(frontend, 'node_modules/lucide-react'),
    'lucide-react',
    '1.0.0',
    {},
    {
      'LICENSE-MIT': 'lucide MIT body',
      LICENSE_APACHE: 'lucide Apache body',
      NOTICE: 'lucide attribution body',
    },
  );
  packageAt(path.join(projectRoot, 'node_modules/shared'), 'shared', '1.0.0');
  packageAt(path.join(backend, 'node_modules/tar'), 'tar', '7.0.0', {
    dependencies: { shared: '2' },
  });
  packageAt(
    path.join(backend, 'node_modules/tar/node_modules/shared'),
    'shared',
    '2.0.0',
    {},
    { COPYING: 'shared 2.0.0 license body' },
  );

  assert.equal(writeJavaScriptNotices(output, { projectRoot }), 6);
  const text = outputText(output);
  for (const identity of [
    'react@19.0.0',
    'lucide-react@1.0.0',
    'tar@7.0.0',
    '@tauri-apps/api@2.9.0',
    'shared@1.0.0',
    'shared@2.0.0',
  ])
    assert.ok(text.includes(identity), identity);
  for (const body of [
    'lucide MIT body',
    'lucide Apache body',
    'lucide attribution body',
    'shared 1.0.0 license body',
    'shared 2.0.0 license body',
  ])
    assert.equal(text.split(body).length - 1, 1, body);
  for (const excluded of ['@maaverge/contracts@', 'vite@', 'typescript@', 'dev-only@'])
    assert.ok(!text.includes(excluded), excluded);
});

test('fails when a JavaScript production dependency has no license text', (t) => {
  const projectRoot = fixture(t);
  packageAt(
    path.join(projectRoot, 'apps/desktop'),
    '@maaverge/desktop',
    '0.1.0',
    { dependencies: { unlicensed: '1' } },
    {},
  );
  packageAt(path.join(projectRoot, 'services/backend'), '@maaverge/backend', '0.1.0', {}, {});
  packageAt(
    path.join(projectRoot, 'apps/desktop/node_modules/unlicensed'),
    'unlicensed',
    '1.2.3',
    {},
    {},
  );
  assert.throws(
    () => writeJavaScriptNotices(path.join(projectRoot, 'output'), { projectRoot }),
    /Missing JavaScript dependency license: unlicensed@1\.2\.3/u,
  );
});

test('uses verified JavaScript license supplements only for the exact package version and declaration', (t) => {
  const projectRoot = fixture(t),
    output = path.join(projectRoot, 'output');
  const packageDirectory = path.join(projectRoot, 'apps/desktop/node_modules/missing-notice');
  packageAt(
    path.join(projectRoot, 'apps/desktop'),
    '@maaverge/desktop',
    '0.1.0',
    { dependencies: { 'missing-notice': '1' } },
    {},
  );
  packageAt(path.join(projectRoot, 'services/backend'), '@maaverge/backend', '0.1.0', {}, {});
  packageAt(packageDirectory, 'missing-notice', '1.2.3', { license: 'MIT' }, {});
  const body = 'MIT license with original upstream copyright\n';
  const file = 'missing-notice-LICENSE',
    source = 'https://example.invalid/fixed-commit/LICENSE';
  const sha256 = createHash('sha256').update(body).digest('hex');
  write(path.join(projectRoot, 'tools/licenses', file), body);
  json(path.join(projectRoot, 'tools/licenses/javascript-overrides.json'), {
    'missing-notice@1.2.3': {
      file,
      sha256,
      source,
      commit: 'fixed-commit',
      evidence: 'https://example.invalid/metadata/1.2.3',
      selectedLicense: 'MIT',
    },
  });
  assert.equal(writeJavaScriptNotices(output, { projectRoot }), 1);
  const text = outputText(output);
  for (const expected of [
    body,
    source,
    sha256,
    'fixed-commit',
    'Selected license: MIT',
    'https://example.invalid/metadata/1.2.3',
  ])
    assert.ok(text.includes(expected), expected);
  packageAt(packageDirectory, 'missing-notice', '1.2.4', { license: 'MIT' }, {});
  assert.throws(
    () => writeJavaScriptNotices(output, { projectRoot }),
    /Missing JavaScript dependency license: missing-notice@1\.2\.4/u,
  );
  packageAt(packageDirectory, 'missing-notice', '1.2.3', { license: 'Apache-2.0' }, {});
  assert.throws(
    () => writeJavaScriptNotices(output, { projectRoot }),
    /Missing JavaScript dependency license: missing-notice@1\.2\.3/u,
  );
  packageAt(packageDirectory, 'missing-notice', '1.2.3', { license: 'MIT' }, {});
  write(path.join(projectRoot, 'tools/licenses', file), 'tampered text');
  assert.throws(
    () => writeJavaScriptNotices(output, { projectRoot }),
    /JavaScript license override checksum mismatch: missing-notice@1\.2\.3/u,
  );
  // Actual published notice text always wins over the supplemental copy.
  write(path.join(packageDirectory, 'LICENSE'), 'published license body');
  assert.equal(writeJavaScriptNotices(output, { projectRoot }), 1);
  assert.ok(outputText(output).includes('published license body'));
});

test('collects only Rust normal dependency paths and excludes proc macros even with a build target', (t) => {
  const f = rustFixture(t);
  const normal = f.crate('normal'),
    shared = f.crate('shared'),
    mixed = f.crate('also-normal');
  const declared = f.crate('declared-license', '1.0.0', {
    notices: { 'legal/terms.txt': 'declared custom license body' },
    licenseFile: 'legal/terms.txt',
  });
  const build = f.crate('build-only', '1.0.0', { notices: {} }),
    dev = f.crate('dev-only', '1.0.0', { notices: {} });
  const macro = f.crate('fixture-macro', '1.0.0', {
    notices: {},
    targets: [{ kind: ['proc-macro'] }, { kind: ['custom-build'] }],
  });
  const macroDependency = f.crate('macro-only-helper', '1.0.0', { notices: {} });
  f.dependency('fixture-root', normal);
  f.dependency('fixture-root', build, 'build');
  f.dependency('fixture-root', mixed, 'build');
  f.dependency('fixture-root', dev, 'dev');
  f.dependency('fixture-root', macro);
  f.dependency(normal, shared);
  f.dependency(normal, shared);
  f.dependency(normal, mixed);
  f.dependency(normal, declared);
  f.dependency(macro, macroDependency);
  assert.equal(writeRustNotices(f.output, f.options), 4);
  const text = outputText(f.output);
  for (const name of ['normal', 'shared', 'also-normal', 'declared-license'])
    assert.ok(text.includes(`${name}@1.0.0`), name);
  for (const name of ['build-only', 'dev-only', 'fixture-macro', 'macro-only-helper'])
    assert.ok(!text.includes(`${name}@`), name);
  assert.equal(text.split('shared 1.0.0 license body').length - 1, 1);
  assert.ok(text.includes('declared custom license body'));
  for (const body of [
    'standard library third-party notices',
    'standard library MIT license body',
    'standard library Apache license body',
  ])
    assert.ok(text.includes(body), body);
});

test('requires Rust dependency text, declared license files and standard library notices', (t) => {
  const missing = rustFixture(t);
  missing.dependency('fixture-root', missing.crate('missing-license', '1.0.0', { notices: {} }));
  assert.throws(
    () => writeRustNotices(missing.output, missing.options),
    /Missing Rust dependency license: missing-license@1\.0\.0/u,
  );
  const declared = rustFixture(t);
  declared.dependency(
    'fixture-root',
    declared.crate('missing-declared', '1.0.0', { licenseFile: 'absent.txt' }),
  );
  assert.throws(
    () => writeRustNotices(declared.output, declared.options),
    /Missing declared Rust dependency license: missing-declared@1\.0\.0/u,
  );
  for (const filename of [
    'COPYRIGHT-library.html',
    'licenses/MIT.txt',
    'licenses/Apache-2.0.txt',
  ]) {
    const standardLibrary = rustFixture(t);
    rmSync(path.join(standardLibrary.documentation, filename));
    assert.throws(
      () => writeRustNotices(standardLibrary.output, standardLibrary.options),
      /Missing Rust standard library licenses/u,
    );
  }
});

function overrideFixture(f) {
  const body = 'verified upstream copyright and license body';
  const override = {
    file: 'fixture-LICENSE.txt',
    sha256: createHash('sha256').update(body).digest('hex'),
    source: 'https://example.invalid/upstream/commit/LICENSE',
    commit: 'a'.repeat(40),
    evidence: 'https://example.invalid/upstream/commit/src/lib.rs',
  };
  write(path.join(f.projectRoot, 'tools/licenses', override.file), body);
  json(path.join(f.projectRoot, 'tools/licenses/rust-overrides.json'), {
    'omitted-license@1.0.0': override,
  });
  return { body, override };
}

test('uses verified Rust license overrides only for the exact package version and preserves their source', (t) => {
  const f = rustFixture(t),
    { body, override } = overrideFixture(f);
  f.dependency('fixture-root', f.crate('omitted-license', '1.0.0', { notices: {} }));
  assert.equal(writeRustNotices(f.output, f.options), 1);
  const text = outputText(f.output);
  for (const value of [body, override.source, override.commit, override.evidence, override.sha256])
    assert.ok(text.includes(value), value);

  const updated = rustFixture(t);
  overrideFixture(updated);
  updated.dependency('fixture-root', updated.crate('omitted-license', '1.0.1', { notices: {} }));
  assert.throws(
    () => writeRustNotices(updated.output, updated.options),
    /Missing Rust dependency license: omitted-license@1\.0\.1/u,
  );
});

test('rejects Rust fallback license text whose checksum changed', (t) => {
  const f = rustFixture(t),
    { override } = overrideFixture(f);
  f.dependency('fixture-root', f.crate('omitted-license', '1.0.0', { notices: {} }));
  write(
    path.join(f.projectRoot, 'tools/licenses', override.file),
    'changed unverified license text',
  );
  assert.throws(
    () => writeRustNotices(f.output, f.options),
    /Rust dependency license checksum mismatch: omitted-license@1\.0\.0/u,
  );
});

test('preserves all declared fallback files and the selected license branch', (t) => {
  const f = rustFixture(t),
    { override } = overrideFixture(f);
  const body = 'exact upstream license declaration and SDK notice';
  const declaration = {
    file: 'upstream-LICENSE.md',
    sha256: createHash('sha256').update(body).digest('hex'),
    source: 'https://example.invalid/upstream/commit/LICENSE.md',
  };
  write(path.join(f.projectRoot, 'tools/licenses', declaration.file), body);
  json(path.join(f.projectRoot, 'tools/licenses/rust-overrides.json'), {
    'omitted-license@1.0.0': {
      commit: override.commit,
      selectedLicense: 'MIT',
      files: [declaration, override],
    },
  });
  const id = f.crate('omitted-license', '1.0.0', { notices: {} });
  f.metadata.packages.find((info) => info.id === id).authors = ['Fixture Author'];
  f.dependency('fixture-root', id);
  assert.equal(writeRustNotices(f.output, f.options), 1);
  const text = outputText(f.output);
  for (const value of [
    body,
    declaration.source,
    declaration.sha256,
    override.source,
    override.sha256,
    'Selected license: MIT',
    'Authors: Fixture Author',
  ])
    assert.ok(text.includes(value), value);
});

test('collects verified fallback text for locked macOS notification and objc2 crates on both architectures', (t) => {
  const f = rustFixture(t);
  const licenseDirectory = new URL('../licenses/', import.meta.url);
  const overrides = JSON.parse(
    readFileSync(new URL('rust-overrides.json', licenseDirectory), 'utf8'),
  );
  json(path.join(f.projectRoot, 'tools/licenses/rust-overrides.json'), overrides);
  for (const override of Object.values(overrides)) {
    for (const notice of override.files || [override]) {
      write(
        path.join(f.projectRoot, 'tools/licenses', notice.file),
        readFileSync(new URL(notice.file, licenseDirectory)),
      );
    }
  }
  const lock = readFileSync(
    new URL('../../apps/desktop/src-tauri/Cargo.lock', import.meta.url),
    'utf8',
  );
  const crates = lock.split('[[package]]').flatMap((section) => {
    const name = /^name = "([^"]+)"$/mu.exec(section)?.[1];
    const version = /^version = "([^"]+)"$/mu.exec(section)?.[1];
    return name && /^(?:objc2(?:-|$)|block2$|dispatch2$|mac-notification-sys$)/u.test(name)
      ? [{ name, version }]
      : [];
  });
  assert.ok(
    crates.some(({ name }) => name === 'objc2-osa-kit'),
    'the updater dependency must be included',
  );
  assert.ok(
    crates.some(({ name }) => name === 'mac-notification-sys'),
    'the notification dependency must be included',
  );
  for (const { name, version } of crates)
    f.dependency('fixture-root', f.crate(name, version, { notices: {} }));
  for (const target of ['aarch64-apple-darwin', 'x86_64-apple-darwin']) {
    const output = path.join(f.output, target);
    assert.equal(writeRustNotices(output, { ...f.options, target }), crates.length);
    for (const { name, version } of crates) {
      const identity = `${name}@${version}`,
        override = overrides[identity];
      const text = readFileSync(path.join(output, `rust-${identity}.txt`), 'utf8');
      for (const value of [
        identity,
        `Build target: ${target}`,
        'Selected license: MIT',
        override.commit,
        override.evidence,
      ])
        assert.ok(text.includes(value), value);
      for (const notice of override.files || [override]) {
        for (const value of [
          notice.source,
          notice.sha256,
          readFileSync(new URL(notice.file, licenseDirectory), 'utf8'),
        ])
          assert.ok(text.includes(value), `${identity}: ${notice.file}`);
      }
    }
  }
});

function rustToolFixture(projectRoot, environment, calls, failure) {
  const version =
    'rustc 1.90.0 (fixture)\r\nbinary: rustc\r\nhost: x86_64-pc-windows-msvc\r\nrelease: 1.90.0\r\n';
  const metadata = { packages: [], resolve: { root: 'fixture-root', nodes: [] } };
  const sysroot = path.join(projectRoot, 'toolchain');
  return {
    version,
    metadata,
    sysroot,
    execute(program, args, options) {
      calls.push({ program, args, options });
      assert.equal(options.cwd, projectRoot);
      assert.equal(options.env, environment);
      const operation =
        args[0] === 'metadata' ? 'cargo' : args[0] === '-vV' ? 'version' : 'sysroot';
      if (failure?.operation === operation) return failure.result;
      if (operation === 'cargo') return { status: 0, stdout: JSON.stringify(metadata) };
      if (operation === 'version') return { status: 0, stdout: version };
      assert.deepEqual(args, ['--print', 'sysroot']);
      return { status: 0, stdout: `${sysroot}\r\n` };
    },
  };
}

test('loads locked Rust metadata for the explicit target or the rustc host, preserving injected execution', (t) => {
  const projectRoot = fixture(t);
  for (const environment of [
    { CARGO_BUILD_TARGET: 'aarch64-apple-darwin', RUSTC: 'fixture-rustc' },
    {},
  ]) {
    const calls = [],
      stub = rustToolFixture(projectRoot, environment, calls);
    const result = loadRustNoticeMetadata({ projectRoot, environment, execute: stub.execute });
    const target = environment.CARGO_BUILD_TARGET || 'x86_64-pc-windows-msvc';
    assert.equal(result.target, target);
    assert.equal(result.version, stub.version);
    assert.equal(result.sysroot, stub.sysroot);
    assert.deepEqual(result.metadata, stub.metadata);
    const cargo = calls.find((call) => call.args[0] === 'metadata');
    assert.ok(cargo.args.includes('--locked'));
    assert.equal(cargo.args[cargo.args.indexOf('--filter-platform') + 1], target);
    assert.equal(cargo.args[cargo.args.indexOf('--format-version') + 1], '1');
    assert.equal(
      cargo.args[cargo.args.indexOf('--manifest-path') + 1],
      path.join(projectRoot, 'apps/desktop/src-tauri/Cargo.toml'),
    );
    if (environment.RUSTC)
      for (const call of calls.filter((call) => call !== cargo))
        assert.equal(call.program, environment.RUSTC);
  }
});

test('fails with the Rust command diagnostic when metadata or toolchain discovery cannot run', (t) => {
  const projectRoot = fixture(t),
    environment = {};
  for (const failure of [
    {
      operation: 'cargo',
      result: { status: 101, stdout: '', stderr: 'fixture cargo metadata failed' },
      diagnostic: /fixture cargo metadata failed/u,
    },
    {
      operation: 'version',
      result: { status: null, error: new Error('fixture rustc ENOENT') },
      diagnostic: /fixture rustc ENOENT/u,
    },
    {
      operation: 'sysroot',
      result: { status: 1, stdout: '', stderr: 'fixture sysroot unavailable' },
      diagnostic: /fixture sysroot unavailable/u,
    },
  ]) {
    const stub = rustToolFixture(projectRoot, environment, [], failure);
    assert.throws(
      () => loadRustNoticeMetadata({ projectRoot, environment, execute: stub.execute }),
      failure.diagnostic,
    );
  }
});
