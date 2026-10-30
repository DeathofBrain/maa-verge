/** Read-only application release discovery. Installing remains a desktop concern. */
import packageJson from '../../../../../package.json';

export const APP_VERSION = packageJson.version;
export const APP_RELEASES_URL = 'https://github.com/DeathofBrain/maa-verge/releases';
const API = 'https://api.github.com/repos/DeathofBrain/maa-verge/releases';
const REPOSITORY = 'https://github.com/DeathofBrain/maa-verge';
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

export interface AppReleaseAsset {
  name: string;
  url: string;
  kind: 'nsis' | 'msi' | 'dmg' | 'appimage' | 'deb' | 'rpm';
  arch: 'x64' | 'arm64';
}
export interface AppReleaseMetadata {
  version: string;
  release: {
    url: string;
    notes: string;
    publishedAt: string;
    prerelease: boolean;
    assets: AppReleaseAsset[];
  };
}
interface Version {
  core: string[];
  prerelease: string[];
  value: string;
}

function parseVersion(value: unknown): Version | undefined {
  if (typeof value !== 'string' || value.length > 128) return;
  const match =
    /^v?((0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/.exec(
      value,
    );
  if (!match) return;
  const prerelease = match[5]?.split('.') ?? [];
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0')))
    return;
  return { core: match.slice(2, 5), prerelease, value: match[1] };
}
function numericCompare(a: string, b: string): number {
  return a.length === b.length ? (a === b ? 0 : a > b ? 1 : -1) : a.length > b.length ? 1 : -1;
}

/** SemVer precedence, including prerelease identifiers; build metadata has no precedence. */
export function compareAppVersions(a: string, b: string): number {
  const left = parseVersion(a),
    right = parseVersion(b);
  if (!left || !right) throw new Error('应用版本号格式无效');
  for (let index = 0; index < 3; index++) {
    const compared = numericCompare(left.core[index], right.core[index]);
    if (compared) return compared;
  }
  if (!left.prerelease.length || !right.prerelease.length)
    return left.prerelease.length ? -1 : right.prerelease.length ? 1 : 0;
  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index++) {
    const x = left.prerelease[index],
      y = right.prerelease[index];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const xNumeric = /^\d+$/.test(x),
      yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) return numericCompare(x, y);
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

function canonicalUrl(value: unknown, segments: string[]): string {
  const expected = `${REPOSITORY}/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
  // '+' is a literal path character, and GitHub may return it unescaped in SemVer build tags.
  if (value !== expected && value !== expected.replaceAll('%2B', '+'))
    throw new Error('应用发布或安装包地址不是项目的可信 GitHub 地址');
  return expected;
}
function hostArchitecture(value: string): AppReleaseAsset['arch'] | undefined {
  if (['x64', 'amd64', 'x86_64'].includes(value.toLowerCase())) return 'x64';
  if (['arm64', 'aarch64'].includes(value.toLowerCase())) return 'arm64';
}
function assetType(
  name: unknown,
  version: string,
): (Omit<AppReleaseAsset, 'name' | 'url'> & { platform: string }) | undefined {
  if (typeof name !== 'string' || name.length > 256 || !/^[A-Za-z0-9._+-]+$/.test(name)) return;
  const prefix = `Maa-Verge_${version}_`;
  if (name === `${prefix}x64-setup.exe`) return { platform: 'win32', arch: 'x64', kind: 'nsis' };
  if (
    name.startsWith(prefix) &&
    /^x64_[a-z]{2}(?:-[A-Za-z0-9]+)*\.msi$/.test(name.slice(prefix.length))
  )
    return { platform: 'win32', arch: 'x64', kind: 'msi' };
  if (name === `${prefix}x64.dmg`) return { platform: 'darwin', arch: 'x64', kind: 'dmg' };
  if (name === `${prefix}aarch64.dmg`) return { platform: 'darwin', arch: 'arm64', kind: 'dmg' };
  if (name === `${prefix}amd64.AppImage`)
    return { platform: 'linux', arch: 'x64', kind: 'appimage' };
  if (name === `${prefix}amd64.deb`) return { platform: 'linux', arch: 'x64', kind: 'deb' };
  const rpmPrefix = `Maa-Verge-${version}-`;
  if (name.startsWith(rpmPrefix) && /^[1-9]\d*\.x86_64\.rpm$/.test(name.slice(rpmPrefix.length)))
    return { platform: 'linux', arch: 'x64', kind: 'rpm' };
}

export async function checkAppRelease(
  getJson: (url: string) => Promise<any>,
  options: { channel?: 'stable' | 'preview'; platform?: string; arch?: string } = {},
): Promise<AppReleaseMetadata> {
  const channel = options.channel ?? 'preview';
  if (!['stable', 'preview'].includes(channel)) throw new Error('未知应用更新通道');
  const candidates: Array<{ entry: any; version: Version }> = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const entries = await getJson(`${API}?per_page=${PAGE_SIZE}&page=${page}`);
    if (!Array.isArray(entries) || entries.length > PAGE_SIZE)
      throw new Error('应用发布源返回了无效的版本列表');
    for (const entry of entries) {
      if (
        !entry ||
        entry.draft !== false ||
        typeof entry.prerelease !== 'boolean' ||
        typeof entry.tag_name !== 'string' ||
        !entry.tag_name.startsWith('v')
      )
        continue;
      const version = parseVersion(entry.tag_name);
      if (!version || (channel === 'stable' && (entry.prerelease || version.prerelease.length)))
        continue;
      candidates.push({ entry, version });
    }
    if (entries.length < PAGE_SIZE) break;
    if (page === MAX_PAGES) throw new Error('应用发布版本过多，无法在安全分页范围内完成检查');
  }
  candidates.sort(
    (a, b) =>
      compareAppVersions(b.version.value, a.version.value) ||
      Number(a.entry.prerelease) - Number(b.entry.prerelease) ||
      a.entry.tag_name.localeCompare(b.entry.tag_name, 'en'),
  );
  const selected = candidates[0];
  if (!selected)
    throw new Error(
      channel === 'stable' ? '尚无可用的 Maa Verge 正式发布版本' : '尚无可用的 Maa Verge 发布版本',
    );
  const { entry, version } = selected;
  const releaseUrl = canonicalUrl(entry.html_url, ['releases', 'tag', entry.tag_name]);
  if (
    typeof entry.published_at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(entry.published_at) ||
    !Number.isFinite(Date.parse(entry.published_at)) ||
    !Array.isArray(entry.assets)
  ) {
    throw new Error('应用发布元数据不完整，请稍后重试');
  }
  const platform = options.platform ?? process.platform,
    arch = hostArchitecture(options.arch ?? process.arch);
  const assets: AppReleaseAsset[] = [],
    kinds = new Set<string>();
  for (const asset of entry.assets) {
    const type = assetType(asset?.name, version.value);
    if (!type || type.platform !== platform || type.arch !== arch) continue;
    if (asset.state !== 'uploaded' || !Number.isSafeInteger(asset.size) || asset.size <= 0)
      throw new Error('应用安装包尚未完整上传，请稍后重试');
    const url = canonicalUrl(asset.browser_download_url, [
      'releases',
      'download',
      entry.tag_name,
      asset.name,
    ]);
    if (kinds.has(type.kind)) throw new Error('应用发布包含重复的同类安装包，无法安全选择');
    kinds.add(type.kind);
    assets.push({ name: asset.name, url, kind: type.kind, arch: type.arch });
  }
  const order = ['nsis', 'msi', 'dmg', 'appimage', 'deb', 'rpm'];
  assets.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return {
    version: version.value,
    release: {
      url: releaseUrl,
      notes: typeof entry.body === 'string' ? entry.body.slice(0, 16 * 1024) : '',
      publishedAt: entry.published_at,
      prerelease: entry.prerelease || version.prerelease.length > 0,
      assets,
    },
  };
}
