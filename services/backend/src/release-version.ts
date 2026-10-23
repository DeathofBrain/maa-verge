/** SemVer precedence; build metadata does not affect release ordering. */
export function releaseVersion(value: unknown): { numbers: bigint[]; prerelease: string[] } | undefined {
  if (typeof value !== 'string' || value.length > 128) return;
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
  if (!match) return;
  const prerelease = match[4]?.split('.') ?? [];
  if (prerelease.some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) return;
  return { numbers: match.slice(1, 4).map(BigInt), prerelease };
}
export function compareReleaseVersions(left: string, right: string): number {
  const a = releaseVersion(left), b = releaseVersion(right);
  if (!a || !b) throw new Error('无效的发布版本号');
  for (let index = 0; index < 3; index++) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index]! > b.numbers[index]! ? 1 : -1;
  }
  if (!a.prerelease.length || !b.prerelease.length) return Number(!a.prerelease.length) - Number(!b.prerelease.length);
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    const x = a.prerelease[index], y = b.prerelease[index];
    if (x === undefined || y === undefined) return Number(x !== undefined) - Number(y !== undefined);
    if (x === y) continue;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (xn !== yn) return xn ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}
