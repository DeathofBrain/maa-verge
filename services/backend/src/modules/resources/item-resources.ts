import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { crc32, inflateSync } from 'node:zlib';

export type Combo = { resource?: { path?: string; version?: string }; core?: { version?: string } };
export type ClientType = 'Official' | 'Bilibili' | 'YoStarEN' | 'YoStarJP' | 'YoStarKR' | 'txwy';
export type ItemResource = {
  itemId: string;
  name: string | null;
  mimeType: 'image/png' | null;
  data: string | null;
  resourceVersion: string | null;
};
type Item = { name: string | null; icon: string | null };
type Catalog = { reader: ResourceReader; selected: string; items: Map<string, Item> };
const catalogs = new Map<string, Promise<Catalog | undefined>>();
const clients = new Set<ClientType>([
  'Official',
  'Bilibili',
  'YoStarEN',
  'YoStarJP',
  'YoStarKR',
  'txwy',
]);
const id = (value: string) =>
  /^[A-Za-z0-9_-]{1,200}$/.test(value) && !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit: number) =>
  typeof value === 'string' && value.trim() && [...value].length <= limit ? value.trim() : null;
const contained = (root: string, filename: string) => {
  const relative = path.relative(root, filename);
  return (
    relative !== '' &&
    !relative.startsWith('..' + path.sep) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
};

/** Only fixed files in the active immutable generation are readable, never caller paths. */
export class ResourceReader {
  constructor(private root: string) {}
  static async create(generation: string): Promise<ResourceReader | undefined> {
    try {
      if (!path.isAbsolute(generation) || (await lstat(generation)).isSymbolicLink()) return;
      const resolved = await realpath(generation),
        root = path.join(resolved, 'resource'),
        info = await lstat(root);
      if (
        info.isSymbolicLink() ||
        !info.isDirectory() ||
        !contained(resolved, await realpath(root))
      )
        return;
      return new ResourceReader(root);
    } catch {
      return;
    }
  }
  async read(relative: string, limit: number): Promise<Buffer | undefined> {
    let file;
    try {
      const filename = path.join(this.root, relative);
      if (!contained(this.root, filename)) return;
      // Reject directory links as well as file links, including Windows junctions.
      let current = this.root;
      const segments = path.relative(this.root, filename).split(path.sep);
      for (let i = 0; i < segments.length; i++) {
        current = path.join(current, segments[i]);
        const info = await lstat(current);
        if (
          info.isSymbolicLink() ||
          (i < segments.length - 1 ? !info.isDirectory() : !info.isFile())
        )
          return;
      }
      if (!contained(this.root, await realpath(filename))) return;
      file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const info = await file.stat(),
        currentInfo = await lstat(filename);
      if (
        !info.isFile() ||
        !currentInfo.isFile() ||
        currentInfo.isSymbolicLink() ||
        info.dev !== currentInfo.dev ||
        info.ino !== currentInfo.ino ||
        info.size > limit
      )
        return;
      if (!contained(this.root, await realpath(filename))) return;
      const buffer = Buffer.alloc(info.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length !== info.size) return;
      return buffer.subarray(0, length);
    } catch {
      return;
    } finally {
      await file?.close();
    }
  }
}

async function catalog(combo: Combo, clientType: ClientType): Promise<Catalog | undefined> {
  if (!combo.resource?.path || !clients.has(clientType)) return;
  const key = JSON.stringify([combo.resource.path, combo.resource.version, clientType]);
  let pending = catalogs.get(key);
  if (!pending) {
    const generation = combo.resource.path;
    pending = (async () => {
      const reader = await ResourceReader.create(generation);
      if (!reader) return;
      const selected = ['Official', 'Bilibili'].includes(clientType)
        ? ''
        : path.join('global', clientType, 'resource');
      const buffer = await reader.read(path.join(selected, 'item_index.json'), 4 * 1024 * 1024);
      if (!buffer) return;
      let value: unknown;
      try {
        value = JSON.parse(buffer.toString('utf8'));
      } catch {
        return;
      }
      if (!object(value) || Object.keys(value).length > 10_000) return;
      const items = new Map<string, Item>();
      for (const [itemId, entry] of Object.entries(value)) {
        if (!id(itemId) || !object(entry)) continue;
        const icon =
          entry.icon === undefined
            ? itemId + '.png'
            : typeof entry.icon === 'string' &&
                entry.icon.endsWith('.png') &&
                id(entry.icon.slice(0, -4))
              ? entry.icon
              : null;
        items.set(itemId, { name: text(entry.name, 300), icon });
      }
      return { reader, selected, items };
    })();
    // Recent immutable packs cover current, in-flight and rollback generations.
    if (catalogs.size >= 8) catalogs.delete(catalogs.keys().next().value!);
    catalogs.set(key, pending);
  }
  return pending;
}

/** Names follow the selected client's complete index; CN-only items never fill a missing global entry. */
export async function itemResourceNames(
  combo: Combo,
  clientType: ClientType = 'Official',
): Promise<Record<string, string>> {
  const result: Record<string, string> = Object.create(null),
    source = await catalog(combo, clientType);
  if (source) for (const [itemId, item] of source.items) if (item.name) result[itemId] = item.name;
  return result;
}

// PNG decoding stays bounded even if an installed pack contains a compressed bomb.
export function validPng(buffer: Buffer): boolean {
  if (
    buffer.length < 57 ||
    !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return false;
  let offset = 8,
    width = 0,
    height = 0,
    bits = 0,
    interlace = 0,
    palette = false,
    ended = false;
  const data: Buffer[] = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset),
      end = offset + 12 + length;
    if (end > buffer.length) return false;
    const kind = buffer.toString('ascii', offset + 4, offset + 8),
      chunk = buffer.subarray(offset + 8, end - 4);
    if (crc32(buffer.subarray(offset + 4, end - 4)) !== buffer.readUInt32BE(end - 4)) return false;
    if (offset === 8) {
      if (kind !== 'IHDR' || length !== 13) return false;
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      const depth = chunk[8],
        color = chunk[9],
        channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color];
      if (
        !width ||
        !height ||
        width > 1024 ||
        height > 1024 ||
        !channels ||
        !([0, 3].includes(color) ? [1, 2, 4, 8, ...(color === 0 ? [16] : [])] : [8, 16]).includes(
          depth,
        ) ||
        chunk[10] !== 0 ||
        chunk[11] !== 0 ||
        chunk[12] > 1
      )
        return false;
      bits = depth * channels;
      interlace = chunk[12];
      palette = color === 3;
    } else if (kind === 'IHDR') return false;
    if (kind === 'IDAT') data.push(chunk);
    else if (kind === 'PLTE') {
      if (!length || length > 768 || length % 3) return false;
      palette = false;
    } else if (kind === 'IEND') {
      if (length !== 0 || end !== buffer.length) return false;
      ended = true;
      break;
    }
    offset = end;
  }
  if (!ended || !data.length || palette) return false;
  try {
    const passes = interlace
      ? [
          [0, 0, 8, 8],
          [4, 0, 8, 8],
          [0, 4, 4, 8],
          [2, 0, 4, 4],
          [0, 2, 2, 4],
          [1, 0, 2, 2],
          [0, 1, 1, 2],
        ]
      : [[0, 0, 1, 1]];
    const raw = inflateSync(Buffer.concat(data), { maxOutputLength: 8 * 1024 * 1024 + 1024 });
    let cursor = 0;
    for (const [x, y, dx, dy] of passes) {
      const columns = Math.max(0, Math.ceil((width - x) / dx)),
        rows = Math.max(0, Math.ceil((height - y) / dy));
      if (!columns || !rows) continue;
      const bytes = Math.ceil((columns * bits) / 8) + 1;
      for (let row = 0; row < rows; row++, cursor += bytes)
        if (cursor >= raw.length || raw[cursor] > 4) return false;
    }
    return cursor === raw.length;
  } catch {
    return false;
  }
}

/** Images come only from the active MaaResource pack; missing icons retain the text fallback. */
export async function itemResource(
  combo: Combo,
  itemId: string,
  clientType: ClientType = 'Official',
): Promise<ItemResource> {
  const result: ItemResource = {
    itemId,
    name: null,
    mimeType: null,
    data: null,
    resourceVersion: text(combo.resource?.version, 200),
  };
  if (!id(itemId)) return result;
  const source = await catalog(combo, clientType),
    item = source?.items.get(itemId);
  if (!source || !item) return result;
  result.name = item.name;
  if (!item.icon) return result;
  // Global templates overlay common artwork, just as MaaCore loads resources.
  for (const root of source.selected ? [source.selected, ''] : ['']) {
    const png = await source.reader.read(
      path.join(root, 'template', 'items', item.icon),
      512 * 1024,
    );
    if (png && validPng(png))
      return { ...result, mimeType: 'image/png', data: png.toString('base64') };
  }
  return result;
}
