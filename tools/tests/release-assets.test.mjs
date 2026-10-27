import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  installerKind,
  parseChecksums,
  releaseVersion,
  updaterAssetKind,
  updaterAssetKinds,
  legacyUpdaterAssetKinds,
  validateRelease,
} from '../release-assets.mjs';

const names = [
  'Maa-Verge_0.1.0_x64-setup.exe',
  'Maa-Verge_0.1.0_x64_zh-CN.msi',
  'Maa-Verge_0.1.0_aarch64.dmg',
  'Maa-Verge_0.1.0_x64.dmg',
  'Maa-Verge_0.1.0_amd64.AppImage',
  'maa-verge_0.1.0_amd64.deb',
  'maa-verge-0.1.0-1.x86_64.rpm',
];
const installers = names.map((name, index) => ({
  name,
  id: index + 1,
  size: 4,
  state: 'uploaded',
}));
const release = {
  tag_name: 'v0.1.0',
  draft: false,
  published_at: '2026-10-23T00:00:00Z',
  assets: [...installers, { name: 'SHA256SUMS.txt', id: 8, size: 750, state: 'uploaded' }],
};
const digest = createHash('sha256').update('test').digest('hex');
const manifest = names.map((name) => `${digest}  ${name}`).join('\n') + '\n';

test('release tags accept stable and prerelease versions without refs, paths or output injection', () => {
  assert.equal(releaseVersion('v0.1.0'), '0.1.0');
  assert.equal(releaseVersion('v12.34.56'), '12.34.56');
  assert.equal(releaseVersion('v0.2.0-rc.1'), '0.2.0-rc.1');
  for (const tag of [
    undefined,
    '0.1.0',
    'v01.1.0',
    'v0.1.0/latest',
    'v0.1.0\nimage=evil',
    'v0.1.0\n',
    'v0.1.0;echo hello',
    'v0.1.0+build',
    'v0.1.0-rc.01',
    'v0.1.0-01',
    'v0.1.0-',
    'v0.1.0-a..b',
  ]) {
    assert.throws(() => releaseVersion(tag), /Release tag/);
  }
});

const updaterNames = [
  'latest.json',
  ...names.filter((name) => !name.endsWith('.dmg')).map((name) => `${name}.sig`),
  'Maa-Verge_0.1.0_aarch64.app.tar.gz',
  'Maa-Verge_0.1.0_x64.app.tar.gz',
  'Maa-Verge_0.1.0_aarch64.app.tar.gz.sig',
  'Maa-Verge_0.1.0_x64.app.tar.gz.sig',
];
const extendedAssets = [
  ...release.assets,
  ...updaterNames.map((name, index) => ({ name, id: index + 9, size: 4, state: 'uploaded' })),
];

test('signed updater releases retain seven installers and require the complete recognized updater extension', () => {
  assert.equal(validateRelease({ ...release, assets: extendedAssets }, 'v0.1.0').length, 18);
  assert.equal(new Set(updaterNames.map((name) => updaterAssetKind(name, '0.1.0'))).size, 10);
  for (const name of [
    'preview.json',
    'Maa-Verge_0.1.0_aarch64.dmg.sig',
    'Maa-Verge_0.1.1_x64.app.tar.gz',
    'Maa Verge.app.tar.gz',
    '../latest.json',
  ])
    assert.equal(updaterAssetKind(name, '0.1.0'), undefined);
  for (const assets of [
    extendedAssets.slice(1),
    [...release.assets, extendedAssets[8]],
    extendedAssets.map((asset) =>
      asset.name === 'latest.json' ? { ...asset, name: 'unknown.json' } : asset,
    ),
    extendedAssets.map((asset) =>
      asset.name.endsWith('_x64.app.tar.gz.sig')
        ? { ...asset, name: 'Maa-Verge_0.1.0_aarch64.app.tar.gz.sig' }
        : asset,
    ),
  ]) {
    assert.throws(() => validateRelease({ ...release, assets }, 'v0.1.0'));
  }
  assert.equal(
    installerKind('Maa-Verge_0.2.0-rc.1_x64-setup.exe', '0.2.0-rc.1'),
    'windows-exe-x64',
  );
});

test('published release accepts one installer for each supported OS, format and architecture', () => {
  assert.equal(validateRelease(release, 'v0.1.0').length, 8);
  assert.equal(new Set(names.map((name) => installerKind(name, '0.1.0'))).size, 7);
  assert.equal(installerKind('Maa-Verge_0.1.0_x64_en-US.msi', '0.1.0'), 'windows-msi-x64');
});

test('drafts, different versions, incomplete uploads and missing or extra assets are rejected', () => {
  for (const patch of [
    { draft: true },
    { published_at: null },
    { tag_name: 'v0.2.0' },
    { assets: release.assets.slice(1) },
    { assets: [...release.assets, installers[0]] },
  ]) {
    assert.throws(() => validateRelease({ ...release, ...patch }, 'v0.1.0'));
  }
  for (const patch of [{ state: 'new' }, { size: 0 }, { id: 0 }]) {
    assert.throws(() =>
      validateRelease(
        { ...release, assets: [{ ...installers[0], ...patch }, ...release.assets.slice(1)] },
        'v0.1.0',
      ),
    );
  }
});

test('release installer set rejects duplicate architectures, wrong versions and unsafe filenames', () => {
  for (const name of [
    names[1],
    'Maa-Verge_0.1.0_arm64-setup.exe',
    'Maa-Verge_0.2.0_x64-setup.exe',
    '../Maa-Verge_0.1.0_x64-setup.exe',
    'Maa Verge_0.1.0_x64-setup.exe',
  ]) {
    assert.throws(() =>
      validateRelease(
        { ...release, assets: [{ ...installers[0], name }, ...release.assets.slice(1)] },
        'v0.1.0',
      ),
    );
  }
  assert.throws(() =>
    validateRelease(
      { ...release, assets: [...installers, { ...release.assets[7], name: 'sha256sums.txt' }] },
      'v0.1.0',
    ),
  );
});

test('checksum manifest accepts GNU text or binary markers and Windows line endings', () => {
  assert.equal(parseChecksums(manifest, installers).size, 7);
  assert.equal(
    parseChecksums(manifest.replaceAll('  ', ' *').replaceAll('\n', '\r\n'), installers).get(
      names[0],
    ),
    digest,
  );
});

test('checksum manifest rejects omissions, duplicates, unknown paths and malformed digests', () => {
  for (const text of [
    manifest.split('\n').slice(1).join('\n'),
    manifest + `${digest}  ${names[0]}\n`,
    manifest.replace(names[0], `../${names[0]}`),
    manifest.replace(names[0], 'unrelated.exe'),
    manifest.replace(digest, 'a'.repeat(63)),
    manifest + '\n',
    'x'.repeat(16385),
  ]) {
    assert.throws(() => parseChecksums(text, installers));
  }
});

test('signed release checksums cover every installer, archive, signature and updater manifest', () => {
  const assets = validateRelease({ ...release, assets: extendedAssets }, 'v0.1.0');
  const downloads = assets.filter((asset) => asset.name !== 'SHA256SUMS.txt');
  const signedManifest =
    downloads.map((asset) => `${digest.toUpperCase()} *${asset.name}`).join('\r\n') + '\r\n';
  const sums = parseChecksums(signedManifest, downloads);
  assert.equal(sums.size, 17);
  assert.deepEqual(
    new Set(
      downloads
        .filter((asset) => updaterAssetKind(asset.name, '0.1.0'))
        .map((asset) => updaterAssetKind(asset.name, '0.1.0')),
    ),
    new Set(legacyUpdaterAssetKinds),
  );
  for (const asset of downloads) assert.equal(sums.get(asset.name), digest);
  assert.throws(() => parseChecksums(manifest, downloads), /missing installers/);
  assert.throws(
    () =>
      parseChecksums(
        signedManifest.replace(`${digest.toUpperCase()} *latest.json\r\n`, ''),
        downloads,
      ),
    /missing installers/,
  );
});

test('current EXE/full-ZIP releases require one complete profile and never mix MSI assets or signatures', () => {
  const currentVersion = '0.1.3-alpha1';
  const currentTag = `v${currentVersion}`;
  const currentNames = names.map((name) =>
    name.replace('0.1.0', currentVersion).replace('_x64_zh-CN.msi', '_x64-full.zip'),
  );
  const currentUpdater = updaterNames
    .filter((name) => !name.endsWith('.msi.sig'))
    .map((name) => name.replace('0.1.0', currentVersion));
  const assets = [...currentNames, 'SHA256SUMS.txt', ...currentUpdater].map((name, index) => ({
    name,
    id: index + 1,
    size: 4,
    state: 'uploaded',
  }));
  const current = { ...release, tag_name: currentTag, prerelease: true, assets };
  assert.equal(assets.length, 17);
  assert.equal(validateRelease(current, currentTag).length, 17);
  assert.equal(validateRelease({ ...current, assets: assets.slice(0, 8) }, currentTag).length, 8);
  assert.equal(
    installerKind(`Maa-Verge_${currentVersion}_x64-full.zip`, currentVersion),
    'windows-full-zip-x64',
  );
  assert.equal(
    updaterAssetKind(`Maa-Verge_${currentVersion}_x64-full.zip.sig`, currentVersion),
    undefined,
  );
  assert.deepEqual(
    new Set(currentUpdater.map((name) => updaterAssetKind(name, currentVersion))),
    new Set(updaterAssetKinds),
  );
  const downloads = assets.filter((asset) => asset.name !== 'SHA256SUMS.txt');
  assert.equal(
    parseChecksums(downloads.map((asset) => `${digest}  ${asset.name}\n`).join(''), downloads).size,
    16,
  );
  for (const changed of [
    assets.filter((asset) => !asset.name.endsWith('_x64-full.zip')),
    assets.filter((asset) => !asset.name.endsWith('.exe.sig')),
    [
      ...assets,
      {
        name: `Maa-Verge_${currentVersion}_x64_zh-CN.msi.sig`,
        id: 100,
        size: 4,
        state: 'uploaded',
      },
    ],
    [
      ...assets,
      { name: `Maa-Verge_${currentVersion}_x64_zh-CN.msi`, id: 100, size: 4, state: 'uploaded' },
    ],
    assets.map((asset) =>
      asset.name.endsWith('_x64-full.zip')
        ? { ...asset, name: `Maa-Verge_${currentVersion}_x64_zh-CN.msi` }
        : asset,
    ),
    assets.map((asset) =>
      asset.name.endsWith('.exe.sig')
        ? { ...asset, name: `Maa-Verge_${currentVersion}_x64_zh-CN.msi.sig` }
        : asset,
    ),
    [
      ...assets,
      { name: `Maa-Verge_${currentVersion}_x64-full.zip.sig`, id: 100, size: 4, state: 'uploaded' },
    ],
  ])
    assert.throws(() => validateRelease({ ...current, assets: changed }, currentTag));
});

test('release uploads reject unsafe numeric identities and sizes while accepting the checksum size limit', () => {
  for (const patch of [
    { id: -1 },
    { id: 1.5 },
    { id: Number.MAX_SAFE_INTEGER + 1 },
    { size: -1 },
    { size: 1.5 },
    { size: Infinity },
    { size: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.throws(
      () =>
        validateRelease(
          { ...release, assets: [{ ...installers[0], ...patch }, ...release.assets.slice(1)] },
          'v0.1.0',
        ),
      /completed, nonempty upload/,
    );
  }
  const withManifestSize = (size) => ({
    ...release,
    assets: release.assets.map((asset) =>
      asset.name === 'SHA256SUMS.txt' ? { ...asset, size } : asset,
    ),
  });
  assert.equal(validateRelease(withManifestSize(16 * 1024), 'v0.1.0').length, 8);
  assert.throws(() => validateRelease(withManifestSize(16 * 1024 + 1), 'v0.1.0'), /too large/);
});
