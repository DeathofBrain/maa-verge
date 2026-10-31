import { makeTemporaryDirectorySync } from '../test-support/temporary-directory.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { root } from '../project.mjs';
import { ensureRust } from '../setup-rust.mjs';

function fixture(t, { local = false, rustup = false } = {}) {
  mkdirSync(path.join(root, '.tools'), { recursive: true });
  const projectRoot = makeTemporaryDirectorySync(path.join(root, '.tools/rust-setup-test-'));
  t.after(() => rmSync(projectRoot, { recursive: true, force: true, maxRetries: 3 }));
  writeFileSync(
    path.join(projectRoot, 'rust-toolchain.toml'),
    '[toolchain]\nchannel = "1.90.0"\nprofile = "minimal"\ncomponents = ["clippy", "rustfmt"]\n',
  );
  const bin = path.join(projectRoot, '.tools/cargo/bin');
  if (local || rustup) mkdirSync(bin, { recursive: true });
  if (rustup) writeFileSync(path.join(bin, 'rustup.exe'), 'fixture');
  return {
    projectRoot,
    bin,
    pinnedDirectory: path.join(
      projectRoot,
      '.tools/rustup/toolchains/1.90.0-x86_64-pc-windows-msvc',
    ),
  };
}

function version(program, args) {
  const name = path.basename(program).replace(/\.exe$/u, '');
  const output =
    name === 'rustc'
      ? 'rustc 1.90.0 (fixture)'
      : args[0] === 'fmt'
        ? 'rustfmt 1.8.0-stable (fixture)'
        : args[0] === 'clippy'
          ? 'clippy 0.1.90 (fixture)'
          : 'cargo 1.90.0 (fixture)';
  return { status: 0, stdout: `${output}\n`, stderr: '' };
}

function options(f, extra = {}) {
  return {
    projectRoot: f.projectRoot,
    platform: 'win32',
    architecture: 'x64',
    environment: { Path: 'system-tools', CARGO_HOME: 'user-cargo', RUSTUP_HOME: 'user-rustup' },
    report() {},
    download() {
      assert.fail('healthy toolchains must not download');
    },
    ...extra,
  };
}

test('a healthy local toolchain is reused with all required components and no network', async (t) => {
  const f = fixture(t, { local: true });
  mkdirSync(f.pinnedDirectory, { recursive: true });
  const calls = [];
  const environment = { Path: 'original', CARGO_HOME: 'original-cargo' };
  const result = await ensureRust(
    options(f, {
      environment,
      execute(program, args, settings) {
        calls.push({ program, args, settings });
        return version(program, args);
      },
    }),
  );
  assert.equal(result.local, true);
  assert.equal(result.cargo, path.join(f.bin, 'cargo.exe'));
  assert.deepEqual(
    calls.map(({ args }) => args),
    [['--version'], ['--version'], ['clippy', '--version'], ['fmt', '--version']],
  );
  for (const { settings } of calls) {
    assert.equal(settings.env.RUSTUP_AUTO_INSTALL, '0');
    assert.equal(settings.env.RUSTUP_TOOLCHAIN, '1.90.0-x86_64-pc-windows-msvc');
    assert.equal(settings.env.CARGO_HOME, path.join(f.projectRoot, '.tools/cargo'));
    assert.equal(settings.env.RUSTUP_HOME, path.join(f.projectRoot, '.tools/rustup'));
    assert.equal(settings.env.PATH, `${f.bin};original`);
    assert.equal(settings.env.Path, undefined);
  }
  assert.deepEqual(environment, { Path: 'original', CARGO_HOME: 'original-cargo' });
});

test('a healthy PATH toolchain can be reused without triggering rustup downloads', async (t) => {
  const f = fixture(t);
  const calls = [];
  const result = await ensureRust(
    options(f, {
      execute(program, args, settings) {
        calls.push({ program, args, settings });
        if (path.isAbsolute(program)) return { status: null, error: new Error('ENOENT') };
        assert.equal(settings.env.RUSTUP_AUTO_INSTALL, '0');
        return version(program, args);
      },
    }),
  );
  assert.equal(result.local, false);
  assert.equal(result.rustc, 'rustc');
  assert.equal(calls.length, 5);
});

test('a missing toolchain downloads a verified installer and installs only inside the checkout', async (t) => {
  const f = fixture(t);
  const installer = Buffer.from('synthetic rustup installer');
  const digest = createHash('sha256').update(installer).digest('hex');
  const urls = [];
  let installed = false;
  let invocation;
  const result = await ensureRust(
    options(f, {
      async download(url) {
        urls.push(url);
        return url.endsWith('.sha256') ? Buffer.from(`${digest}  rustup-init.exe\n`) : installer;
      },
      execute(program, args, settings) {
        if (args[0] === '-y') {
          assert.deepEqual(readFileSync(program), installer);
          invocation = { program, args, settings };
          installed = true;
          return { status: 0 };
        }
        return installed ? version(program, args) : { status: 1, stderr: 'not installed' };
      },
    }),
  );
  assert.equal(result.local, true);
  assert.deepEqual(urls, [
    'https://static.rust-lang.org/rustup/archive/1.28.2/x86_64-pc-windows-msvc/rustup-init.exe',
    'https://static.rust-lang.org/rustup/archive/1.28.2/x86_64-pc-windows-msvc/rustup-init.exe.sha256',
  ]);
  assert.deepEqual(invocation.args, [
    '-y',
    '--no-modify-path',
    '--profile',
    'minimal',
    '--default-toolchain',
    '1.90.0',
    '--component',
    'clippy',
    '--component',
    'rustfmt',
    '--default-host',
    'x86_64-pc-windows-msvc',
  ]);
  assert.equal(invocation.settings.env.CARGO_HOME, path.join(f.projectRoot, '.tools/cargo'));
  assert.equal(invocation.settings.env.RUSTUP_HOME, path.join(f.projectRoot, '.tools/rustup'));
  assert.equal(invocation.settings.stdio, 'inherit');
});

test('a mismatched installer checksum never executes the installer', async (t) => {
  const f = fixture(t);
  let installationCalls = 0;
  await assert.rejects(
    ensureRust(
      options(f, {
        download: async () => Buffer.from('invalid digest'),
        execute(program, args) {
          if (args[0] === '-y') installationCalls++;
          return { status: 1 };
        },
      }),
    ),
    /SHA-256 mismatch/u,
  );
  assert.equal(installationCalls, 0);
});

test('an incomplete local toolchain is repaired by its local rustup without downloading another installer', async (t) => {
  const f = fixture(t, { rustup: true });
  let installed = false;
  const calls = [];
  await ensureRust(
    options(f, {
      execute(program, args, settings) {
        calls.push({ program, args, settings });
        if (args[0] === 'toolchain') {
          assert.equal(program, path.join(f.bin, 'rustup.exe'));
          assert.deepEqual(args, [
            'toolchain',
            'install',
            '1.90.0-x86_64-pc-windows-msvc',
            '--profile',
            'minimal',
            '--component',
            'clippy',
            '--component',
            'rustfmt',
            '--no-self-update',
          ]);
          installed = true;
          return { status: 0 };
        }
        return installed ? version(program, args) : { status: 1 };
      },
    }),
  );
  assert.ok(calls.every(({ program }) => path.isAbsolute(program)));
});

test('installation failures stop before validation and retain the nonzero status', async (t) => {
  const f = fixture(t, { rustup: true });
  let calls = 0;
  await assert.rejects(
    ensureRust(
      options(f, {
        execute(program, args) {
          calls++;
          return { status: args[0] === 'toolchain' ? 23 : 1 };
        },
      }),
    ),
    /Rust installation failed.*23/u,
  );
  assert.equal(calls, 2);
});

test('stale component metadata is repaired by reinstalling only the unhealthy pinned toolchain', async (t) => {
  const f = fixture(t, { rustup: true });
  const rustupHome = path.join(f.projectRoot, '.tools/rustup');
  mkdirSync(f.pinnedDirectory, { recursive: true });
  writeFileSync(path.join(f.pinnedDirectory, 'components'), 'rustc\ncargo\nrustfmt\nclippy\n');
  const downloads = path.join(rustupHome, 'downloads');
  const otherVersion = path.join(rustupHome, 'toolchains/1.89.0-x86_64-pc-windows-msvc');
  for (const directory of [downloads, otherVersion]) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, 'preserve'), 'existing data');
  }
  const commands = [];
  let installed = false;
  await ensureRust(
    options(f, {
      execute(program, args, settings) {
        if (args[0] === 'toolchain') {
          commands.push(args);
          assert.equal(program, path.join(f.bin, 'rustup.exe'));
          assert.equal(settings.env.RUSTUP_HOME, rustupHome);
          if (args[1] === 'install') installed = true;
          return { status: 0 };
        }
        return installed ? version(program, args) : { status: 1, stderr: 'rustc.exe missing' };
      },
    }),
  );
  assert.equal(commands.length, 2);
  assert.deepEqual(commands[0], ['toolchain', 'uninstall', '1.90.0-x86_64-pc-windows-msvc']);
  assert.deepEqual(commands[1].slice(0, 3), [
    'toolchain',
    'install',
    '1.90.0-x86_64-pc-windows-msvc',
  ]);
  assert.equal(readFileSync(path.join(downloads, 'preserve'), 'utf8'), 'existing data');
  assert.equal(readFileSync(path.join(otherVersion, 'preserve'), 'utf8'), 'existing data');
});

test('failed removal of a corrupt pinned toolchain stops before another installation', async (t) => {
  const f = fixture(t, { rustup: true });
  mkdirSync(f.pinnedDirectory, { recursive: true });
  const commands = [];
  await assert.rejects(
    ensureRust(
      options(f, {
        execute(program, args) {
          if (args[0] === 'toolchain') {
            commands.push(args);
            return { status: 19 };
          }
          return { status: 1 };
        },
      }),
    ),
    /toolchain removal failed.*19/u,
  );
  assert.deepEqual(commands, [['toolchain', 'uninstall', '1.90.0-x86_64-pc-windows-msvc']]);
});

test('a newly restored rustup can reinstall an existing corrupt toolchain once', async (t) => {
  const f = fixture(t);
  mkdirSync(f.pinnedDirectory, { recursive: true });
  const installer = Buffer.from('synthetic rustup installer');
  const digest = createHash('sha256').update(installer).digest('hex');
  const commands = [];
  let installed = false;
  await ensureRust(
    options(f, {
      download: async (url) => (url.endsWith('.sha256') ? Buffer.from(digest) : installer),
      execute(program, args) {
        if (args[0] === '-y') {
          mkdirSync(f.bin, { recursive: true });
          writeFileSync(path.join(f.bin, 'rustup.exe'), 'restored proxy');
          return { status: 0 };
        }
        if (args[0] === 'toolchain') {
          commands.push(args);
          if (args[1] === 'install') installed = true;
          return { status: 0 };
        }
        return installed ? version(program, args) : { status: 1 };
      },
    }),
  );
  assert.deepEqual(
    commands.map((args) => args.slice(0, 3)),
    [
      ['toolchain', 'uninstall', '1.90.0-x86_64-pc-windows-msvc'],
      ['toolchain', 'install', '1.90.0-x86_64-pc-windows-msvc'],
    ],
  );
});

test('a toolchain that remains unhealthy is reinstalled at most once', async (t) => {
  const f = fixture(t, { rustup: true });
  mkdirSync(f.pinnedDirectory, { recursive: true });
  const commands = [];
  await assert.rejects(
    ensureRust(
      options(f, {
        execute(program, args) {
          if (args[0] === 'toolchain') {
            commands.push(args);
            return { status: 0 };
          }
          return { status: 1 };
        },
      }),
    ),
    /validation failed/u,
  );
  assert.deepEqual(
    commands.map((args) => args[1]),
    ['uninstall', 'install'],
  );
});

test('a runnable local toolchain with the wrong version is repaired to the pinned version', async (t) => {
  const f = fixture(t, { rustup: true });
  let installed = false;
  const result = await ensureRust(
    options(f, {
      execute(program, args) {
        if (args[0] === 'toolchain') {
          assert.ok(args.includes('1.90.0-x86_64-pc-windows-msvc'));
          installed = true;
          return { status: 0 };
        }
        if (!installed) return { status: 0, stdout: 'rustc 1.89.0 (fixture)\n' };
        return version(program, args);
      },
    }),
  );
  assert.equal(installed, true);
  assert.match(result.versions[0], /^rustc 1\.90\.0 /u);
});

test('a successful installer is rejected when required components still cannot run', async (t) => {
  const f = fixture(t, { rustup: true });
  let installed = false;
  await assert.rejects(
    ensureRust(
      options(f, {
        execute(program, args) {
          if (args[0] === 'toolchain') {
            installed = true;
            return { status: 0 };
          }
          if (!installed || args[0] === 'clippy') return { status: 1 };
          return version(program, args);
        },
      }),
    ),
    /validation failed/u,
  );
});

test('unsupported targets fail before executing or downloading anything', async (t) => {
  const f = fixture(t);
  await assert.rejects(
    ensureRust(
      options(f, {
        platform: 'win32',
        architecture: 'arm64',
        execute() {
          assert.fail('unsupported target must not execute tools');
        },
      }),
    ),
    /Unsupported Rust bootstrap target/u,
  );
});
