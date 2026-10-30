import { openSync, readSync, closeSync, fstatSync } from 'node:fs';
import path from 'node:path';
import type { ResourceActivityVersion } from '../../../../../packages/contracts/src/types';

const clients = ['Official', 'Bilibili', 'YoStarEN', 'YoStarJP', 'YoStarKR', 'txwy'] as const;
const cache = new Map<string, ResourceActivityVersion[]>();
const text = (value: unknown, maximum: number) =>
  typeof value === 'string' && value.trim() && [...value].length <= maximum ? value.trim() : null;

// Like the original MAA client, use each client's version.json activity.name.
// A resource version label describes the installed pack; it is not a live calendar.
export function resourceActivityVersions(
  generation: string | undefined,
): ResourceActivityVersion[] {
  if (!generation) return [];
  const cached = cache.get(generation);
  if (cached) return cached;
  const result: ResourceActivityVersion[] = [];
  for (const clientType of clients) {
    const relative = ['Official', 'Bilibili'].includes(clientType)
      ? ''
      : path.join('global', clientType, 'resource');
    let descriptor: number | undefined;
    try {
      descriptor = openSync(path.join(generation, 'resource', relative, 'version.json'), 'r');
      const info = fstatSync(descriptor);
      if (!info.isFile() || info.size > 256 * 1024) continue;
      const buffer = Buffer.alloc(info.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const count = readSync(descriptor, buffer, length, buffer.length - length, null);
        if (!count) break;
        length += count;
      }
      if (length > info.size) continue;
      const value = JSON.parse(buffer.subarray(0, length).toString('utf8'));
      result.push({
        clientType,
        name: text(value?.activity?.name, 300),
        lastUpdated: text(value?.last_updated, 200),
      });
    } catch {
      /* Missing/corrupt client metadata must not impersonate another client. */
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  }
  // Generations are immutable. Bound the cache while retaining recent rollback packs.
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(generation, result);
  return result;
}
