import { expect, test } from 'bun:test';
import { OfficialSource, platformAsset } from '../src/modules/updates/updates';
import { compareReleaseVersions, releaseVersion } from '../src/shared/release-version';

function release(version: string, prerelease = false) {
  const name = `MAA-${version}-${platformAsset()}`;
  return {
    tag_name: version,
    prerelease,
    draft: false,
    assets: [
      {
        name,
        size: 123,
        browser_download_url: `https://github.com/MaaAssistantArknights/MaaAssistantArknights/releases/download/${encodeURIComponent(version)}/${name}`,
      },
    ],
  };
}
function source(response: (url: string) => any) {
  return new OfficialSource((async (url: any) =>
    Response.json(response(String(url)))) as typeof fetch);
}

test('MaaCore stable and preview use independent release sources and preview includes stable releases', async () => {
  const urls: string[] = [];
  const official = source((url) => {
    urls.push(url);
    return url.endsWith('/latest')
      ? release('v6.20.0')
      : [
          release('v6.21.0-beta.2', true),
          release('v6.21.0-beta.10', true),
          release('v6.20.1'),
          { ...release('v99.0.0'), draft: true },
        ];
  });
  expect((await official.check('core')).version).toBe('v6.20.0');
  expect((await official.check('core', 'preview')).version).toBe('v6.21.0-beta.10');
  expect(urls[0]).toEndWith('/releases/latest');
  expect(urls[1]).toContain('releases?per_page=100&page=1');
  expect(
    (
      await source(() => [release('v6.21.0-beta.10', true), release('v6.21.0')]).check(
        'core',
        'preview',
      )
    ).version,
  ).toBe('v6.21.0');
});

test('MaaCore preview checks subsequent pages rather than trusting publish order', async () => {
  const urls: string[] = [];
  const official = source((url) => {
    urls.push(url);
    return url.endsWith('page=1')
      ? Array.from({ length: 100 }, () => release('v6.20.0'))
      : [release('v6.22.0-rc.1', true)];
  });
  expect((await official.check('core', 'preview')).version).toBe('v6.22.0-rc.1');
  expect(urls).toHaveLength(2);
});

test('MaaCore rejects non-stable versions in stable mode and asset URLs outside the pinned release', async () => {
  await expect(source(() => release('v6.21.0-beta.1', true)).check('core')).rejects.toThrow(
    '非稳定',
  );
  await expect(source(() => release('v6.21.0-beta.1')).check('core')).rejects.toThrow('非稳定');
  for (const url of [
    'https://github.com/MaaAssistantArknights/another/releases/download/v6.20.0/a.zip',
    'https://github.com.evil.test/a',
    'https://github.com/MaaAssistantArknights/MaaAssistantArknights/releases/download/v6.19.0/a.zip',
  ]) {
    const entry = release('v6.20.0');
    entry.assets[0]!.browser_download_url = url;
    await expect(source(() => entry).check('core')).rejects.toThrow('对应发布');
  }
});

test('SemVer precedence covers numeric preview identifiers, release promotion, metadata and large components', () => {
  const versions = [
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0',
    '1.0.1',
    '1.1.0',
    '2.0.0',
    '9007199254740993.0.0',
  ];
  for (let index = 1; index < versions.length; index++)
    expect(compareReleaseVersions(versions[index]!, versions[index - 1]!)).toBeGreaterThan(0);
  expect(compareReleaseVersions('v1.2.3+build.1', '1.2.3')).toBe(0);
  for (const value of ['1.0', '01.0.0', 'v1.0.0-beta.01', 'next', null])
    expect(releaseVersion(value)).toBeUndefined();
});
