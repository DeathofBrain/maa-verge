import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '../src/app/runtime';
import { parsePlan, parseSettings } from '../src/modules/settings/models';
import { planAllowsDevice, planDeviceIds } from '../../../packages/contracts/src/plan-devices';
import { validatePlan } from '../../../packages/contracts/src/task-policy';

const roots: string[] = [],
  runtimes: Runtime[] = [];
const input = { id: 'shared', name: '共享任务表', tasks: [{ type: 'Award' }] };
function runtime(root = mkdtempSync(path.join(tmpdir(), 'maaverge-plan-bindings-'))) {
  roots.push(root);
  const value = new Runtime(root, { calendar: { fetcher: null } });
  runtimes.push(value);
  value.store.put(
    'settings',
    'main',
    parseSettings({ autoConnect: false, autoUpdateCore: false, autoUpdateResource: false }),
  );
  return value;
}
afterEach(async () => {
  for (const value of runtimes.splice(0)) await value.close();
  for (const root of new Set(roots.splice(0))) rmSync(root, { recursive: true, force: true });
});

test('legacy plans normalize bindings while explicit empty lists override legacy fields and invalid relations are rejected', () => {
  expect(parsePlan(input)).toMatchObject({ deviceId: null, deviceIds: [] });
  const legacy = parsePlan({ ...input, deviceId: 'old-device' });
  expect(planDeviceIds(legacy)).toEqual(['old-device']);
  expect(planAllowsDevice(legacy, 'other-device')).toBe(false);
  const empty = parsePlan({ ...input, deviceId: 'old-device', deviceIds: [] });
  expect(empty).toMatchObject({ deviceId: null, deviceIds: [] });
  expect(planAllowsDevice(empty, 'other-device')).toBe(true);
  expect(
    parsePlan({ ...input, deviceId: 'obsolete', deviceIds: ['first', 'second'] }),
  ).toMatchObject({ deviceId: 'first', deviceIds: ['first', 'second'] });
  for (const deviceIds of [
    null,
    'first',
    [''],
    ['a', 'a'],
    [1],
    ['a'.repeat(201)],
    Array.from({ length: 101 }, (_, index) => String(index)),
  ]) {
    expect(() => parsePlan({ ...input, deviceIds })).toThrow();
    expect(() => validatePlan({ ...legacy, deviceIds } as any, parseSettings())).toThrow();
  }
});

test('binding edits persist across restart, legacy saves preserve extra links, and explicit unbind clears the relation', async () => {
  const first = runtime();
  // Simulate an old on-disk row without rewriting its business identity.
  first.store.put('plan', input.id, {
    ...parsePlan(input),
    deviceIds: undefined,
    deviceId: 'first',
  });
  expect(first.snapshot().plans[0]).toMatchObject({ deviceId: 'first', deviceIds: ['first'] });
  const saved = await first.handle('plan.save', {
    plan: { ...input, deviceIds: ['first', 'second'] },
  });
  const { deviceIds: _, ...legacy } = saved;
  const updated = await first.handle('plan.save', { plan: { ...legacy, name: '旧客户端改名' } });
  expect(updated.deviceIds).toEqual(['first', 'second']);
  await first.close();
  runtimes.splice(runtimes.indexOf(first), 1);
  const reopened = runtime(first.root);
  expect(reopened.snapshot().plans[0]).toMatchObject({
    name: '旧客户端改名',
    deviceIds: ['first', 'second'],
  });
  const changed = await reopened.handle('plan.save', { plan: { ...legacy, deviceId: 'third' } });
  expect(changed.deviceIds).toEqual(['third']);
  const cleared = await reopened.handle('plan.save', { plan: { ...changed, deviceIds: [] } });
  expect(cleared).toMatchObject({ deviceId: null, deviceIds: [] });
});

test('schedules accept any bound device and only removed targets are disabled without reassignment', async () => {
  const r = runtime();
  for (const id of ['first', 'second', 'third'])
    r.store.put('device', id, {
      id,
      name: id,
      address: id,
      state: 'offline',
      coreVersion: null,
      resourceVersion: null,
    });
  const plan = await r.handle('plan.save', { plan: { ...input, deviceIds: ['first', 'second'] } });
  const save = (deviceId: string) =>
    r.handle('schedule.save', {
      schedule: {
        id: `schedule-${deviceId}`,
        planId: plan.id,
        deviceId,
        hour: 4,
        minute: 0,
        enabled: true,
      },
    });
  await save('first');
  await save('second');
  await expect(save('third')).rejects.toThrow('绑定范围');
  await r.handle('plan.save', { plan: { ...plan, deviceIds: ['second'] } });
  const schedules = (await r.handle('schedule.list', {})).schedules;
  expect(schedules.find((item: any) => item.deviceId === 'first')).toMatchObject({
    enabled: false,
    disabledReason: '定时设备不在任务表绑定范围内',
    deviceId: 'first',
  });
  expect(schedules.find((item: any) => item.deviceId === 'second')).toMatchObject({
    enabled: true,
    disabledReason: null,
  });
  await r.handle('device.delete', { deviceIds: ['second'] });
  expect(r.snapshot().plans[0].deviceIds).toEqual(['second']);
  expect(
    (await r.handle('schedule.list', {})).schedules.find((item: any) => item.deviceId === 'second'),
  ).toMatchObject({ enabled: false, disabledReason: '关联设备已删除', deviceId: 'second' });
});
