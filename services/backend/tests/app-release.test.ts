import { expect, test } from 'bun:test';
import backendPackage from '../package.json';
import {
  APP_RELEASES_URL,
  APP_VERSION,
  checkAppRelease,
  compareAppVersions,
} from '@backend/modules/updates/app-release.ts';

const repository = 'https://github.com/DeathofBrain/maa-verge';
const names = (version = '0.1.0') => [
  `Maa-Verge_${version}_x64-setup.exe`,
  `Maa-Verge_${version}_x64_zh-CN.msi`,
  `Maa-Verge_${version}_aarch64.dmg`,
  `Maa-Verge_${version}_x64.dmg`,
  `Maa-Verge_${version}_amd64.AppImage`,
  `Maa-Verge_${version}_amd64.deb`,
  `Maa-Verge-${version}-1.x86_64.rpm`,
];
function release(version = '0.1.0', prerelease = true): any {
  const tag = `v${version}`;
  return {
    tag_name: tag,
    draft: false,
    prerelease,
    html_url: `${repository}/releases/tag/${encodeURIComponent(tag)}`,
    published_at: '2026-10-23T09:10:59Z',
    body: '更新说明',
    assets: [...names(version), 'SHA256SUMS.txt'].map((name) => ({
      name,
      state: 'uploaded',
      size: 123,
      browser_download_url: `${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`,
    })),
  };
}
const source = (entries: any[]) => async () => structuredClone(entries);
const windows = { platform: 'win32', arch: 'x64' };

test('application constants use the project version and official release page', () => {
  expect(APP_VERSION).toBe(backendPackage.version);
  expect(APP_RELEASES_URL).toBe(`${repository}/releases`);
});

test('all seven published installer kinds map to the exact host platform and architecture', async () => {
  const entries = [release()];
  const cases = [
    ['win32', 'x64', ['nsis', 'msi']],
    ['darwin', 'arm64', ['dmg']],
    ['darwin', 'x64', ['dmg']],
    ['linux', 'x64', ['appimage', 'deb', 'rpm']],
  ] as const;
  const matched = new Set<string>();
  for (const [platform, arch, kinds] of cases) {
    const result = await checkAppRelease(source(entries), { platform, arch });
    expect(result.version).toBe('0.1.0');
    expect(result.release.assets.map((asset) => asset.kind)).toEqual([...kinds]);
    expect(result.release.assets.every((asset) => asset.arch === arch)).toBe(true);
    result.release.assets.forEach((asset) => matched.add(asset.name));
  }
  expect(matched.size).toBe(7);
});

test('preview includes the existing GitHub prerelease and stable rejects preview releases', async () => {
  expect((await checkAppRelease(source([release()]), windows)).release.prerelease).toBe(true);
  await expect(
    checkAppRelease(source([release()]), { ...windows, channel: 'stable' }),
  ).rejects.toThrow('正式发布');
  const entries = [release('1.0.0-beta.1', false), release('0.9.0', false), release('0.1.0', true)];
  expect((await checkAppRelease(source(entries), { ...windows, channel: 'stable' })).version).toBe(
    '0.9.0',
  );
  expect((await checkAppRelease(source(entries), windows)).version).toBe('1.0.0-beta.1');
  expect(
    (await checkAppRelease(source([release('0.1.1', false)]), windows)).release.prerelease,
  ).toBe(false);
});

test('release ordering follows SemVer instead of API order, publication time, or string comparison', async () => {
  const entries = [release('0.9.9'), release('0.10.0'), release('0.10.0-beta.2'), release('0.2.0')];
  entries[0].published_at = '2030-01-01T00:00:00Z';
  expect((await checkAppRelease(source(entries), windows)).version).toBe('0.10.0');
  expect((await checkAppRelease(source(entries.reverse()), windows)).version).toBe('0.10.0');
});

test('pagination checks every bounded page before selecting the highest version', async () => {
  const urls: string[] = [];
  const first = Array.from({ length: 100 }, (_, index) => release(`0.0.${index}`));
  const result = await checkAppRelease(async (url) => {
    urls.push(url);
    return urls.length === 1 ? first : [release('2.0.0')];
  }, windows);
  expect(result.version).toBe('2.0.0');
  expect(urls).toEqual(
    [1, 2].map(
      (page) =>
        `https://api.github.com/repos/DeathofBrain/maa-verge/releases?per_page=100&page=${page}`,
    ),
  );
  let calls = 0;
  await expect(
    checkAppRelease(async () => {
      calls++;
      return first;
    }, windows),
  ).rejects.toThrow('分页');
  expect(calls).toBe(10);
});

test('SemVer precedence handles numeric identifiers, release precedence and arbitrary precision', () => {
  const ordered = [
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0',
  ];
  for (let index = 1; index < ordered.length; index++) {
    expect(compareAppVersions(ordered[index - 1], ordered[index])).toBe(-1);
    expect(compareAppVersions(ordered[index], ordered[index - 1])).toBe(1);
  }
  expect(compareAppVersions('v1.2.3+build.01', '1.2.3+other')).toBe(0);
  expect(compareAppVersions('1.9007199254740993.0', '1.9007199254740992.0')).toBe(1);
  expect(compareAppVersions('1.0.0-beta.9007199254740993', '1.0.0-beta.9007199254740992')).toBe(1);
  for (const value of [
    '01.2.3',
    '1.2',
    '1.2.3-beta.01',
    '1.2.3/evil',
    'v1.2.3%2F',
    '1.2.3\n',
    '1.2.3-',
    '1.2.3+',
    '1'.repeat(129),
  ])
    expect(() => compareAppVersions(value, '1.0.0')).toThrow('版本号');
});

test('drafts and malformed tags are never selected', async () => {
  const entries = [
    release('1.0.0'),
    { ...release('99.0.0'), draft: true },
    release('01.0.0'),
    release('3.0.0/evil'),
    { ...release('5.0.0'), draft: undefined },
  ];
  expect((await checkAppRelease(source(entries), windows)).version).toBe('1.0.0');
  await expect(checkAppRelease(source([]), windows)).rejects.toThrow('发布版本');
  await expect(checkAppRelease(async () => ({}), windows)).rejects.toThrow('版本列表');
  await expect(checkAppRelease(async () => Array(101).fill(release()), windows)).rejects.toThrow(
    '版本列表',
  );
});

test('only exact versioned installer names are selected and missing assets retain the release page', async () => {
  const entry = release();
  entry.assets = [
    entry.assets[7],
    ...release('0.0.9').assets,
    { ...entry.assets[0], name: '../Maa-Verge_0.1.0_x64-setup.exe' },
    { ...entry.assets[0], name: 'Other_0.1.0_x64-setup.exe' },
  ];
  const result = await checkAppRelease(source([entry]), windows);
  expect(result.release.assets).toEqual([]);
  expect(result.release.url).toBe(`${repository}/releases/tag/v0.1.0`);
});

test('unknown platforms and architectures never receive a different platform installer', async () => {
  for (const options of [
    { platform: 'win32', arch: 'ia32' },
    { platform: 'win32', arch: 'arm64' },
    { platform: 'linux', arch: 'arm64' },
    { platform: 'freebsd', arch: 'x64' },
  ]) {
    expect((await checkAppRelease(source([release()]), options)).release.assets).toEqual([]);
  }
  expect(
    (await checkAppRelease(source([release()]), { platform: 'darwin', arch: 'aarch64' })).release
      .assets[0].arch,
  ).toBe('arm64');
  expect(
    (await checkAppRelease(source([release()]), { platform: 'linux', arch: 'AMD64' })).release
      .assets,
  ).toHaveLength(3);
});

test('matching installers require a complete upload and a unique kind', async () => {
  for (const changes of [
    { state: 'new' },
    { size: 0 },
    { size: -1 },
    { size: 1.5 },
    { size: undefined },
  ]) {
    const entry = release();
    Object.assign(entry.assets[0], changes);
    await expect(checkAppRelease(source([entry]), windows)).rejects.toThrow('完整上传');
  }
  const entry = release();
  entry.assets.push(structuredClone(entry.assets[0]));
  await expect(checkAppRelease(source([entry]), windows)).rejects.toThrow('重复');
  const locales = release();
  locales.assets.push({
    ...locales.assets[1],
    name: 'Maa-Verge_0.1.0_x64_en-US.msi',
    browser_download_url: `${repository}/releases/download/v0.1.0/Maa-Verge_0.1.0_x64_en-US.msi`,
  });
  await expect(checkAppRelease(source([locales]), windows)).rejects.toThrow('重复');
});

test('release and asset addresses reject foreign hosts, repositories and URL encoding tricks', async () => {
  const mutations = [
    (url: string) => url.replace('https:', 'http:'),
    (url: string) => url.replace('github.com', 'github.com.evil.test'),
    (url: string) => url.replace('github.com', 'github.com@evil.test'),
    (url: string) => url.replace('DeathofBrain', 'AnotherOwner'),
    (url: string) => url + '?download=1',
    (url: string) => url + '#fragment',
    (url: string) => url.replace('/v0.1.0/', '/v0.0.9/'),
    (url: string) => url.replace('v0.1.0', 'v0%2E1%2E0'),
    (url: string) => url.replace('/releases/', '/extra/../releases/'),
    (url: string) => url.replace('https://', 'https://user:secret@'),
    (url: string) => url.replace('github.com', 'github.com:443'),
  ];
  for (const mutate of mutations) {
    const entry = release();
    entry.assets[0].browser_download_url = mutate(entry.assets[0].browser_download_url);
    await expect(checkAppRelease(source([entry]), windows)).rejects.toThrow('可信');
  }
  for (const url of [
    undefined,
    'https://example.test/release',
    `${repository}/releases/tag/v0.0.9`,
    `${repository}/releases/tag/v0%2E1%2E0`,
  ]) {
    await expect(
      checkAppRelease(source([{ ...release(), html_url: url }]), windows),
    ).rejects.toThrow('可信');
  }
});

test('build metadata is safely encoded in both tags and filenames', async () => {
  const entry = release('1.0.0+build.1', false);
  const result = await checkAppRelease(source([entry]), windows);
  expect(result.version).toBe('1.0.0+build.1');
  expect(result.release.url).toContain('v1.0.0%2Bbuild.1');
  expect(result.release.assets[0].url).toContain('Maa-Verge_1.0.0%2Bbuild.1_x64');
  entry.html_url = entry.html_url.replaceAll('%2B', '+');
  entry.assets.forEach(
    (asset: any) =>
      (asset.browser_download_url = asset.browser_download_url.replaceAll('%2B', '+')),
  );
  expect((await checkAppRelease(source([entry]), windows)).release.url).toBe(result.release.url);
});

test('release publication fields are required and notes are bounded', async () => {
  for (const changes of [
    { published_at: null },
    { published_at: 'yesterday' },
    { published_at: '2026-99-99T00:00:00Z' },
    { assets: null },
  ]) {
    await expect(checkAppRelease(source([{ ...release(), ...changes }]), windows)).rejects.toThrow(
      '不完整',
    );
  }
  expect(
    (await checkAppRelease(source([{ ...release(), body: '中'.repeat(20_000) }]), windows)).release
      .notes,
  ).toHaveLength(16 * 1024);
  expect(
    (await checkAppRelease(source([{ ...release(), body: null }]), windows)).release.notes,
  ).toBe('');
  await expect(
    checkAppRelease(async () => {
      throw new Error('网络超时');
    }, windows),
  ).rejects.toThrow('网络超时');
});
