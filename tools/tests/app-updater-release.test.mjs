import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  collectUpdaterArtifacts,
  createUpdaterManifest,
  releaseConfiguration,
  updaterBuildArguments,
  verifyUpdaterSignature,
} from '../app-updater-release.mjs';
import { parseChecksums, validateRelease } from '../release-assets.mjs';

const version = '0.1.0';
function signingKey() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const keyId = Buffer.from('1234567890abcdef', 'hex');
  const publicBytes = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return {
    privateKey,
    keyId,
    publicKey: Buffer.from(
      `untrusted comment: test public key\n${Buffer.concat([Buffer.from('Ed'), keyId, publicBytes]).toString('base64')}\n`,
    ).toString('base64'),
  };
}
function signature(bytes, name, key, signedVersion = version) {
  const dataSignature = sign(null, createHash('blake2b512').update(bytes).digest(), key.privateKey);
  const trusted = `timestamp:1234567890\tfile:${name}\tversion:${signedVersion}`;
  const global = sign(null, Buffer.concat([dataSignature, Buffer.from(trusted)]), key.privateKey);
  return Buffer.from(
    `untrusted comment: signature from tauri secret key\n${Buffer.concat([Buffer.from('ED'), key.keyId, dataSignature]).toString('base64')}\ntrusted comment: ${trusted}\n${global.toString('base64')}\n`,
  ).toString('base64');
}
async function artifact(directory, name, key, signed = true, signedVersion = version) {
  await mkdir(directory, { recursive: true });
  const filename = path.join(directory, name),
    bytes = Buffer.from(`synthetic:${name}`);
  await writeFile(filename, bytes);
  if (signed) await writeFile(`${filename}.sig`, signature(bytes, name, key, signedVersion));
  return filename;
}
async function fullSet(directory, key, appVersion = version) {
  for (const name of [
    'Maa-Verge_0.1.0_x64-setup.exe',
    'Maa-Verge_0.1.0_amd64.AppImage',
    'Maa-Verge_0.1.0_amd64.deb',
    'Maa-Verge-0.1.0-1.x86_64.rpm',
    'Maa-Verge_0.1.0_aarch64.app.tar.gz',
    'Maa-Verge_0.1.0_x64.app.tar.gz',
  ])
    await artifact(directory, name.replaceAll(version, appVersion), key, true, appVersion);
  await artifact(directory, `Maa-Verge_${appVersion}_x64-full.zip`, key, false);
  await artifact(directory, `Maa-Verge_${appVersion}_aarch64.dmg`, key, false);
  await artifact(directory, `Maa-Verge_${appVersion}_x64.dmg`, key, false);
}
async function temporary(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'maa-verge-updater-release-'));
  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('version preflight requires root, both workspaces, Tauri, Cargo and tag to agree', async () => {
  const project = fileURLToPath(new URL('../../', import.meta.url));
  const actualVersion = JSON.parse(
    await readFile(path.join(project, 'package.json'), 'utf8'),
  ).version;
  assert.equal((await releaseConfiguration(project, `v${actualVersion}`)).version, actualVersion);
  await assert.rejects(
    releaseConfiguration(
      project,
      `v${actualVersion === '9999999.0.0' ? '9999999.0.1' : '9999999.0.0'}`,
    ),
    /标签/,
  );
  await temporary(async (directory) => {
    for (const [name, value] of [
      ['package.json', { version }],
      ['apps/desktop/package.json', { version }],
      ['services/backend/package.json', { version }],
      ['apps/desktop/src-tauri/tauri.conf.json', { version }],
    ]) {
      await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
      await writeFile(path.join(directory, name), JSON.stringify(value));
    }
    const cargo = path.join(directory, 'apps/desktop/src-tauri/Cargo.toml');
    await writeFile(
      cargo,
      '[package]\nname = "test"\nversion = "0.1.0"\n\n[dependencies]\nversion = "wrong"\n',
    );
    assert.equal((await releaseConfiguration(directory)).version, version);
    await writeFile(cargo, '[package]\nversion = "0.0.9"\n');
    await assert.rejects(releaseConfiguration(directory), /版本必须完全一致/);
  });
});

test('build enables updater artifacts only when a private signing key is provided and never exposes that key', () => {
  assert.deepEqual(JSON.parse(updaterBuildArguments({})[1]), {
    bundle: { createUpdaterArtifacts: false },
  });
  const args = updaterBuildArguments({ TAURI_SIGNING_PRIVATE_KEY: 'private-do-not-expose' });
  assert.equal(JSON.parse(args[1]).bundle.createUpdaterArtifacts, true);
  assert.ok(!args.join(' ').includes('private-do-not-expose'));
});

test('minisign verification validates artifact bytes, key, global comment and signed app version', async () =>
  temporary(async (directory) => {
    const key = signingKey(),
      file = await artifact(directory, 'test.exe', key);
    const sig = await readFile(`${file}.sig`, 'utf8');
    assert.equal(await verifyUpdaterSignature(file, sig, key.publicKey, version), sig);
    await assert.rejects(
      verifyUpdaterSignature(file, sig, signingKey().publicKey, version),
      /校验失败/,
    );
    await assert.rejects(verifyUpdaterSignature(file, sig, key.publicKey, '0.2.0'), /绑定/);
    const tampered = Buffer.from(sig, 'base64')
      .toString()
      .replace('timestamp:1234567890', 'timestamp:1234567891');
    await assert.rejects(
      verifyUpdaterSignature(
        file,
        Buffer.from(tampered).toString('base64'),
        key.publicKey,
        version,
      ),
      /注释校验失败/,
    );
    await writeFile(file, 'modified');
    await assert.rejects(
      verifyUpdaterSignature(file, sig, key.publicKey, version),
      /更新包签名校验失败/,
    );
    for (const malformed of [
      'not-base64',
      'test',
      sig + '\nsecret',
      Buffer.from('untrusted comment: incomplete').toString('base64'),
    ])
      await assert.rejects(verifyUpdaterSignature(file, malformed, key.publicKey, version));
  }));

test('macOS collection renames the same Tauri archive basename by architecture without invalidating its signature', async () =>
  temporary(async (directory) => {
    const key = signingKey();
    for (const [target, arch] of [
      ['darwin-aarch64', 'aarch64'],
      ['darwin-x86_64', 'x64'],
    ]) {
      const input = path.join(directory, target, 'input'),
        output = path.join(directory, 'output', target);
      await artifact(path.join(input, 'dmg'), `Maa-Verge_0.1.0_${arch}.dmg`, key, false);
      await artifact(path.join(input, 'macos'), 'Maa Verge.app.tar.gz', key);
      const names = await collectUpdaterArtifacts({
        input,
        output,
        target,
        version,
        publicKey: key.publicKey,
      });
      assert.equal(names.length, 3);
      const renamed = path.join(output, `Maa-Verge_0.1.0_${arch}.app.tar.gz`);
      await verifyUpdaterSignature(
        renamed,
        await readFile(`${renamed}.sig`, 'utf8'),
        key.publicKey,
        version,
      );
      await assert.rejects(
        collectUpdaterArtifacts({ input, output, target, version, publicKey: key.publicKey }),
        /EEXIST/,
      );
    }
  }));

test('real Tauri productName filenames normalize across all platforms without changing signed bytes or comments', async () =>
  temporary(async (directory) => {
    const key = signingKey(),
      combined = path.join(directory, 'combined');
    await mkdir(combined);
    const platforms = [
      [
        'windows-x86_64',
        [
          ['nsis', 'Maa Verge_0.1.0_x64-setup.exe', 'Maa-Verge_0.1.0_x64-setup.exe', true],
          ['zip', 'Maa Verge_0.1.0_x64-full.zip', 'Maa-Verge_0.1.0_x64-full.zip', false],
        ],
      ],
      [
        'darwin-aarch64',
        [
          ['dmg', 'Maa Verge_0.1.0_aarch64.dmg', 'Maa-Verge_0.1.0_aarch64.dmg', false],
          ['macos', 'Maa Verge.app.tar.gz', 'Maa-Verge_0.1.0_aarch64.app.tar.gz', true],
        ],
      ],
      [
        'darwin-x86_64',
        [
          ['dmg', 'Maa Verge_0.1.0_x64.dmg', 'Maa-Verge_0.1.0_x64.dmg', false],
          ['macos', 'Maa Verge.app.tar.gz', 'Maa-Verge_0.1.0_x64.app.tar.gz', true],
        ],
      ],
      [
        'linux-x86_64',
        [
          ['appimage', 'Maa Verge_0.1.0_amd64.AppImage', 'Maa-Verge_0.1.0_amd64.AppImage', true],
          ['deb', 'Maa Verge_0.1.0_amd64.deb', 'Maa-Verge_0.1.0_amd64.deb', true],
          ['rpm', 'Maa Verge-0.1.0-1.x86_64.rpm', 'Maa-Verge-0.1.0-1.x86_64.rpm', true],
        ],
      ],
    ];
    for (const [target, originals] of platforms) {
      const input = path.join(directory, target, 'input'),
        output = path.join(directory, target, 'output');
      for (const [format, original, , signed] of originals)
        await artifact(path.join(input, format), original, key, signed);
      const names = await collectUpdaterArtifacts({
        input,
        output,
        target,
        version,
        productName: 'Maa Verge',
        publicKey: key.publicKey,
      });
      assert.deepEqual(
        names,
        originals
          .flatMap(([, , canonical, signed]) =>
            signed ? [canonical, `${canonical}.sig`] : [canonical],
          )
          .sort(),
      );
      for (const [format, original, canonical, signed] of originals) {
        const originalFile = path.join(input, format, original),
          collected = path.join(output, canonical);
        assert.deepEqual(await readFile(collected), await readFile(originalFile));
        if (signed) {
          const sig = await readFile(`${collected}.sig`, 'utf8');
          assert.equal(sig, await readFile(`${originalFile}.sig`, 'utf8'));
          assert.ok(
            Buffer.from(sig, 'base64')
              .toString()
              .includes(`\tfile:${original}\tversion:${version}`),
          );
          await verifyUpdaterSignature(collected, sig, key.publicKey, version);
        }
      }
      for (const name of names)
        await writeFile(path.join(combined, name), await readFile(path.join(output, name)), {
          flag: 'wx',
        });
    }
    const manifest = await createUpdaterManifest({
      input: combined,
      tag: 'v0.1.0',
      publicKey: key.publicKey,
    });
    assert.equal((await readdir(combined)).length, 17);
    for (const platform of Object.values(manifest.platforms))
      assert.ok(!platform.url.includes('%20'));
    assert.equal(manifest.platforms['windows-x86_64-msi'], undefined);
    assert.ok((await readdir(combined)).includes('Maa-Verge_0.1.0_x64-full.zip'));
  }));

test('collection rejects raw plus normalized duplicates and matches the configured productName literally', async () =>
  temporary(async (directory) => {
    const key = signingKey(),
      input = path.join(directory, 'input');
    await artifact(input, 'Maa Verge_0.1.0_x64-setup.exe', key);
    await artifact(input, 'Maa Verge_0.1.0_x64-full.zip', key, false);
    await artifact(input, 'Maa-Verge_0.1.0_x64-setup.exe', key);
    const options = {
      input,
      output: path.join(directory, 'output'),
      target: 'windows-x86_64',
      version,
      publicKey: key.publicKey,
    };
    await assert.rejects(collectUpdaterArtifacts(options), /唯一/);
    assert.ok(!(await readdir(directory)).includes('output'));
    const mac = path.join(directory, 'mac');
    await artifact(mac, 'Maa Verge_0.1.0_aarch64.dmg', key, false);
    await artifact(mac, 'Maa Verge.app.tar.gz', key);
    await artifact(mac, 'Maa-Verge.app.tar.gz', key);
    await assert.rejects(
      collectUpdaterArtifacts({ ...options, input: mac, target: 'darwin-aarch64' }),
      /唯一/,
    );
    for (const [index, fake] of [
      'Maa Verge Extra',
      'Maa_Verge',
      'maa-verge',
      'MaaXVerge+Test',
    ].entries()) {
      const wrong = path.join(directory, `wrong-${index}`);
      await artifact(wrong, `${fake}_0.1.0_x64-setup.exe`, key);
      await artifact(wrong, 'Maa.Verge+Test_0.1.0_x64-full.zip', key, false);
      await assert.rejects(
        collectUpdaterArtifacts({ ...options, input: wrong, productName: 'Maa.Verge+Test' }),
        /唯一/,
      );
    }
    const custom = path.join(directory, 'custom');
    await artifact(custom, 'Maa.Verge+Test_0.1.0_x64-setup.exe', key);
    await artifact(custom, 'Maa.Verge+Test_0.1.0_x64-full.zip', key, false);
    assert.equal(
      (await collectUpdaterArtifacts({ ...options, input: custom, productName: 'Maa.Verge+Test' }))
        .length,
      3,
    );
    for (const productName of ['../Maa Verge', 'Maa Verge\\other', 'Maa Verge\n', '', ' Maa Verge'])
      await assert.rejects(collectUpdaterArtifacts({ ...options, productName }), /产品名称/);
  }));

test('collection refuses duplicate installers, missing signatures and altered downloads', async () =>
  temporary(async (directory) => {
    const key = signingKey(),
      input = path.join(directory, 'input');
    const file = await artifact(input, 'Maa-Verge_0.1.0_x64-setup.exe', key);
    await artifact(input, 'Maa-Verge_0.1.0_x64-full.zip', key, false);
    const options = {
      input,
      output: path.join(directory, 'output'),
      target: 'windows-x86_64',
      version,
      publicKey: key.publicKey,
    };
    await rm(`${file}.sig`);
    await assert.rejects(collectUpdaterArtifacts(options), /ENOENT/);
    await writeFile(`${file}.sig`, signature(await readFile(file), path.basename(file), key));
    await artifact(path.join(input, 'duplicate'), path.basename(file), key);
    await assert.rejects(collectUpdaterArtifacts(options), /唯一/);
    await rm(path.join(input, 'duplicate'), { recursive: true });
    await writeFile(file, 'changed');
    await assert.rejects(collectUpdaterArtifacts(options), /签名校验失败/);
    await assert.rejects(collectUpdaterArtifacts({ ...options, target: 'unknown' }), /未知/);
  }));

test('manifest keeps installer type, exact version URLs and signed version; all assets enter checksums', async () =>
  temporary(async (directory) => {
    const key = signingKey();
    await fullSet(directory, key);
    const manifest = await createUpdaterManifest({
      input: directory,
      tag: 'v0.1.0',
      publicKey: key.publicKey,
      notes: '中'.repeat(20_000),
      publishedAt: '2026-10-23T09:10:59Z',
    });
    assert.equal(manifest.version, version);
    assert.equal(manifest.notes.length, 16 * 1024);
    assert.deepEqual(Object.keys(manifest.platforms), [
      'windows-x86_64-nsis',
      'darwin-aarch64',
      'darwin-x86_64',
      'linux-x86_64',
    ]);
    assert.match(
      manifest.platforms['windows-x86_64-nsis'].url,
      /v0\.1\.0\/Maa-Verge_0\.1\.0_x64-setup\.exe$/,
    );
    assert.equal(manifest.platforms['windows-x86_64-msi'], undefined);
    assert.ok(!Object.values(manifest.platforms).some((platform) => platform.url.endsWith('.zip')));
    assert.match(manifest.platforms['darwin-aarch64'].url, /_aarch64\.app\.tar\.gz$/);
    const assets = await Promise.all(
      (await readdir(directory)).map(async (name, index) => ({
        name,
        id: index + 1,
        size: (await readFile(path.join(directory, name))).length,
        state: 'uploaded',
      })),
    );
    assert.equal(assets.length, 17);
    assert.equal(assets.filter((asset) => asset.name.endsWith('.sig')).length, 6);
    assert.equal(
      validateRelease(
        { tag_name: 'v0.1.0', draft: false, published_at: manifest.pub_date, assets },
        'v0.1.0',
      ).length,
      17,
    );
    const checksums = parseChecksums(
      await readFile(path.join(directory, 'SHA256SUMS.txt'), 'utf8'),
      assets.filter((asset) => asset.name !== 'SHA256SUMS.txt'),
    );
    assert.equal(checksums.size, 16);
    for (const [name, digest] of checksums)
      assert.equal(
        createHash('sha256')
          .update(await readFile(path.join(directory, name)))
          .digest('hex'),
        digest,
      );
    await assert.rejects(
      createUpdaterManifest({ input: directory, tag: 'v0.1.0', publicKey: key.publicKey }),
      /已生成|未知/,
    );
  }));

test('incomplete platform sets, unsigned versions and unexpected files never produce a manifest', async () => {
  for (const replacement of [
    undefined,
    'Maa-Verge_0.1.0_x64_zh-CN.msi',
    'Maa-Verge_0.1.0_x64-full.zip.sig',
  ]) {
    await temporary(async (directory) => {
      const key = signingKey();
      await fullSet(directory, key);
      if (replacement !== 'Maa-Verge_0.1.0_x64-full.zip.sig')
        await rm(path.join(directory, 'Maa-Verge_0.1.0_x64-full.zip'));
      if (replacement) await artifact(directory, replacement, key, false);
      await assert.rejects(
        createUpdaterManifest({ input: directory, tag: 'v0.1.0', publicKey: key.publicKey }),
        /不完整|未知/,
      );
      assert.ok(!(await readdir(directory)).includes('latest.json'));
    });
  }
  await temporary(async (directory) => {
    const key = signingKey();
    await fullSet(directory, key);
    await rm(path.join(directory, 'Maa-Verge_0.1.0_x64.app.tar.gz.sig'));
    await assert.rejects(
      createUpdaterManifest({ input: directory, tag: 'v0.1.0', publicKey: key.publicKey }),
      /不完整/,
    );
    assert.ok(!(await readdir(directory)).includes('latest.json'));
  });
  await temporary(async (directory) => {
    const key = signingKey();
    await fullSet(directory, key);
    const file = path.join(directory, 'Maa-Verge_0.1.0_x64-setup.exe');
    await writeFile(
      `${file}.sig`,
      signature(await readFile(file), path.basename(file), key, '0.0.9'),
    );
    await assert.rejects(
      createUpdaterManifest({ input: directory, tag: 'v0.1.0', publicKey: key.publicKey }),
      /绑定/,
    );
    assert.ok(!(await readdir(directory)).includes('latest.json'));
  });
  await temporary(async (directory) => {
    const key = signingKey();
    await fullSet(directory, key);
    await writeFile(path.join(directory, 'unrelated.exe'), 'unexpected');
    await assert.rejects(
      createUpdaterManifest({ input: directory, tag: 'v0.1.0', publicKey: key.publicKey }),
      /未知/,
    );
  });
});

for (const prerelease of ['0.2.0-beta.1', '0.1.3-alpha1']) {
  test(`prerelease ${prerelease} retains one exact SemVer in artifact names, signed comments, manifest and release asset validation`, async () =>
    temporary(async (directory) => {
      const key = signingKey();
      await fullSet(directory, key, prerelease);
      const manifest = await createUpdaterManifest({
        input: directory,
        tag: `v${prerelease}`,
        publicKey: key.publicKey,
      });
      assert.equal(manifest.version, prerelease);
      for (const platform of Object.values(manifest.platforms)) {
        assert.ok(platform.url.includes(`/v${prerelease}/`));
        assert.ok(platform.url.includes(`_${prerelease}_`));
        assert.ok(
          Buffer.from(platform.signature, 'base64')
            .toString()
            .includes(`\tversion:${prerelease}\n`),
        );
      }
      const assets = await Promise.all(
        (await readdir(directory)).map(async (name, index) => ({
          name,
          id: index + 1,
          size: (await readFile(path.join(directory, name))).length,
          state: 'uploaded',
        })),
      );
      assert.equal(
        validateRelease(
          { tag_name: `v${prerelease}`, draft: false, published_at: manifest.pub_date, assets },
          `v${prerelease}`,
        ).length,
        17,
      );
    }));
}

test('CLI rejects invalid tags before touching build outputs or exposing signing secrets', () => {
  const script = fileURLToPath(new URL('../app-updater-release.mjs', import.meta.url));
  try {
    execFileSync(process.execPath, [script, 'check', '--tag', 'v0.1.0\nunsafe'], {
      env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: 'secret-do-not-log' },
      stdio: 'pipe',
    });
    assert.fail('Invalid tag must fail');
  } catch (error) {
    assert.equal(error.status, 1);
    assert.match(error.stderr.toString(), /Release tag/);
    assert.ok(!error.stderr.toString().includes('secret-do-not-log'));
  }
});
