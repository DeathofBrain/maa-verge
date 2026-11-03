/** 自定义基建文件的宿主边界：保存原字节、拒绝链接，并把正式启动固定到当时的完整快照。 */
import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync, mkdirSync, symlinkSync, linkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { snapshotLegacyInputs } from '@backend/modules/plans/legacy-inputs';
import { compileLegacyTask } from '@maaverge/automation';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';
import { frameworkFixtureOptions } from './framework-fixture';

const roots: string[] = [],
  runtimes: Runtime[] = [];
const root = () => {
  const value = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-legacy-input-'));
  roots.push(value);
  return value;
};
const task = (filename: string) => ({
  type: 'Infrast' as const,
  enabled: true,
  params: {
    mode: 10000,
    filename,
    plan_index: 0,
    facility: ['Mfg'],
    drones: '_NotUse',
    dorm_notstationed_enabled: false,
    dorm_trust_enabled: false,
    replenish: false,
  },
});
const document = (name: string) => ({
  plans: [{ name: '原计划', rooms: { manufacture: [{ operators: [name, '乙', '丙'] }] } }],
});
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

test('UTF-8 BOM, unknown metadata and repeated file references preserve exact source bytes', async () => {
  const filename = path.join(root(), 'plan.json'),
    value = { ...document('甲'), description: { future: true } };
  const bytes = Buffer.from('\ufeff' + JSON.stringify(value, null, 2) + '\n');
  writeFileSync(filename, bytes);
  const inputs = await snapshotLegacyInputs([task(filename), task(filename)]);
  expect(inputs.errors).toEqual({});
  expect(Object.keys(inputs.plans)).toEqual([filename]);
  expect(inputs.plans[filename]).toEqual({
    document: value,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  expect(readFileSync(filename)).toEqual(bytes);
});

test('invalid, oversized and linked custom files block without rewriting their contents', async () => {
  const directory = root(),
    ordinary = path.join(directory, 'ordinary.json');
  writeFileSync(ordinary, JSON.stringify(document('甲')));
  const linked = path.join(directory, 'linked.json');
  symlinkSync(ordinary, linked);
  const parent = path.join(directory, 'parent');
  mkdirSync(parent);
  writeFileSync(path.join(parent, 'file.json'), '{}');
  symlinkSync(parent, path.join(directory, 'alias'));
  const hard = path.join(directory, 'hard.json');
  linkSync(ordinary, hard);
  const invalid = path.join(directory, 'invalid.json'),
    huge = path.join(directory, 'huge.json'),
    utf8 = path.join(directory, 'utf8.json');
  writeFileSync(invalid, '{');
  writeFileSync(huge, Buffer.alloc(2 * 1024 * 1024 + 1));
  writeFileSync(utf8, Buffer.from([0xff]));
  for (const filename of [
    linked,
    path.join(directory, 'alias', 'file.json'),
    hard,
    invalid,
    huge,
    utf8,
    path.join(directory, 'missing.json'),
  ]) {
    const inputs = await snapshotLegacyInputs([task(filename)]);
    expect(inputs.plans[filename]).toBeUndefined();
    expect(inputs.errors[filename]).toBeTruthy();
  }
  expect(readFileSync(ordinary, 'utf8')).toBe(JSON.stringify(document('甲')));
  const disabled = { ...task(huge), enabled: false };
  expect(await snapshotLegacyInputs([disabled])).toEqual({ plans: {}, errors: {} });
});

test('formal admission rereads changes after preflight and retains an immutable document for execution', async () => {
  const directory = root(),
    filename = path.join(directory, 'plan.json');
  writeFileSync(filename, JSON.stringify(document('甲')));
  const runtime = new Runtime(directory, frameworkFixtureOptions());
  runtimes.push(runtime);
  // 本测试只隔离资源能力查验和后续设备执行；保留实际整表编译与文件快照的准入顺序。
  runtime.executionPreflight = async (params, inputs) =>
    runtime['compatibility'](
      params.tasks!,
      params.deviceId,
      params.force,
      params.clientType,
      inputs ?? (await snapshotLegacyInputs(params.tasks!)),
    );
  let admitted: any;
  runtime['beginExecution'] = async (_params, snapshot) => {
    admitted = snapshot;
    return { id: 'captured' } as any;
  };
  await runtime.handle('plan.save', {
    plan: { id: 'custom', name: '自定义', tasks: [task(filename)] },
  });
  expect((await runtime.executionPreflight({ tasks: [task(filename)] })).supported).toBe(true);
  writeFileSync(filename, JSON.stringify(document('丁')));
  await runtime.startRun({ planId: 'custom', deviceId: 'synthetic', requestId: 'snapshot' });
  const snapshot = admitted.legacyInputs.plans[filename];
  expect(snapshot.document).toEqual(document('丁'));
  writeFileSync(filename, JSON.stringify(document('戊')));
  const compiled = compileLegacyTask(task(filename), { customInfrastPlan: snapshot });
  expect(compiled.supported).toBe(true);
  expect(JSON.stringify(compiled.steps)).toContain('丁');
  expect(JSON.stringify(compiled.steps)).not.toContain('戊');
  writeFileSync(filename, '{');
  await expect(
    runtime.startRun({ planId: 'custom', deviceId: 'synthetic', requestId: 'changed' }),
  ).rejects.toMatchObject({ code: -32010 });
  expect(readFileSync(filename, 'utf8')).toBe('{');
});
