import path from 'node:path';
import type { RpcContract } from '../../../../../packages/contracts/src/rpc-types';
import { ResourceReader, validPng, type ClientType, type Combo } from './item-resources';

type OperatorResource = RpcContract['results']['resources.operator'];
type Operator = { id: string | null; name: string; rarity: number | null };
type Catalog = {
  reader: ResourceReader;
  selected: string;
  ids: Map<string, Operator>;
  names: Map<string, Operator>;
  aliases: Map<string, Operator>;
};
const catalogs = new Map<string, Promise<Catalog | undefined>>();
const nameKeys: Record<ClientType, string> = {
  Official: 'name',
  Bilibili: 'name',
  YoStarEN: 'name_en',
  YoStarJP: 'name_jp',
  YoStarKR: 'name_kr',
  txwy: 'name_tw',
};
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit = 300): string | null =>
  typeof value === 'string' &&
  value.trim() &&
  [...value].length <= limit &&
  !/[\u0000-\u001f\u007f]/.test(value)
    ? value.trim()
    : null;
const add = (names: Map<string, Operator>, name: string, operator: Operator) => {
  // Several characters/forms share a name. A name alone cannot identify those.
  if (!names.has(name)) names.set(name, operator);
  else {
    const existing = names.get(name)!;
    if (existing.id !== operator.id)
      names.set(name, {
        id: null,
        name,
        rarity: existing.rarity === operator.rarity ? operator.rarity : null,
      });
  }
};

async function catalog(combo: Combo, clientType: ClientType): Promise<Catalog | undefined> {
  if (!combo.resource?.path || !Object.hasOwn(nameKeys, clientType)) return;
  const key = JSON.stringify([combo.resource.path, combo.resource.version, clientType]);
  let pending = catalogs.get(key);
  if (!pending) {
    const generation = combo.resource.path;
    pending = (async () => {
      const reader = await ResourceReader.create(generation);
      if (!reader) return;
      // battle_data contains the per-client names together, including CN-only entries.
      const buffer = await reader.read('battle_data.json', 4 * 1024 * 1024);
      if (!buffer) return;
      let value: unknown;
      try {
        value = JSON.parse(buffer.toString('utf8'));
      } catch {
        return;
      }
      if (!object(value) || !object(value.chars) || Object.keys(value.chars).length > 10_000)
        return;
      const names = new Map<string, Operator>(),
        aliases = new Map<string, Operator>(),
        ids = new Map<string, Operator>();
      for (const [id, entry] of Object.entries(value.chars)) {
        // Summons/traps also live in chars; they must not make a real operator ambiguous.
        if (!/^char_[A-Za-z0-9_]{1,195}$/.test(id) || !object(entry)) continue;
        const name = text(entry[nameKeys[clientType]]);
        if (!name) continue;
        const rarity =
          typeof entry.rarity === 'number' &&
          Number.isInteger(entry.rarity) &&
          entry.rarity >= 1 &&
          entry.rarity <= 6
            ? entry.rarity
            : null;
        const operator = { id, name, rarity };
        ids.set(id, operator);
        add(names, name, operator);
        for (const field of Object.values(nameKeys)) {
          const alias = text(entry[field]);
          if (alias) add(aliases, alias, operator);
        }
      }
      const selected = ['Official', 'Bilibili'].includes(clientType)
        ? ''
        : path.join('global', clientType, 'resource');
      return { reader, selected, ids, names, aliases };
    })();
    if (catalogs.size >= 8) catalogs.delete(catalogs.keys().next().value!);
    catalogs.set(key, pending);
  }
  return pending;
}

/** Resolve exact, unambiguous names only; missing artwork always leaves a text result. */
export async function operatorResource(
  combo: Combo,
  name: string,
  clientType: ClientType = 'Official',
  operatorId?: string,
): Promise<OperatorResource> {
  const result: OperatorResource = {
    name,
    id: null,
    rarity: null,
    mimeType: null,
    data: null,
    resourceVersion: text(combo.resource?.version, 200),
  };
  const query = text(name);
  if (!query) return result;
  const source = await catalog(combo, clientType);
  if (!source) return result;
  // A duplicate current-client name is not rescued by a less specific alias.
  const operator =
    operatorId && /^char_[A-Za-z0-9_]{1,195}$/.test(operatorId)
      ? source.ids.get(operatorId)
      : source.names.has(query)
        ? source.names.get(query)
        : source.aliases.get(query);
  if (!operator) return result;
  Object.assign(result, operator);
  if (!operator.id) return result;
  for (const root of source.selected ? [source.selected, ''] : ['']) {
    const png = await source.reader.read(
      path.join(root, 'template', 'avatar', operator.id + '.png'),
      512 * 1024,
    );
    if (png && validPng(png))
      return { ...result, mimeType: 'image/png', data: png.toString('base64') };
  }
  return result;
}
