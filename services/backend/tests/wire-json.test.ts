import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { processRequest } from '@backend/transport/json-rpc';
import { parsePlan, parseSettings } from '@backend/modules/settings/models';
import { nativeTask, validatePlan } from '@backend/modules/plans/task-policy';
import { Runtime } from '@backend/app/runtime';
import { Store } from '@backend/infrastructure/storage/storage';
import { CoreWorker } from '@backend/infrastructure/native/worker';
import {
  isWireFloat,
  parseWireJson,
  stringifyWireJson,
  wireNumberToken,
} from '@backend/shared/wire-json';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

type Fixture = { name: string; raw: string; operation?: 'settings' | 'parsePlan'; code?: number };
const fixtures: Fixture[] = [];
const rawPlan = (type: string, params: string, enabled = true) =>
  `{"name":"数值词法对照","tasks":[{"type":${JSON.stringify(type)},"params":${params},"enabled":${enabled}}]}`;
const fields: Array<[string, string, number]> = [
  ['Fight', '{"times":$}', 1],
  ['Fight', '{"series":$}', 1],
  ['Fight', '{"drops":{"item":$}}', 1],
  ['Recruit', '{"times":$}', 0],
  ['Recruit', '{"select":[$]}', 3],
  ['Recruit', '{"confirm":[$]}', 3],
  ['Recruit', '{"extra_tags_mode":$}', 0],
  ['Recruit', '{"recruitment_time":{"3":$}}', 60],
  ['Infrast', '{"mode":$}', 0],
  ['Infrast', '{"mode":10000,"filename":"plan.json","plan_index":$}', 0],
  ['Roguelike', '{"mode":$}', 0],
  ['Reclamation', '{"mode":$}', 0],
  ['Copilot', '{"copilot_list":[{"filename":"task.json","id":$}]}', 1],
  ['ParadoxCopilot', '{"list":[{"filename":"task.json","id":$}]}', 1],
  ['Copilot', '{"filename":"task.json","loop_times":$}', 1],
  ['ParadoxCopilot', '{"filename":"task.json","loop_times":$}', 1],
  ['SSSCopilot', '{"filename":"task.json","loop_times":$}', 1],
  ['VideoRecognition', '{"filename":"task.mp4","loop_times":$}', 1],
  ['OperProgress', '{"plans":[{"name":"阿米娅","elite":$}]}', 1],
  ['OperProgress', '{"plans":[{"name":"阿米娅","skill_level":$}]}', 2],
  ['OperProgress', '{"plans":[{"name":"阿米娅","skill_mastery":[0,$,0]}]}', 0],
  ['Award', '{"formation_index":$}', 0],
  ...['stone', 'medicine', 'expiring_medicine', 'medicine_expire_days', 'expedite_times'].map(
    (key) => ['Fight', `{"${key}":$}`, 0] as [string, string, number],
  ),
];
for (const [type, params, value] of fields) {
  fixtures.push({
    name: `${type} ${params} accepts integer token`,
    raw: rawPlan(type, params.replace('$', String(value))),
  });
  for (const token of [`${value}.0`, `${value}e0`])
    fixtures.push({
      name: `${type} ${params} rejects float token ${token}`,
      raw: rawPlan(type, params.replace('$', token)),
      code: -32010,
    });
}
for (const token of ['-0.0', '-0e0', '0.0', '0e0'])
  fixtures.push({
    name: `strict zero rejects ${token}`,
    raw: rawPlan('Fight', `{"stone":${token}}`),
    code: -32010,
  });
fixtures.push({
  name: 'integer negative zero stays an integer',
  raw: rawPlan('Fight', '{"stone":-0}'),
});
fixtures.push({
  name: 'disabled specific float remains skipped',
  raw: rawPlan('Fight', '{"times":1.0,"medicine":0e0}', false),
});
for (const token of ['0.0', '1e0', '3e-1', '-0.0'])
  fixtures.push({
    name: `threshold accepts ${token}`,
    raw: rawPlan('Infrast', `{"threshold":${token}}`),
  });
for (const token of ['1.0', '1e0', '-0.0', '1e-400', '9007199254740993', '1e20'])
  fixtures.push({
    name: `unknown extension accepts ${token}`,
    raw: rawPlan('Fight', `{"extension":{"numbers":[${token}]}}`),
  });
for (const token of ['1e400', '-1e400'])
  fixtures.push({
    name: `nonfinite token rejects ${token}`,
    raw: rawPlan('Fight', `{"extension":${token}}`),
    code: -32010,
  });
for (const token of ['1.0', '1e0', '0.0', '-0e0']) {
  fixtures.push({
    name: `model budget and boolean normalize ${token}`,
    raw: `{"budgets":{"medicine":${token}},"autoConnect":${token}}`,
    operation: 'settings',
  });
  fixtures.push({
    name: `plan budget normalizes ${token}`,
    raw: rawPlan('Fight', '{}').replace('"tasks":', `"budgets":{"medicine":${token}},"tasks":`),
    operation: 'parsePlan',
  });
}

// Unknown extensions preserve canonical serialized byte accounting, including
// fractional markers, signed zero and exponent thresholds.
for (const [token, serializedText] of [
  ['1.00', '1.0'],
  ['1e0', '1.0'],
  ['-0.0', '-0.0'],
  ['-0', '0'],
  ['1e-400', '0.0'],
  ['0.00001', '1e-05'],
  ['0.0001', '0.0001'],
  ['10000000000000000.0', '1e+16'],
  ['1000000000000000.0', '1000000000000000.0'],
  ['1e20', '1e+20'],
  ['9007199254740993', '9007199254740993'],
] as const) {
  const overhead = Buffer.byteLength(`{"extension": [${serializedText}], "padding": ""}`);
  for (const extra of [0, 1])
    fixtures.push({
      name: `${token} canonical serialized size ${extra ? 'above' : 'at'} bound`,
      raw: rawPlan(
        'Fight',
        `{"extension":[${token}],"padding":"${'x'.repeat(512 * 1024 - overhead + extra)}"}`,
      ),
      code: extra ? -32010 : undefined,
    });
}

function evaluate(fixture: Fixture): any {
  try {
    const input = parseWireJson(fixture.raw);
    // Compare normalized values as they appear on the JSON transport. JS -0
    // serializes as 0 after integer budget normalization.
    if (fixture.operation === 'settings')
      return { ok: true, value: JSON.parse(JSON.stringify(parseSettings(input))) };
    const plan = parsePlan(input);
    if (fixture.operation === 'parsePlan')
      return { ok: true, value: JSON.parse(JSON.stringify(plan)) };
    validatePlan(plan, parseSettings());
    return { ok: true };
  } catch (error: any) {
    return { ok: false, code: error.code };
  }
}
for (const fixture of fixtures)
  test(fixture.name, () => {
    const result = evaluate(fixture);
    expect(result.ok).toBe(fixture.code === undefined);
    if (fixture.code !== undefined) expect(result.code).toBe(fixture.code);
  });

test('floating-point model scalars normalize to fixed integer and boolean values', () => {
  for (const [token, expected] of [
    ['1.0', 1],
    ['1e0', 1],
    ['0.0', 0],
    ['-0e0', 0],
  ] as const) {
    const settings = evaluate({
      name: token,
      raw: `{"budgets":{"medicine":${token}},"autoConnect":${token}}`,
      operation: 'settings',
    });
    expect(settings.value.budgets).toEqual({ medicine: expected, originium: 0, expedited: 0 });
    expect(settings.value.autoConnect).toBe(Boolean(expected));
    const plan = evaluate({
      name: token,
      raw: rawPlan('Fight', '{}').replace('"tasks":', `"budgets":{"medicine":${token}},"tasks":`),
      operation: 'parsePlan',
    });
    expect(plan.value.budgets).toEqual({ medicine: expected, originium: 0, expedited: 0 });
  }
});

test('numeric token metadata is external, nested, and retained by plan normalization', () => {
  const input = parseWireJson(
    rawPlan('Recruit', '{"select":[3e0],"extension":{"integer":1,"float":1.0}}'),
  );
  const params = input.tasks[0].params,
    parsed = parsePlan(input);
  expect(parsed.tasks[0].params).toBe(params);
  expect(isWireFloat(params.select, 0)).toBe(true);
  expect(wireNumberToken(params.extension, 'integer')?.source).toBe('1');
  expect(isWireFloat(params.extension, 'integer')).toBe(false);
  expect(isWireFloat(params.extension, 'float')).toBe(true);
  expect(Object.getOwnPropertySymbols(params.extension)).toEqual([]);
  expect(Object.keys(params.extension)).toEqual(['integer', 'float']);
  expect(JSON.stringify(params.extension)).toBe('{"integer":1,"float":1}');
  params.extension.float = 2;
  expect(wireNumberToken(params.extension, 'float')).toBeUndefined();
});
test('duplicate properties use their final token and independent requests never share provenance', () => {
  const integer = parseWireJson('{"n":1.0,"n":1}'),
    float = parseWireJson('{"n":1,"n":1e0}');
  expect(isWireFloat(integer, 'n')).toBe(false);
  expect(isWireFloat(float, 'n')).toBe(true);
  expect(isWireFloat(JSON.parse('{"n":1}'), 'n')).toBe(false);
});
test('wire serialization keeps original numeric tokens and native JSON behavior', () => {
  const value = parseWireJson('{"first":[1.0,1e0,-0,9007199254740993],"second":{"n":2.0}}');
  expect(stringifyWireJson(value)).toBe(
    '{"first":[1.0,1e0,-0,9007199254740993],"second":{"n":2.0}}',
  );
  value.second.n = 3;
  expect(stringifyWireJson(value)).toContain('"n":3');
  const ordinary = {
    '2': 'numeric key',
    z: undefined,
    date: new Date(0),
    values: [undefined, NaN, Infinity],
  };
  expect(stringifyWireJson(ordinary)).toBe(JSON.stringify(ordinary));
  const cyclic: any = {};
  cyclic.self = cyclic;
  expect(() => stringifyWireJson(cyclic)).toThrow();
});
test('native task cloning retains extension tokens without mutating the saved task', () => {
  const task = parsePlan(parseWireJson(rawPlan('Fight', '{"extension":[1.0,9007199254740993]}')))
    .tasks[0];
  const cloned = nativeTask(task);
  expect(cloned).not.toBe(task);
  expect(cloned.params).not.toBe(task.params);
  expect(stringifyWireJson(cloned.params)).toContain('"extension":[1.0,9007199254740993]');
  expect(task.params).not.toHaveProperty('medicine');
});
test('worker NDJSON requests retain extension numeric tokens', async () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-wire-worker-'));
  let worker: CoreWorker | undefined;
  try {
    const peer = `
      const {createInterface}=require('node:readline'); let configured=false;
      createInterface({input:process.stdin}).on('line',raw=>{
        const message=JSON.parse(raw);
        const response=configured?{type:'response',id:message.id,result:{raw},protocolVersion:1}:{type:'ready',protocolVersion:1};
        configured=true;process.stdout.write(JSON.stringify(response)+'\\n');
      });`;
    worker = await CoreWorker.start({ userDir: root }, { command: [process.execPath, '-e', peer] });
    const task = nativeTask(
      parsePlan(parseWireJson(rawPlan('Fight', '{"extension":[1.0,9007199254740993]}'))).tasks[0],
    );
    const result = await worker.task(task);
    expect(result.raw).toContain('"extension":[1.0,9007199254740993]');
  } finally {
    await worker?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test('storage retains old numeric tokens, object ordering and event values after reopening', () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-wire-store-'));
  let store: Store | undefined;
  try {
    store = new Store(root);
    const raw = '{"float":1.0,"integer":9007199254740993,"nested":[1e0]}';
    // Existing TEXT JSON can contain distinct floating-point tokens.
    store.db.query('INSERT INTO objects VALUES(?,?,?)').run('numeric', 'old', raw);
    store.put('numeric', 'new', parseWireJson(raw));
    store.event('numeric', 'numeric', parseWireJson(raw));
    store.close();
    store = new Store(root);
    expect(stringifyWireJson(store.get('numeric', 'old'))).toBe(raw);
    const all = store.all('numeric');
    expect(all).toHaveLength(2);
    for (const item of all) expect(stringifyWireJson(item)).toBe(raw);
    expect(stringifyWireJson(store.events()[0].data)).toBe(raw);
    store.put('numeric', 'old', all[0]);
    expect((store.db.query('SELECT value FROM objects WHERE id=?').get('old') as any).value).toBe(
      raw,
    );
  } finally {
    store?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test('a disabled floating-point task remains invalid when enabled after runtime restart', async () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-wire-restart-'));
  let runtime: Runtime | undefined;
  try {
    runtime = new Runtime(root);
    const saved = await runtime.handle('plan.save', {
      plan: parseWireJson(rawPlan('Fight', '{"times":1.0}', false)),
    });
    await runtime.close();
    runtime = new Runtime(root);
    const plan = runtime.store.get('plan', saved.id);
    expect(isWireFloat(plan.tasks[0].params, 'times')).toBe(true);
    plan.tasks[0].enabled = true;
    await expect(runtime.handle('plan.save', { plan })).rejects.toMatchObject({ code: -32010 });
    plan.tasks[0].params.times = 2;
    await expect(runtime.handle('plan.save', { plan })).resolves.toMatchObject({
      tasks: [{ params: { times: 2 } }],
    });
  } finally {
    await runtime?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test('invalid JSON still fails parsing', () => {
  for (const text of ['{"n":NaN}', '{"n":01}', '{"n":1.}', '{"n":1e}'])
    expect(() => parseWireJson(text)).toThrow();
});
test('RPC IDs require integer tokens', async () => {
  let calls = 0;
  const runtime = {
    handle: async () => {
      calls++;
      return true;
    },
  };
  for (const token of ['1.0', '1e0', '-0.0']) {
    const result = await processRequest(
      runtime,
      parseWireJson(`{"jsonrpc":"2.0","method":"test","id":${token}}`),
    );
    expect(result.error.code).toBe(-32600);
  }
  expect(calls).toBe(0);
  expect(
    await processRequest(runtime, parseWireJson('{"jsonrpc":"2.0","method":"test","id":1}')),
  ).toEqual({ jsonrpc: '2.0', id: 1, result: true });
});
test('stdio parses raw numeric tokens before application validation', () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-wire-json-'));
  try {
    const input =
      [
        `{"jsonrpc":"2.0","method":"plan.save","id":1,"params":{"plan":${rawPlan('Fight', '{"times":1.0}')}}}`,
        `{"jsonrpc":"2.0","method":"plan.save","id":2,"params":{"plan":${rawPlan('Fight', '{"times":1}')}}}`,
        `{"jsonrpc":"2.0","method":"plan.save","id":3,"params":{"plan":${rawPlan('Infrast', '{"threshold":1.0}')}}}`,
      ].join('\n') + '\n';
    const result = spawnSync(
      process.execPath,
      [path.resolve(import.meta.dir, '../src/entry.ts'), '--mode', 'native', '--data-dir', root],
      {
        input,
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    expect(result.status, result.stderr).toBe(0);
    const responses = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((item) => item.id !== undefined);
    expect(responses.find((item) => item.id === 1).error.code).toBe(-32010);
    expect(responses.find((item) => item.id === 2).result.tasks[0].params.times).toBe(1);
    expect(responses.find((item) => item.id === 3).result.tasks[0].params.threshold).toBe(1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 15_000);
