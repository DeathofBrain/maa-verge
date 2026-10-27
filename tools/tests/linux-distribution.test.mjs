import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  linuxBuildArguments,
  linuxPrereleaseRpm,
  packageLinuxPrereleaseRpm,
} from '../linux-distribution.mjs';
import { installerKind } from '../release-assets.mjs';

async function temporary(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'maa-verge-linux-distribution-'));
  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('RPM preview metadata uses the numeric base and a Release below the stable package', () => {
  for (const [version, release] of [
    ['0.1.3-alpha1', '0.alpha1'],
    ['0.1.3-alpha2', '0.alpha2'],
    ['0.1.3-beta.1', '0.beta.1'],
    ['0.1.3-rc.2', '0.rc.2'],
    ['0.1.3-preview-test.1', '0.preview.test.1'],
  ]) {
    const rpm = linuxPrereleaseRpm(version);
    assert.deepEqual(rpm, { version: '0.1.3', release });
    assert.ok(!rpm.version.includes('-') && !rpm.release.includes('-'));
    // RPM compares the first numeric Release segment before later segments.
    assert.ok(Number(rpm.release.split('.')[0]) < 1);
  }
  assert.equal(linuxPrereleaseRpm('0.1.3'), undefined);
  for (const version of ['0.1.3-alpha.01', '0.1.3+build', 'invalid', '../0.1.3'])
    assert.throws(() => linuxPrereleaseRpm(version));
});

test('only Linux prereleases split RPM out of the original application build', () => {
  assert.deepEqual(linuxBuildArguments('0.1.3-alpha1', 'linux'), ['--bundles', 'deb,appimage']);
  for (const [version, platform] of [
    ['0.1.3', 'linux'],
    ['0.1.3-alpha1', 'win32'],
    ['0.1.3-alpha1', 'darwin'],
  ])
    assert.deepEqual(linuxBuildArguments(version, platform), []);
});

test('RPM repackaging retains source and executable versions, published names and private-key secrecy', async () =>
  temporary(async (directory) => {
    const version = '0.1.3-alpha1';
    const source = path.join(directory, 'src-tauri', 'tauri.conf.json');
    const executable = path.join(directory, 'src-tauri', 'target', 'release', 'maaverge');
    const output = path.join(path.dirname(executable), 'bundle', 'rpm');
    await mkdir(output, { recursive: true });
    await writeFile(source, JSON.stringify({ version }));
    await writeFile(executable, `synthetic executable version ${version}`);
    const originalSource = await readFile(source);
    const originalExecutable = await readFile(executable);
    const bytes = Buffer.from('synthetic RPM payload');
    await writeFile(path.join(output, 'Maa Verge-0.1.3-0.alpha1.x86_64.rpm'), bytes);
    const calls = [];
    const published = await packageLinuxPrereleaseRpm({
      version,
      productName: 'Maa Verge',
      directory,
      platform: 'linux',
      arch: 'x64',
      env: {
        TAURI_SIGNING_PRIVATE_KEY: 'private-key-must-remain-in-environment',
        TAURI_SIGNING_PRIVATE_KEY_PASSWORD: 'password-must-remain-in-environment',
      },
      runner: async (command, args, options) => {
        calls.push({ command, args, options });
        if (args[2] === 'signer') {
          assert.equal(args.at(-1), path.join(output, 'Maa Verge-0.1.3-alpha1-1.x86_64.rpm'));
          assert.deepEqual(await readFile(args.at(-1)), bytes);
        }
      },
    });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], {
      command: 'pnpm',
      args: [
        'exec',
        'tauri',
        'bundle',
        '--bundles',
        'rpm',
        '--config',
        JSON.stringify({
          version: '0.1.3',
          bundle: { createUpdaterArtifacts: false, linux: { rpm: { release: '0.alpha1' } } },
        }),
      ],
      options: { cwd: directory },
    });
    assert.deepEqual(calls[1], {
      command: 'pnpm',
      args: ['exec', 'tauri', 'signer', 'sign', '--app-version', version, published],
      options: { cwd: directory },
    });
    assert.ok(!JSON.stringify(calls).includes('must-remain-in-environment'));
    assert.deepEqual(await readdir(output), ['Maa Verge-0.1.3-alpha1-1.x86_64.rpm']);
    assert.equal(
      installerKind(path.basename(published).replaceAll(' ', '-'), version),
      'linux-rpm-x64',
    );
    assert.deepEqual(await readFile(source), originalSource);
    assert.deepEqual(await readFile(executable), originalExecutable);
  }));

test('unsigned previews omit signing and stable or other-platform packaging invokes no commands', async () =>
  temporary(async (directory) => {
    const output = path.join(directory, 'src-tauri', 'target', 'release', 'bundle', 'rpm');
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, 'Maa Verge-0.1.3-0.alpha1.aarch64.rpm'), 'synthetic RPM');
    const previous = path.join(output, 'Maa Verge-0.1.3-alpha1-1.aarch64.rpm');
    await writeFile(previous, 'previous RPM');
    await writeFile(`${previous}.sig`, 'previous signature');
    const calls = [];
    const options = {
      version: '0.1.3-alpha1',
      productName: 'Maa Verge',
      directory,
      platform: 'linux',
      arch: 'arm64',
      env: {},
      runner: async (...args) => calls.push(args),
    };
    const published = await packageLinuxPrereleaseRpm(options);
    assert.equal(path.basename(published), 'Maa Verge-0.1.3-alpha1-1.aarch64.rpm');
    assert.equal(await readFile(published, 'utf8'), 'synthetic RPM');
    assert.deepEqual(await readdir(output), ['Maa Verge-0.1.3-alpha1-1.aarch64.rpm']);
    assert.equal(calls.length, 1);
    calls.length = 0;
    await packageLinuxPrereleaseRpm({ ...options, version: '0.1.3' });
    await packageLinuxPrereleaseRpm({ ...options, platform: 'win32' });
    await packageLinuxPrereleaseRpm({ ...options, platform: 'darwin' });
    assert.deepEqual(calls, []);
  }));

test('a failed RPM bundle never renames or signs an older generated artifact', async () =>
  temporary(async (directory) => {
    const output = path.join(directory, 'src-tauri', 'target', 'release', 'bundle', 'rpm');
    await mkdir(output, { recursive: true });
    const name = 'Maa Verge-0.1.3-0.alpha1.x86_64.rpm';
    await writeFile(path.join(output, name), 'older generated RPM');
    let calls = 0;
    await assert.rejects(
      packageLinuxPrereleaseRpm({
        version: '0.1.3-alpha1',
        productName: 'Maa Verge',
        directory,
        platform: 'linux',
        arch: 'x64',
        env: { TAURI_SIGNING_PRIVATE_KEY: 'synthetic-key' },
        runner: async () => {
          calls++;
          throw new Error('synthetic bundler failure');
        },
      }),
      /synthetic bundler failure/,
    );
    assert.equal(calls, 1);
    assert.deepEqual(await readdir(output), [name]);
  }));
