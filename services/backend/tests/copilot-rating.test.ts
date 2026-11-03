import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { copilotWorkspaceIdentity } from '@backend/modules/copilot/copilot';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [],
  runtimes: Runtime[] = [];
const content = JSON.stringify({
  stage_name: 'main_01-07',
  doc: { title: '合成社区作业' },
  opers: [{ name: '阿米娅', skill: 1 }],
  groups: [
    {
      name: '先锋任选',
      opers: [
        { name: '芬', skill: 1 },
        { name: '香草', skill: 1 },
      ],
    },
  ],
  actions: [{ type: 'SpeedUp' }],
});
async function fixture() {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-copilot-rating-'));
  roots.push(root);
  const directory = path.join(root, 'generation', 'resource', 'Arknights-Tile-Pos');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, 'overview.json'),
    JSON.stringify({ main: { stageId: 'main_01-07', code: '1-7', filename: 'map.json' } }),
  );
  writeFileSync(path.join(directory, 'map.json'), '{}');
  const requests: { url: string; method: string; body?: any; headers?: HeadersInit }[] = [],
    ratings = new Map<string, number>();
  const upstream = {
    content,
    fail: false,
    malformed: false,
    ignoreWrites: false,
    beforeGet: undefined as (() => Promise<void>) | undefined,
    beforePost: undefined as ((body: { rating: string }) => Promise<void>) | undefined,
  };
  const http = (async (url: any, init?: RequestInit) => {
    const address = String(url),
      request = {
        url: address,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers: init?.headers,
      };
    requests.push(request);
    if (upstream.fail) throw new Error('合成社区离线');
    if (address.endsWith('/copilot/rating')) {
      const value = request.body;
      await upstream.beforePost?.(value);
      if (!upstream.ignoreWrites)
        ratings.set(String(value.id), { Like: 1, Dislike: 2, None: 0 }[value.rating as 'Like']);
      return Response.json({ status_code: 200, data: '评分成功' });
    }
    const id = /\/copilot\/get\/(\d+)$/.exec(address)?.[1];
    if (!id) throw new Error('测试禁止访问未知社区地址');
    await upstream.beforeGet?.();
    return Response.json({
      status_code: 200,
      data: {
        id: Number(id),
        content: upstream.content,
        uploader: '合成上传者',
        like: upstream.malformed ? '99%' : 12,
        dislike: 3,
        rating_type: ratings.get(id) ?? 0,
      },
    });
  }) as typeof fetch;
  const r = new Runtime(root, {
    copilotHttp: http,
    validator: async () => {},
    adbExecutable: () => 'synthetic-adb',
    calendar: { fetcher: null },
  });
  runtimes.push(r);
  r.store.put('active', 'combo', {
    resource: { path: path.join(root, 'generation'), version: 'fixture-resource' },
  });
  const preview = await r.handle('copilot.preview', { code: '123' }),
    record = preview.entries[0].record;
  const identity = { versionId: record.versionId, recordId: record.id };
  const queue = async (patch: any = {}) => {
    await r.handle('copilot.import', { previewId: preview.id });
    const workspace = await r.handle('copilot.workspace.get', { kind: 'Copilot' });
    workspace.queue = [
      { id: 'entry-1', versionId: record.versionId, enabled: true, isRaid: false, navName: '' },
    ];
    Object.assign(workspace.options, patch);
    return r.handle('copilot.workspace.save', { workspace });
  };
  // Seed only persisted evidence from a historical completed execution. No native run is started.
  const historical = (confirmed = true) => {
    const prepared = {
      workspace: structuredClone(r.copilot.workspaceGet({ kind: 'Copilot' })),
      feedbackSources: [{ entryId: 'entry-1', versionId: record.versionId, communityId: '123' }],
    };
    const entries = prepared.workspace.queue.map((entry, index) => ({
      title: '历史作业',
      nativeId: index + 1,
      message: '历史完成证据',
      ...entry,
      status: 'completed' as const,
      verdict: confirmed ? ('success' as const) : ('unknown' as const),
    }));
    const runId = 'historical-' + crypto.randomUUID();
    return {
      prepared,
      entries,
      runId,
      submit: () => r.copilot.autoLikeConfirmed(runId, prepared, entries),
    };
  };
  const posts = () => requests.filter((item) => item.method === 'POST');
  return {
    r,
    root,
    requests,
    ratings,
    upstream,
    preview,
    record,
    identity,
    queue,
    historical,
    posts,
  };
}
afterEach(async () => {
  for (const r of runtimes.splice(0)) await r.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('unimported preview supports real anonymous rating semantics and exact source identity', async () => {
  const { r, identity, record, posts, requests } = await fixture();
  expect(r.copilot.list().items).toHaveLength(0);
  expect(await r.handle('copilot.rating.get', identity)).toEqual({
    communityId: '123',
    likes: 12,
    dislikes: 3,
    rating: 'none',
  });
  expect((await r.handle('copilot.rating.set', { ...identity, rating: 'like' })).rating).toBe(
    'like',
  );
  expect((await r.handle('copilot.rating.set', { ...identity, rating: 'dislike' })).rating).toBe(
    'dislike',
  );
  expect((await r.handle('copilot.rating.set', { ...identity, rating: 'none' })).rating).toBe(
    'none',
  );
  expect(posts().map((item) => item.body)).toEqual([
    { id: 123, rating: 'Like' },
    { id: 123, rating: 'Dislike' },
    { id: 123, rating: 'None' },
  ]);
  expect(
    requests.every(
      (item) =>
        !new Headers(item.headers).has('Authorization') &&
        !new Headers(item.headers).has('X-Forwarded-For'),
    ),
  ).toBe(true);
  expect(record.operators.map((item: any) => [item.name, item.group])).toEqual([
    ['阿米娅', undefined],
    ['芬', '先锋任选'],
    ['香草', '先锋任选'],
  ]);
});

test('a newer unimported community preview remains rateable beside an older imported version', async () => {
  const { r, preview, record, upstream, posts } = await fixture();
  await r.handle('copilot.import', { previewId: preview.id });
  upstream.content = JSON.stringify({ ...JSON.parse(content), doc: { title: '社区作业新版本' } });
  const next = await r.handle('copilot.preview', { code: '123' }),
    latest = next.entries[0].record;
  expect(latest.versionId).not.toBe(record.versionId);
  const identity = { versionId: latest.versionId, recordId: latest.id };
  expect((await r.handle('copilot.rating.get', identity)).rating).toBe('none');
  expect((await r.handle('copilot.rating.set', { ...identity, rating: 'like' })).rating).toBe(
    'like',
  );
  expect(posts().map((item) => item.body)).toEqual([{ id: 123, rating: 'Like' }]);
  expect(r.copilot.list().items.every((item) => item.versionId === record.versionId)).toBe(true);
});

test('ratings reject arbitrary sources, local uploads, mismatched records and malformed real statistics', async () => {
  const { r, identity, upstream, posts } = await fixture();
  await expect(
    r.handle('copilot.rating.set', { ...identity, communityId: '456', rating: 'like' }),
  ).rejects.toThrow('请求无效');
  await expect(
    r.handle('copilot.rating.set', { ...identity, recordId: 'unknown', rating: 'like' }),
  ).rejects.toThrow('来源已过期');
  const local = await r.handle('copilot.preview', { content, name: 'local.json' });
  await expect(
    r.handle('copilot.rating.get', {
      versionId: identity.versionId,
      recordId: local.entries[0].record.id,
    }),
  ).rejects.toThrow('仅社区');
  upstream.malformed = true;
  await expect(r.handle('copilot.rating.set', { ...identity, rating: 'like' })).rejects.toThrow(
    '评价响应无效',
  );
  expect(posts()).toHaveLength(0);
});

test('the opt-out default migrates older workspaces without changing persistent request identity', async () => {
  const { r, queue } = await fixture(),
    workspace = await queue();
  expect(workspace.options.autoLikeOnSuccess).toBe(false);
  const old = structuredClone(workspace);
  delete old.options.autoLikeOnSuccess;
  expect(copilotWorkspaceIdentity(old)).toBe(copilotWorkspaceIdentity(workspace));
  r.store.put('copilot_workspace', 'Copilot', old);
  expect(
    (await r.handle('copilot.workspace.get', { kind: 'Copilot' })).options.autoLikeOnSuccess,
  ).toBe(false);
});

test('historical flattened operator alternatives recover from immutable JSON without rewriting storage', async () => {
  const { r, record, queue } = await fixture();
  await queue();
  const stored = r.store.get('copilot', record.id),
    version = r.store.get('copilot_version', record.versionId);
  for (const metadata of [stored, version.record])
    for (const operator of metadata.operators) delete operator.group;
  r.store.put('copilot', record.id, stored);
  r.store.put('copilot_version', record.versionId, version);
  expect(
    (await r.handle('copilot.get', { id: record.id })).operators.map(
      (operator: any) => operator.group,
    ),
  ).toEqual([undefined, '先锋任选', '先锋任选']);
  expect(r.store.get('copilot', record.id)).toEqual(stored);
  expect(r.store.get('copilot_version', record.versionId)).toEqual(version);
});

test('new copilot execution is blocked without changing queue or issuing community feedback', async () => {
  const { r, queue, posts } = await fixture();
  const workspace = await queue({ autoLikeOnSuccess: true });
  await expect(
    r.handle('copilot.start', {
      kind: 'Copilot',
      deviceId: 'historical-device',
      requestId: 'blocked',
    }),
  ).rejects.toThrow('尚未迁移');
  expect(await r.handle('copilot.workspace.get', { kind: 'Copilot' })).toEqual(workspace);
  expect(r.store.all('run')).toEqual([]);
  expect(posts()).toHaveLength(0);
});

test.each([
  { enabled: false, confirmed: true },
  { enabled: true, confirmed: false },
])(
  'historical automatic feedback requires explicit consent and confirmed evidence %j',
  async ({ enabled, confirmed }) => {
    const { r, queue, historical, posts } = await fixture();
    await queue({ autoLikeOnSuccess: enabled });
    historical(confirmed).submit();
    await r.copilot.drainFeedback();
    expect(posts()).toHaveLength(0);
  },
);

test('historical success freezes identity and consent and auto-likes at most once', async () => {
  const { r, queue, historical, record, posts } = await fixture();
  await queue({ autoLikeOnSuccess: true });
  const evidence = historical();
  await r.handle('copilot.delete', { id: record.id });
  await r.handle('copilot.preview', { code: '456' });
  const draft = await r.handle('copilot.workspace.get', { kind: 'Copilot' });
  draft.options.autoLikeOnSuccess = false;
  await r.handle('copilot.workspace.save', { workspace: draft });
  evidence.submit();
  await r.copilot.drainFeedback();
  evidence.submit();
  await r.copilot.drainFeedback();
  expect(posts().map((item) => item.body)).toEqual([{ id: 123, rating: 'Like' }]);
});

test.each(['upstream-dislike', 'local-dislike', 'failed-manual-dislike'] as const)(
  'historical automatic feedback preserves manual negative intent: %s',
  async (mode) => {
    const { r, queue, historical, identity, ratings, upstream, posts } = await fixture();
    if (mode === 'upstream-dislike') ratings.set('123', 2);
    else {
      upstream.fail = mode === 'failed-manual-dislike';
      try {
        await r.handle('copilot.rating.set', { ...identity, rating: 'dislike' });
      } catch {
        /* Offline intent remains protected. */
      }
      upstream.fail = false;
      ratings.set('123', 0);
    }
    const before = posts().length;
    await queue({ autoLikeOnSuccess: true });
    historical().submit();
    await r.copilot.drainFeedback();
    expect(posts()).toHaveLength(before);
  },
);

test('failed historical feedback is recorded and never replayed after restart', async () => {
  const { r, root, queue, historical, upstream, posts } = await fixture();
  await queue({ autoLikeOnSuccess: true });
  const evidence = historical();
  upstream.fail = true;
  evidence.submit();
  await r.copilot.drainFeedback();
  expect(r.store.get('copilot_auto_rating', '123').status).toBe('failed');
  await r.close();
  runtimes.splice(runtimes.indexOf(r), 1);
  const reopened = new Runtime(root, {
    calendar: { fetcher: null },
    copilotHttp: (async () => {
      throw new Error('禁止重放评价');
    }) as unknown as typeof fetch,
  });
  runtimes.push(reopened);
  reopened.copilot.autoLikeConfirmed(evidence.runId, evidence.prepared, evidence.entries);
  await reopened.copilot.drainFeedback();
  expect(posts()).toHaveLength(0);
});

test('ambiguous identical uploads require explicit community identity for feedback', async () => {
  const { r, queue, historical, posts } = await fixture();
  const other = await r.handle('copilot.preview', { code: '456' });
  await queue({ autoLikeOnSuccess: true });
  expect(() => r.copilot.prepare('Copilot')).toThrow('尚未迁移');
  await r.copilot.drainFeedback();
  expect(posts()).toHaveLength(0);
  const record = other.entries[0].record;
  await expect(r.handle('copilot.rating.get', { versionId: record.versionId })).rejects.toThrow(
    '多个社区来源',
  );
  await r.handle('copilot.rating.set', {
    versionId: record.versionId,
    recordId: record.id,
    rating: 'like',
  });
  expect(posts()[0].body.id).toBe(456);
});

test('local content cannot inherit automatic credit from a community preview', async () => {
  const { r, queue, historical, posts } = await fixture();
  const local = await r.handle('copilot.preview', { content, name: 'local.json' });
  await r.handle('copilot.import', { previewId: local.id });
  await queue({ autoLikeOnSuccess: true });
  expect(() => r.copilot.prepare('Copilot')).toThrow('尚未迁移');
  await r.copilot.drainFeedback();
  expect(posts()).toHaveLength(0);
});

test('manual dislike during historical preflight wins before any automatic positive POST', async () => {
  const { r, queue, historical, upstream, identity, posts } = await fixture();
  await queue({ autoLikeOnSuccess: true });
  const evidence = historical();
  let arrived!: () => void, release!: () => void;
  const reading = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  upstream.beforeGet = async () => {
    upstream.beforeGet = undefined;
    arrived();
    await gate;
  };
  evidence.submit();
  await reading;
  const manual = r.handle('copilot.rating.set', { ...identity, rating: 'dislike' });
  release();
  await manual;
  await r.copilot.drainFeedback();
  expect(posts().map((item) => item.body.rating)).toEqual(['Dislike']);
});

test('a write response without confirmed rating records failed historical feedback', async () => {
  const { r, queue, historical, upstream, posts } = await fixture();
  await queue({ autoLikeOnSuccess: true });
  upstream.ignoreWrites = true;
  historical().submit();
  await r.copilot.drainFeedback();
  expect(posts()).toHaveLength(1);
  expect(r.store.get('copilot_auto_rating', '123').status).toBe('failed');
});

test.each(['GET', 'POST'] as const)(
  'shutdown aborts stalled historical %s feedback and preserves unknown intent',
  async (stage) => {
    const { r, root, identity, upstream, queue, historical, posts } = await fixture();
    await queue({ autoLikeOnSuccess: true });
    const evidence = historical();
    let arrived!: () => void, release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stall = async () => {
      arrived();
      await gate;
    };
    if (stage === 'GET') upstream.beforeGet = stall;
    else upstream.beforePost = stall;
    evidence.submit();
    await waiting;
    const queued = r
      .handle('copilot.rating.set', { ...identity, rating: 'dislike' })
      .catch((error) => error);
    await r.close();
    expect((await queued).message).toContain('退出');
    expect(posts()).toHaveLength(stage === 'POST' ? 1 : 0);
    release();
    runtimes.splice(runtimes.indexOf(r), 1);
    let replayed = false;
    const reopened = new Runtime(root, {
      calendar: { fetcher: null },
      copilotHttp: (async () => {
        replayed = true;
        throw new Error('禁止重放未知评价');
      }) as unknown as typeof fetch,
    });
    runtimes.push(reopened);
    expect(reopened.store.get('copilot_auto_rating', '123').status).toBe('unknown');
    reopened.copilot.autoLikeConfirmed(evidence.runId, evidence.prepared, evidence.entries);
    await reopened.copilot.drainFeedback();
    expect(replayed).toBe(false);
  },
);
