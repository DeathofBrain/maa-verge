import { expect, test } from 'bun:test';
import { createAtomicCapabilityRegistry } from '@backend/modules/atomic/registry';
import { atomicInputValidators } from '@contracts/validators.js';
import type { AtomicResourceProfile } from '@backend/modules/atomic/types';
const profile: AtomicResourceProfile = {
  id: 'unavailable',
  clientType: 'Official',
  available: false,
  diagnostics: ['资源未安装'],
  rules: {},
  card: null,
  actions: {},
  sources: [],
};

test('registered implementations and authoritative input schemas form one catalog across all four layers', async () => {
  let calls = 0;
  const registry = createAtomicCapabilityRegistry(
    {
      execute: async () => {
        calls++;
        return { accepted: true, nativeSuccess: true };
      },
    },
    { profile },
  );
  const items = registry.list();
  expect(items.map((item) => item.id).sort()).toEqual(Object.keys(atomicInputValidators).sort());
  expect(new Set(items.map((item) => item.layer))).toEqual(
    new Set(['operation', 'observation', 'game', 'workflow']),
  );
  expect(calls).toBe(0);
  expect(items.find((item) => item.id === 'operation.click')!.available).toBe(true);
  expect(items.find((item) => item.id === 'workflow.infrast.overview_shift')!.available).toBe(
    false,
  );
  expect(
    (await registry.execute('operation.click', { frameId: 'f', x: 0, y: 0, shell: 'arbitrary' }))
      .status,
  ).toBe('failed');
  expect(
    (await registry.execute('operation.press_key', { frameId: 'f', key: 'home' })).status,
  ).toBe('failed');
  expect(
    (
      await registry.execute('operation.long_press', {
        frameId: 'f',
        x: 0,
        y: 0,
        durationMs: 10001,
      })
    ).status,
  ).toBe('failed');
  expect(calls).toBe(0);
  expect(
    (await registry.execute('operation.click', { frameId: 'f', x: 0, y: 0 })).nativeSuccess,
  ).toBe(true);
  expect(calls).toBe(1);
});
