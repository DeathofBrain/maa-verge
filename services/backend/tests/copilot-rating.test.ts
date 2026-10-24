import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '../src/runtime';
import { copilotWorkspaceIdentity } from '../src/copilot';

const roots: string[] = [], runtimes: Runtime[] = [];
const content = JSON.stringify({ stage_name: 'main_01-07', doc: { title: '合成社区作业' }, opers: [{ name: '阿米娅', skill: 1 }], groups: [{ name: '先锋任选', opers: [{ name: '芬', skill: 1 }, { name: '香草', skill: 1 }] }], actions: [{ type: 'SpeedUp' }] });
class Worker {
  connected = true; safeIdle = true; events: any[] = []; tasks: any[] = [];
  async connect() { return { asyncId: 1 }; }
  async waitConnected() { return true; }
  async task(task: any) { this.tasks.push(structuredClone(task)); this.safeIdle = false; return { taskId: this.tasks.length }; }
  async stop() { return { stopping: true }; }
  async close() { this.connected = false; this.safeIdle = true; }
  callback(message: number, details: any = {}) { this.events.push({ type: 'callback', message, details: { taskid: this.tasks.length, ...details } }); }
  victory() { this.callback(20001, { subtask: 'BattleProcessTask' }); this.callback(20002, { subtask: 'ProcessTask', details: { task: 'Copilot@StageDrops-Stars-3' } }); }
  complete() { this.callback(10002); this.callback(3); this.safeIdle = true; this.events.push({ type: 'status', running: false, pendingAsync: [] }); }
}
async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-copilot-rating-')); roots.push(root);
  const directory = path.join(root, 'generation', 'resource', 'Arknights-Tile-Pos'); mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'overview.json'), JSON.stringify({ main: { stageId: 'main_01-07', code: '1-7', filename: 'map.json' } })); writeFileSync(path.join(directory, 'map.json'), '{}');
  const requests: { url: string; method: string; body?: any; headers?: HeadersInit }[] = [], ratings = new Map<string, number>();
  const upstream = { content, fail: false, malformed: false, ignoreWrites: false, beforeGet: undefined as (() => Promise<void>) | undefined, beforePost: undefined as ((body: { rating: string }) => Promise<void>) | undefined };
  const http = (async (url: any, init?: RequestInit) => {
    const address = String(url), request = { url: address, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: init?.headers }; requests.push(request);
    if (upstream.fail) throw new Error('合成社区离线');
    if (address.endsWith('/copilot/rating')) { const value = request.body; await upstream.beforePost?.(value); if (!upstream.ignoreWrites) ratings.set(String(value.id), { Like: 1, Dislike: 2, None: 0 }[value.rating as 'Like']); return Response.json({ status_code: 200, data: '评分成功' }); }
    const id = /\/copilot\/get\/(\d+)$/.exec(address)?.[1];
    if (!id) throw new Error('测试禁止访问未知社区地址');
    await upstream.beforeGet?.();
    return Response.json({ status_code: 200, data: { id: Number(id), content: upstream.content, uploader: '合成上传者', like: upstream.malformed ? '99%' : 12, dislike: 3, rating_type: ratings.get(id) ?? 0 } });
  }) as typeof fetch;
  const worker = new Worker();
  const r = new Runtime(root, { copilotHttp: http, workerFactory: async () => worker, validator: async () => {}, adbExecutable: () => 'synthetic-adb', calendar: { fetcher: null } }); runtimes.push(r);
  r.store.put('active', 'combo', { core: { path: 'fixture-core', version: 'v6.20.0' }, resource: { path: path.join(root, 'generation'), version: 'fixture-resource' } });
  const device = await r.connectDevice({ address: '127.0.0.1:5555', name: '合成设备' }); device.state = 'idle'; r.store.put('device', device.id, device);
  const preview = await r.handle('copilot.preview', { code: '123' }), record = preview.entries[0].record;
  const identity = { versionId: record.versionId, recordId: record.id };
  const queue = async (patch: any = {}) => {
    await r.handle('copilot.import', { previewId: preview.id });
    const workspace = await r.handle('copilot.workspace.get', { kind: 'Copilot' }); workspace.queue = [{ id: 'entry-1', versionId: record.versionId, enabled: true, isRaid: false, navName: '' }]; Object.assign(workspace.options, patch);
    return r.handle('copilot.workspace.save', { workspace });
  };
  const start = () => r.handle('copilot.start', { kind: 'Copilot', deviceId: device.id, requestId: crypto.randomUUID() });
  const finish = async (victory = true) => { if (victory) worker.victory(); worker.complete(); await r.tick(true); await r.copilot.drainFeedback(); };
  const posts = () => requests.filter(item => item.method === 'POST');
  return { r, root, worker, requests, ratings, upstream, preview, record, identity, queue, start, finish, posts };
}
afterEach(async () => { for (const r of runtimes.splice(0)) await r.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test('unimported preview supports real anonymous rating semantics and exact source identity', async () => {
  const { r, identity, record, posts, requests } = await fixture();
  expect(r.copilot.list().items).toHaveLength(0);
  expect(await r.handle('copilot.rating.get', identity)).toEqual({ communityId: '123', likes: 12, dislikes: 3, rating: 'none' });
  expect((await r.handle('copilot.rating.set', { ...identity, rating: 'like' })).rating).toBe('like');
  expect((await r.handle('copilot.rating.set', { ...identity, rating: 'dislike' })).rating).toBe('dislike');
  expect((await r.handle('copilot.rating.set', { ...identity, rating: 'none' })).rating).toBe('none');
  expect(posts().map(item => item.body)).toEqual([{ id: 123, rating: 'Like' }, { id: 123, rating: 'Dislike' }, { id: 123, rating: 'None' }]);
  expect(requests.every(item => !new Headers(item.headers).has('Authorization') && !new Headers(item.headers).has('X-Forwarded-For'))).toBe(true);
  expect(record.operators.map((item: any) => [item.name, item.group])).toEqual([['阿米娅', undefined], ['芬', '先锋任选'], ['香草', '先锋任选']]);
});

test('a newer unimported community preview remains rateable beside an older imported version', async () => {
  const { r, preview, record, upstream, posts } = await fixture();
  await r.handle('copilot.import', { previewId: preview.id });
  upstream.content = JSON.stringify({ ...JSON.parse(content), doc: { title: '社区作业新版本' } });
  const next = await r.handle('copilot.preview', { code: '123' }), latest = next.entries[0].record;
  expect(latest.versionId).not.toBe(record.versionId);
  const identity = { versionId: latest.versionId, recordId: latest.id };
  expect((await r.handle('copilot.rating.get', identity)).rating).toBe('none');
  expect((await r.handle('copilot.rating.set', { ...identity, rating: 'like' })).rating).toBe('like');
  expect(posts().map(item => item.body)).toEqual([{ id: 123, rating: 'Like' }]);
  expect(r.copilot.list().items.every(item => item.versionId === record.versionId)).toBe(true);
});

test('ratings reject arbitrary sources, local uploads, mismatched records and malformed real statistics', async () => {
  const { r, identity, upstream, posts } = await fixture();
  await expect(r.handle('copilot.rating.set', { ...identity, communityId: '456', rating: 'like' })).rejects.toThrow('请求无效');
  await expect(r.handle('copilot.rating.set', { ...identity, recordId: 'unknown', rating: 'like' })).rejects.toThrow('来源已过期');
  const local = await r.handle('copilot.preview', { content, name: 'local.json' });
  await expect(r.handle('copilot.rating.get', { versionId: identity.versionId, recordId: local.entries[0].record.id })).rejects.toThrow('仅社区');
  upstream.malformed = true; await expect(r.handle('copilot.rating.set', { ...identity, rating: 'like' })).rejects.toThrow('评价响应无效'); expect(posts()).toHaveLength(0);
});

test('the opt-out default migrates older workspaces without changing persistent request identity', async () => {
  const { r, queue } = await fixture(), workspace = await queue();
  expect(workspace.options.autoLikeOnSuccess).toBe(false);
  const old = structuredClone(workspace); delete old.options.autoLikeOnSuccess;
  expect(copilotWorkspaceIdentity(old)).toBe(copilotWorkspaceIdentity(workspace));
  r.store.put('copilot_workspace', 'Copilot', old);
  expect((await r.handle('copilot.workspace.get', { kind: 'Copilot' })).options.autoLikeOnSuccess).toBe(false);
});

test('historical flattened operator alternatives recover from immutable JSON without rewriting storage', async () => {
  const { r, record, queue } = await fixture(); await queue();
  const stored = r.store.get('copilot', record.id), version = r.store.get('copilot_version', record.versionId);
  for (const metadata of [stored, version.record]) for (const operator of metadata.operators) delete operator.group;
  r.store.put('copilot', record.id, stored); r.store.put('copilot_version', record.versionId, version);
  expect((await r.handle('copilot.get', { id: record.id })).operators.map((operator: any) => operator.group)).toEqual([undefined, '先锋任选', '先锋任选']);
  expect(r.store.get('copilot', record.id)).toEqual(stored); expect(r.store.get('copilot_version', record.versionId)).toEqual(version);
});

test.each(['stopped', 'failed'] as const)('an enabled automatic preference never reacts to %s execution', async outcome => {
  const { r, queue, start, worker, posts } = await fixture(); await queue({ autoLikeOnSuccess: true }); const run = await start();
  if (outcome === 'stopped') { await r.handle('run.stop', { id: run.id }); worker.safeIdle = true; worker.events.push({ type: 'status', running: false, pendingAsync: [] }); }
  else worker.callback(2, { what: 'Disconnect' });
  await r.tick(true); await r.copilot.drainFeedback(); expect((await r.handle('run.detail', { id: run.id })).status).toBe(outcome); expect(posts()).toHaveLength(0);
});

test.each([{ patch: {}, victory: true }, { patch: { autoLikeOnSuccess: true }, victory: false }, { patch: { autoLikeOnSuccess: true, loopTimes: 2 }, victory: true }])('automatic feedback requires the enabled snapshot and full confirmed victory %j', async ({ patch, victory }) => {
  const { r, queue, start, finish, posts } = await fixture(); await queue(patch); const run = await start(); await finish(victory);
  expect((await r.handle('run.detail', { id: run.id })).status).toBe('completed'); expect(posts()).toHaveLength(0);
});

test('confirmed success freezes its community identity and consent, and auto-likes at most once', async () => {
  const { r, queue, start, finish, record, posts } = await fixture(); await queue({ autoLikeOnSuccess: true }); const run = await start();
  await r.handle('copilot.delete', { id: record.id });
  // A later identical upload must not rewrite this run's frozen source.
  await r.handle('copilot.preview', { code: '456' });
  const draft = await r.handle('copilot.workspace.get', { kind: 'Copilot' }); draft.options.autoLikeOnSuccess = false; await r.handle('copilot.workspace.save', { workspace: draft });
  await finish(); expect(posts().map(item => item.body)).toEqual([{ id: 123, rating: 'Like' }]);
  const ended = await r.handle('run.detail', { id: run.id }); expect(ended.copilotEntries[0]).toMatchObject({ status: 'completed', verdict: 'success' });
  r.copilot.autoLikeConfirmed(run.id, r.store.get('run_snapshot', run.id), ended.copilotEntries); await r.copilot.drainFeedback(); expect(posts()).toHaveLength(1);
});

test.each(['upstream-dislike', 'local-dislike', 'failed-manual-dislike'] as const)('automatic likes preserve manual negative feedback: %s', async mode => {
  const { r, queue, start, finish, identity, ratings, upstream, posts } = await fixture();
  if (mode === 'upstream-dislike') ratings.set('123', 2);
  else {
    upstream.fail = mode === 'failed-manual-dislike';
    try { await r.handle('copilot.rating.set', { ...identity, rating: 'dislike' }); } catch { /* Intent remains protected if offline. */ }
    upstream.fail = false; ratings.set('123', 0); // Simulate a changed public IP.
  }
  const before = posts().length; await queue({ autoLikeOnSuccess: true }); await start(); await finish(); expect(posts()).toHaveLength(before);
});

test('feedback failure cannot turn confirmed execution into failure and is not automatically replayed', async () => {
  const { r, root, queue, start, worker, upstream, posts } = await fixture(); await queue({ autoLikeOnSuccess: true }); const run = await start();
  upstream.fail = true; worker.victory(); worker.complete(); await r.tick(true); await r.copilot.drainFeedback();
  const ended = await r.handle('run.detail', { id: run.id }); expect(ended.status).toBe('completed'); expect(ended.copilotEntries[0].verdict).toBe('success');
  expect(r.store.get('copilot_auto_rating', '123').status).toBe('failed'); expect(r.snapshot().events.some(event => event.message.includes('自动点赞失败'))).toBe(true);
  await r.close(); runtimes.splice(runtimes.indexOf(r), 1);
  const reopened = new Runtime(root, { calendar: { fetcher: null }, copilotHttp: (async () => { throw new Error('重启禁止重放评价'); }) as unknown as typeof fetch }); runtimes.push(reopened);
  reopened.copilot.autoLikeConfirmed(run.id, reopened.store.get('run_snapshot', run.id), ended.copilotEntries); await reopened.copilot.drainFeedback(); expect(posts()).toHaveLength(0);
});

test('ambiguous identical uploads cannot be auto-rated, while explicit preview source remains rateable', async () => {
  const { r, queue, start, finish, posts } = await fixture(); const other = await r.handle('copilot.preview', { code: '456' });
  await queue({ autoLikeOnSuccess: true }); await start(); await finish(); expect(posts()).toHaveLength(0);
  const record = other.entries[0].record;
  await expect(r.handle('copilot.rating.get', { versionId: record.versionId })).rejects.toThrow('多个社区来源');
  await r.handle('copilot.rating.set', { versionId: record.versionId, recordId: record.id, rating: 'like' }); expect(posts()[0].body.id).toBe(456);
});

test('identical local content cannot inherit automatic credit from a community preview', async () => {
  const { r, queue, start, finish, posts } = await fixture();
  const local = await r.handle('copilot.preview', { content, name: 'local.json' }); await r.handle('copilot.import', { previewId: local.id });
  await queue({ autoLikeOnSuccess: true }); await start(); await finish(); expect(posts()).toHaveLength(0);
});

test('manual dislike arriving during automatic preflight wins without an automatic positive POST', async () => {
  const { r, queue, start, worker, upstream, identity, posts } = await fixture(); await queue({ autoLikeOnSuccess: true }); await start();
  let arrived!: () => void, release!: () => void;
  const reading = new Promise<void>(resolve => { arrived = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  upstream.beforeGet = async () => { upstream.beforeGet = undefined; arrived(); await gate; };
  worker.victory(); worker.complete(); await r.tick(true); await reading;
  const manual = r.handle('copilot.rating.set', { ...identity, rating: 'dislike' }); release(); await manual; await r.copilot.drainFeedback();
  expect(posts().map(item => item.body.rating)).toEqual(['Dislike']);
});

test('a successful write response without confirmed rating never reports an automatic like as completed', async () => {
  const { r, queue, start, finish, upstream, posts } = await fixture(); await queue({ autoLikeOnSuccess: true }); await start(); upstream.ignoreWrites = true; await finish();
  expect(posts()).toHaveLength(1); expect(r.store.get('copilot_auto_rating', '123').status).toBe('failed');
  expect(r.snapshot().events.some(event => event.message.includes('尚未确认点赞结果'))).toBe(true);
});

test('older completed positive feedback cannot erase a newer failed manual dislike intent', async () => {
  const { r, identity, upstream, ratings, queue, start, finish, posts } = await fixture();
  let arrived!: () => void, release!: () => void;
  const posting = new Promise<void>(resolve => { arrived = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  upstream.beforePost = async body => { if (body.rating === 'Like') { arrived(); await gate; } else if (body.rating === 'Dislike') throw new Error('合成点踩网络失败'); };
  const like = r.handle('copilot.rating.set', { ...identity, rating: 'like' }); await posting;
  const dislike = r.handle('copilot.rating.set', { ...identity, rating: 'dislike' });
  const rejectedDislike = dislike.then(() => undefined, (cause: Error) => cause);
  release(); await like; expect((await rejectedDislike)?.message).toContain('合成点踩网络失败');
  expect(r.store.get('copilot_manual_rating', '123').rating).toBe('dislike');
  ratings.set('123', 0); upstream.beforePost = undefined; const before = posts().length;
  await queue({ autoLikeOnSuccess: true }); await start(); await finish(); expect(posts()).toHaveLength(before);
});

test.each(['GET', 'POST'] as const)('shutdown aborts stalled automatic %s and skips queued feedback promptly', async stage => {
  const { r, root, identity, upstream, queue, start, worker, posts } = await fixture(); await queue({ autoLikeOnSuccess: true }); const run = await start();
  let arrived!: () => void, release!: () => void;
  const waiting = new Promise<void>(resolve => { arrived = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const stall = async () => { arrived(); await gate; };
  if (stage === 'GET') upstream.beforeGet = stall; else upstream.beforePost = stall;
  worker.victory(); worker.complete(); await r.tick(true); await waiting;
  const snapshot = r.store.get('run_snapshot', run.id), ended = await r.handle('run.detail', { id: run.id });
  const queued = r.handle('copilot.rating.set', { ...identity, rating: 'dislike' });
  const cancelled = queued.then(() => undefined, (cause: Error) => cause);
  const before = performance.now(); await r.close(); expect(performance.now() - before).toBeLessThan(1000); expect((await cancelled)?.message).toContain('退出');
  expect(posts()).toHaveLength(stage === 'POST' ? 1 : 0);
  await expect(r.handle('copilot.rating.get', identity)).rejects.toThrow('退出');
  await expect(r.handle('copilot.rating.set', { ...identity, rating: 'like' })).rejects.toThrow('退出');
  release(); // A client ignoring AbortSignal cannot change the closed business store later.
  runtimes.splice(runtimes.indexOf(r), 1);
  let replayed = false;
  const reopened = new Runtime(root, { calendar: { fetcher: null }, copilotHttp: (async () => { replayed = true; throw new Error('禁止重放未知评价'); }) as unknown as typeof fetch }); runtimes.push(reopened);
  expect(reopened.store.get('copilot_auto_rating', '123').status).toBe('unknown');
  expect(reopened.store.get('copilot_manual_rating', '123').rating).toBe('dislike');
  reopened.copilot.autoLikeConfirmed(run.id, snapshot, ended.copilotEntries); await reopened.copilot.drainFeedback(); expect(replayed).toBe(false);
});

test('shutdown cancels an automatic like still queued behind a rating read without replaying its pending intent', async () => {
  const { r, root, identity, upstream, queue, start, worker, posts } = await fixture(); await queue({ autoLikeOnSuccess: true }); await start();
  let arrived!: () => void, release!: () => void;
  const waiting = new Promise<void>(resolve => { arrived = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  upstream.beforeGet = async () => { arrived(); await gate; };
  const reading = r.handle('copilot.rating.get', identity).then(() => undefined, (cause: Error) => cause); await waiting;
  worker.victory(); worker.complete(); await r.tick(true);
  expect(r.store.get('copilot_auto_rating', '123').status).toBe('pending');
  const before = performance.now(); await r.close(); expect(performance.now() - before).toBeLessThan(1000); expect((await reading)?.message).toContain('退出'); expect(posts()).toHaveLength(0);
  release(); runtimes.splice(runtimes.indexOf(r), 1);
  const reopened = new Runtime(root, { calendar: { fetcher: null } }); runtimes.push(reopened);
  expect(reopened.store.get('copilot_auto_rating', '123').status).toBe('pending');
});
