import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Run } from '../../../packages/contracts/src/types';
import { Runtime } from '../src/runtime';

const roots: string[] = [], runtimes: Runtime[] = [];
function fresh() {
  const root = mkdtempSync(path.join(tmpdir(), 'maaverge-snapshot-runs-')); roots.push(root);
  const runtime = new Runtime(root, { calendar: { fetcher: null } }); runtimes.push(runtime);
  return runtime;
}
function putRun(runtime: Runtime, id: string, status: Run['status']): Run {
  const startedAt = '2026-10-23T00:00:00.000Z';
  const run: Run = {
    id, planId: 'synthetic-plan', planName: '合成任务表', deviceId: `synthetic-${id}`, status,
    progress: status === 'completed' ? 100 : 25, message: id, startedAt,
    finishedAt: status === 'running' ? null : startedAt,
    tasks: [{ index: 0, type: 'Award', status, message: '仅详情读取的任务证据', startedAt, finishedAt: status === 'running' ? null : startedAt, drops: [], infrastructure: [], artifacts: [] }],
  };
  runtime.store.put('run', id, run);
  return run;
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('snapshot keeps every active run plus the 100 latest ended runs in stable creation order', async () => {
  const runtime = fresh();
  const early = putRun(runtime, 'early-active', 'running');
  putRun(runtime, 'early-ended', 'completed');
  const terminalStatuses = ['completed', 'failed', 'stopped'] as const;
  for (let index = 0; index < 125; index++) {
    putRun(runtime, `ended-${index}`, terminalStatuses[index % terminalStatuses.length]);
    if (index === 60) putRun(runtime, 'middle-active', 'running');
  }
  putRun(runtime, 'latest-active', 'running');
  // Updating an old row must not promote it or remove its original task evidence.
  runtime.store.put('run', early.id, { ...early, message: '长任务仍在执行' });

  const snapshot = runtime.snapshot();
  expect(snapshot.runs).toHaveLength(103);
  expect(snapshot.runs.filter(run => run.status === 'running').map(run => run.id)).toEqual(['latest-active', 'middle-active', 'early-active']);
  expect(snapshot.runs.filter(run => run.status !== 'running')).toHaveLength(100);
  expect(snapshot.runs.map(run => run.id)).toEqual([
    'latest-active', ...Array.from({ length: 64 }, (_, index) => `ended-${124 - index}`),
    'middle-active', ...Array.from({ length: 36 }, (_, index) => `ended-${60 - index}`), 'early-active',
  ]);
  expect(new Set(snapshot.runs.map(run => run.id)).size).toBe(snapshot.runs.length);
  expect(snapshot.runs.every(run => !Object.hasOwn(run, 'tasks'))).toBe(true);
  expect(snapshot.runs.at(-1)?.message).toBe('长任务仍在执行');
  expect((await runtime.handle('run.detail', { id: early.id })).tasks).toEqual(early.tasks);
  expect(runtime.snapshot().runs).toEqual(snapshot.runs);
});

test('ending an old active run releases it from the snapshot without deleting persistent history', () => {
  const runtime = fresh();
  const early = putRun(runtime, 'long-running', 'running');
  for (let index = 0; index < 110; index++) putRun(runtime, `newer-${index}`, 'completed');
  expect(runtime.snapshot().runs.at(-1)?.id).toBe(early.id);
  runtime.store.put('run', early.id, { ...early, status: 'failed', finishedAt: early.startedAt });
  const runs = runtime.snapshot().runs;
  expect(runs).toHaveLength(100);
  expect(runs[0].id).toBe('newer-109');
  expect(runs.at(-1)?.id).toBe('newer-10');
  expect(runs.some(run => run.id === early.id)).toBe(false);
  expect(runtime.store.get('run', early.id).status).toBe('failed');
  expect(runtime.store.all('run')).toHaveLength(111);
});

test('small snapshots retain all terminal states once and omit task details', () => {
  const runtime = fresh();
  const statuses = ['running', 'completed', 'failed', 'stopped', 'running'] as const;
  statuses.forEach((status, index) => putRun(runtime, `run-${index}`, status));
  const runs = runtime.snapshot().runs;
  expect(runs.map(run => run.id)).toEqual(['run-4', 'run-3', 'run-2', 'run-1', 'run-0']);
  expect(runs.map(run => run.status)).toEqual([...statuses].reverse());
  expect(new Set(runs.map(run => run.id)).size).toBe(statuses.length);
  expect(runs.every(run => !Object.hasOwn(run, 'tasks'))).toBe(true);
});
