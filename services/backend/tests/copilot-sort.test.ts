import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CopilotLibrary } from '../src/copilot';
import { Store } from '../src/storage';

const roots: string[] = [];
const stores: Store[] = [];
type OrderBy = 'hot' | 'id' | 'views';
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-copilot-sort-'));
  roots.push(root);
  const directory = path.join(root, 'resource', 'Arknights-Tile-Pos');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, 'overview.json'),
    JSON.stringify({
      synthetic: { stageId: 'main_01-07', code: '1-7', filename: 'stage.json' },
    }),
  );
  writeFileSync(path.join(directory, 'stage.json'), '{}');
  const store = new Store(root);
  stores.push(store);
  const requests: { url: string; init?: RequestInit }[] = [];
  const library = new CopilotLibrary(root, store, {
    coreVersion: () => 'v6.20.0',
    resourceDirectory: () => root,
    http: (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return Response.json({
        status_code: 200,
        data: { data: [{ id: 3 }, { id: 1 }], has_next: true, total: 40 },
      });
    }) as typeof fetch,
  });
  return { library, requests };
}
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test.each([
  { orderBy: undefined, expected: 'hot' },
  { orderBy: 'hot' as OrderBy, expected: 'hot' },
  { orderBy: 'id' as OrderBy, expected: 'id' },
  { orderBy: 'views' as OrderBy, expected: 'views' },
])(
  'community sorting uses upstream $expected descending with filters and pagination',
  async ({ orderBy, expected }) => {
    const { library, requests } = fixture();
    const result = await library.search({
      target: 'copilot',
      keyword: '合成关键词',
      stage: '1-7',
      page: 2,
      ...(orderBy ? { orderBy } : {}),
    });
    const request = new URL(requests[0]!.url);
    expect(request.origin).toBe('https://prts.maa.plus');
    expect(request.pathname).toBe('/copilot/query');
    expect(Object.fromEntries(request.searchParams)).toEqual({
      page: '2',
      limit: '20',
      orderBy: expected,
      desc: 'true',
      document: '合成关键词',
      levelKeyword: 'main_01-07',
    });
    expect(result.items.map((item) => item.id)).toEqual(['3', '1']);
    expect(result).toMatchObject({ page: 2, hasNext: true, total: 40 });
  },
);

test.each([undefined, 'hot', 'id', 'views'] as const)(
  'set queries retain their existing payload when copilot orderBy is %s',
  async (orderBy) => {
    const { library, requests } = fixture();
    const result = await library.search({
      target: 'set',
      keyword: '合成作业集',
      page: 3,
      ...(orderBy ? { orderBy } : {}),
    });
    expect(requests[0]!.url).toBe('https://prts.maa.plus/set/query');
    expect(requests[0]!.init?.method).toBe('POST');
    expect(JSON.parse(String(requests[0]!.init?.body))).toEqual({
      page: 3,
      limit: 20,
      keyword: '合成作业集',
    });
    expect(result.page).toBe(3);
  },
);

test('invalid sorting is rejected before contacting the community', async () => {
  const { library, requests } = fixture();
  for (const orderBy of ['upload_time', 'latest', 'random', '', null, 1])
    await expect(library.search({ target: 'copilot', orderBy } as never)).rejects.toThrow();
  expect(requests).toEqual([]);
});
