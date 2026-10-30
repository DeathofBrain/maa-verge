import type { RpcContract } from '../../../../../packages/contracts/src/rpc-types';
import type { ClientType, Combo } from '../resources/item-resources';
import type { KnowledgeKind, KnowledgeRecord, ResourceKnowledgePack } from './knowledge-types';
import { buildResourceKnowledge, validResourceKnowledgePack } from './resource-knowledge';
import { productKnowledge, productKnowledgeDigest } from './product-knowledge';
import type { Store } from '../../infrastructure/storage/storage';

const kinds: KnowledgeKind[] = [
  'operator',
  'item',
  'stage',
  'recruitment',
  'infrastructure',
  'document',
  'capability',
];
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('en-US').trim();
function terms(query: string): string[] {
  const result = new Set<string>();
  for (const part of query.match(/[a-z0-9_.:-]+|\p{Script=Han}+/gu) ?? []) {
    result.add(part);
    if (/\p{Script=Han}/u.test(part) && part.length > 2)
      for (let i = 0; i < part.length - 1; i++) result.add(part.slice(i, i + 2));
  }
  return [...result];
}

/** Offline lexical retrieval: exact IDs/aliases first, then Chinese substrings and keywords. */
export function searchKnowledge(
  records: KnowledgeRecord[],
  input: RpcContract['params']['knowledge.search'],
): KnowledgeRecord[] {
  const query = normalize(input.query ?? ''),
    tokens = terms(query);
  return records
    .filter((row) => (!input.kind || row.kind === input.kind) && (!input.id || row.id === input.id))
    .map((row) => {
      if (!query) return { row, score: 1 };
      const names = [row.id, row.name, ...row.aliases].map(normalize),
        text = normalize(row.text);
      let score = names.includes(query)
        ? 1000
        : names.some((name) => name.includes(query))
          ? 300
          : text.includes(query)
            ? 100
            : 0;
      for (const token of tokens)
        score += names.some((name) => name.includes(token)) ? 10 : text.includes(token) ? 1 : 0;
      return { row, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.row.key.localeCompare(b.row.key, 'en'))
    .map((item) => item.row);
}

export class Knowledge {
  private pending = new Map<ClientType, Promise<ResourceKnowledgePack>>();
  private closed = false;
  constructor(
    private store: Store,
    private combo: () => Combo,
  ) {}

  private pack(client: ClientType) {
    if (this.closed) throw new Error('知识索引已关闭');
    const pending = this.pending.get(client);
    if (pending) return pending;
    const combo = structuredClone(this.combo());
    const build = (async () => {
      const saved = this.store.get('knowledge_resources', client);
      const previous = validResourceKnowledgePack(saved) ? saved : undefined;
      const pack = await buildResourceKnowledge(combo, client, previous);
      if (!previous || previous.fingerprint !== pack.fingerprint)
        this.store.put('knowledge_resources', client, pack);
      return pack;
    })();
    this.pending.set(client, build);
    void build
      .finally(() => {
        if (this.pending.get(client) === build) this.pending.delete(client);
      })
      .catch(() => {});
    return build;
  }

  async status(
    client: ClientType = 'Official',
  ): Promise<RpcContract['results']['knowledge.status']> {
    const pack = await this.pack(client),
      counts = Object.fromEntries(kinds.map((kind) => [kind, 0])) as Record<KnowledgeKind, number>;
    for (const record of [...pack.records, ...productKnowledge()]) counts[record.kind]++;
    return {
      parserVersion: pack.parserVersion,
      clientType: client,
      coreVersion: pack.coreVersion,
      resourceVersion: pack.resourceVersion,
      fingerprint: pack.fingerprint,
      productFingerprint: productKnowledgeDigest,
      counts,
      sources: pack.sources,
      diagnostics: pack.diagnostics,
    };
  }

  async search(
    input: RpcContract['params']['knowledge.search'],
  ): Promise<RpcContract['results']['knowledge.search']> {
    const clientType = input.clientType ?? 'Official',
      pack = await this.pack(clientType),
      offset = input.offset ?? 0,
      limit = input.limit ?? 20;
    const all = searchKnowledge([...pack.records, ...productKnowledge()], input);
    // NDJSON has a 4 MiB desktop limit. Budget bytes across whole records, not UTF-16 characters.
    const records: KnowledgeRecord[] = [];
    let bytes = 1024;
    for (const record of all.slice(offset, offset + limit)) {
      const size = Buffer.byteLength(JSON.stringify(record)) + 1;
      if (bytes + size > 3 * 1024 * 1024) break;
      records.push(record);
      bytes += size;
    }
    return {
      clientType,
      fingerprint: pack.fingerprint,
      productFingerprint: productKnowledgeDigest,
      records,
      total: all.length,
      offset,
      limit,
    };
  }

  async close() {
    this.closed = true;
    await Promise.allSettled([...this.pending.values()]);
  }
}
