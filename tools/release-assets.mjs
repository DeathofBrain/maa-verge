/** Pure validation for published installers, signed updater assets and checksums. */
const checksumName = 'SHA256SUMS.txt';
const checksumLimit = 16 * 1024;

export function releaseVersion(tag) {
  if (
    typeof tag !== 'string' ||
    tag !== tag.trim() ||
    tag.length > 128 ||
    !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
      tag,
    ) ||
    tag
      .slice(1)
      .split('-')
      .slice(1)
      .join('-')
      .split('.')
      .some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))
  ) {
    throw new Error(
      'Release tag must be a vMAJOR.MINOR.PATCH tag with an optional valid prerelease suffix.',
    );
  }
  return tag.slice(1);
}

export function installerKind(name, version) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9._-]+$/.test(name)) return undefined;
  const prefix = new RegExp(
    `^maa[-_]verge[_-]${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    'i',
  );
  if (!prefix.test(name)) return undefined;
  const suffix = name.replace(prefix, '');
  if (/^[_-]x64(?:[_-]setup)?\.exe$/i.test(suffix)) return 'windows-exe-x64';
  if (/^[_-]x64(?:[_-][a-z]{2}(?:-[a-z0-9]+)*)?\.msi$/i.test(suffix)) return 'windows-msi-x64';
  if (/^_x64-full\.zip$/i.test(suffix)) return 'windows-full-zip-x64';
  if (/^[_-](?:aarch64|arm64)\.dmg$/i.test(suffix)) return 'macos-dmg-arm64';
  if (/^[_-](?:x64|x86_64)\.dmg$/i.test(suffix)) return 'macos-dmg-x64';
  if (/^[_-](?:amd64|x86_64|x64)\.appimage$/i.test(suffix)) return 'linux-appimage-x64';
  if (/^[_-]amd64\.deb$/i.test(suffix)) return 'linux-deb-x64';
  if (/^-[1-9]\d*\.x86_64\.rpm$/i.test(suffix)) return 'linux-rpm-x64';
  return undefined;
}

// Updater files are an optional, complete extension of the original eight-file
// release. Ordinary installers remain available to package-manager users.
export function updaterAssetKind(name, version) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9._-]+$/.test(name)) return undefined;
  if (name === 'latest.json') return 'manifest';
  if (name.endsWith('.sig')) {
    const base = name.slice(0, -4),
      installer = installerKind(base, version);
    if (installer && !installer.startsWith('macos-') && installer !== 'windows-full-zip-x64')
      return `${installer}-signature`;
    const archive = updaterAssetKind(base, version);
    if (archive?.startsWith('macos-archive-')) return `${archive}-signature`;
    return undefined;
  }
  if (name === `Maa-Verge_${version}_aarch64.app.tar.gz`) return 'macos-archive-arm64';
  if (name === `Maa-Verge_${version}_x64.app.tar.gz`) return 'macos-archive-x64';
}

export const updaterAssetKinds = [
  'manifest',
  'windows-exe-x64-signature',
  'linux-appimage-x64-signature',
  'linux-deb-x64-signature',
  'linux-rpm-x64-signature',
  'macos-archive-arm64',
  'macos-archive-x64',
  'macos-archive-arm64-signature',
  'macos-archive-x64-signature',
];
// Historical releases retain MSI and its signature. A current release replaces
// that download with a complete Windows ZIP covered only by SHA256SUMS.txt.
export const legacyUpdaterAssetKinds = [...updaterAssetKinds, 'windows-msi-x64-signature'];
const commonInstallerKinds = [
  'windows-exe-x64',
  'macos-dmg-arm64',
  'macos-dmg-x64',
  'linux-appimage-x64',
  'linux-deb-x64',
  'linux-rpm-x64',
];

export function validateRelease(release, tag) {
  const version = releaseVersion(tag);
  if (release?.tag_name !== tag || release.draft !== false || !release.published_at) {
    throw new Error('The requested release must already be published with the exact tag.');
  }
  if (
    !Array.isArray(release.assets) ||
    ![8, 8 + updaterAssetKinds.length, 8 + legacyUpdaterAssetKinds.length].includes(
      release.assets.length,
    )
  ) {
    throw new Error(
      'Release must contain seven downloads, SHA256SUMS.txt and optionally the complete signed updater asset set.',
    );
  }
  const kinds = new Set();
  const updaterKinds = new Set();
  const names = new Set();
  for (const asset of release.assets) {
    if (
      !asset ||
      !Number.isSafeInteger(asset.id) ||
      asset.id <= 0 ||
      asset.state !== 'uploaded' ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0
    ) {
      throw new Error('Every release asset must be a completed, nonempty upload.');
    }
    if (typeof asset.name !== 'string' || names.has(asset.name.toLowerCase()))
      throw new Error('Release contains duplicate asset names.');
    names.add(asset.name.toLowerCase());
    if (asset.name === checksumName) {
      if (asset.size > checksumLimit) throw new Error('Checksum manifest is too large.');
      continue;
    }
    const kind = installerKind(asset.name, version),
      updaterKind = updaterAssetKind(asset.name, version);
    if (kind) {
      if (kinds.has(kind)) throw new Error(`Unexpected or duplicate installer kind: ${asset.name}`);
      kinds.add(kind);
    } else if (updaterKind) {
      if (updaterKinds.has(updaterKind))
        throw new Error(`Duplicate updater asset kind: ${asset.name}`);
      updaterKinds.add(updaterKind);
    } else throw new Error(`Unexpected release asset: ${asset.name}`);
  }
  const legacy = kinds.has('windows-msi-x64');
  const requiredInstallers = [
    ...commonInstallerKinds,
    legacy ? 'windows-msi-x64' : 'windows-full-zip-x64',
  ];
  const requiredUpdater = legacy ? legacyUpdaterAssetKinds : updaterAssetKinds;
  if (
    !names.has(checksumName.toLowerCase()) ||
    !release.assets.some((asset) => asset.name === checksumName) ||
    kinds.size !== requiredInstallers.length ||
    requiredInstallers.some((kind) => !kinds.has(kind))
  ) {
    throw new Error(
      'Release must contain one complete Windows EXE/MSI or EXE/full-ZIP download set, all other platform downloads and SHA256SUMS.txt.',
    );
  }
  if (
    updaterKinds.size &&
    (updaterKinds.size !== requiredUpdater.length ||
      requiredUpdater.some((kind) => !updaterKinds.has(kind)))
  )
    throw new Error('Release has an incomplete or mixed signed updater asset set.');
  return release.assets;
}

export function parseChecksums(text, installers) {
  if (Buffer.byteLength(text) > checksumLimit) throw new Error('Checksum manifest is too large.');
  const expectedNames = new Set(installers.map((asset) => asset.name));
  const sums = new Map();
  const lines = text.replaceAll('\r\n', '\n').replace(/\n$/, '').split('\n');
  for (const line of lines) {
    const match = /^([a-fA-F0-9]{64}) [ *]([A-Za-z0-9._-]+)$/.exec(line);
    if (!match || !expectedNames.has(match[2]) || sums.has(match[2]))
      throw new Error(
        'Checksum manifest must list each installer exactly once using safe filenames.',
      );
    sums.set(match[2], match[1].toLowerCase());
  }
  if (sums.size !== expectedNames.size) throw new Error('Checksum manifest is missing installers.');
  return sums;
}
