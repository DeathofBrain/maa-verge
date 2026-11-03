import { afterEach, expect, test } from 'bun:test';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Runtime } from '@backend/app/runtime';
import { FakeFramework, frameworkFixtureOptions, seedFrameworkResource } from './framework-fixture';
import { parseSettings } from '@backend/modules/settings/models';
import { NativeWorkerTransport } from '@backend/infrastructure/native/worker';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

const roots: string[] = [],
  runtimes: Runtime[] = [];
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function until(condition: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!condition() && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 1));
  expect(condition()).toBe(true);
}
// 单个常驻 Controller 持有连接快照；客户端任务不再触发 MaaCore/Framework 控制权切换。
function fixture() {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-client-resources-'));
  roots.push(root);
  const configs: any[] = [];
  const workers: FakeFramework[] = [];
  const runtime = new Runtime(
    root,
    frameworkFixtureOptions({
      frameworkWorkerFactory: async (config) => {
        configs.push(structuredClone(config));
        const worker = new FakeFramework();
        workers.push(worker);
        return worker;
      },
    }),
  );
  runtimes.push(runtime);
  seedFrameworkResource(runtime);
  return { runtime, configs, workers };
}
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
test('client-specific lifecycle commands reuse the same Framework controller and immutable connection configuration', async () => {
  const { runtime, configs, workers } = fixture();
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  await runtime.handle('plan.save', {
    plan: {
      id: 'clients',
      name: '客户端',
      tasks: [
        { type: 'CloseDown', params: { client_type: 'Bilibili' } },
        { type: 'CloseDown', params: { client_type: 'Official' } },
      ],
    },
  });
  const run = await runtime.startRun({
    planId: 'clients',
    deviceId: device.id,
    requestId: 'clients',
  });
  await until(() => runtime['execution'](run.id).status !== 'running');
  expect(runtime['execution'](run.id).status).toBe('completed');
  expect(configs).toHaveLength(1);
  expect(
    workers[0].calls
      .filter((call) => call.operation === 'stop_app')
      .map((call) => call.params.appId),
  ).toEqual(['com.hypergryph.arknights.bilibili', 'com.hypergryph.arknights']);
  expect(workers[0].closed).toBe(false);
});
test('resource activation closes the old idle controller and reconnects the same device identity', async () => {
  const { runtime, configs, workers } = fixture();
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  await runtime.beforeSwitch();
  expect(workers[0].closed).toBe(true);
  await runtime.afterSwitch();
  await runtime.finishSwitch();
  expect(configs).toHaveLength(2);
  expect(runtime.devices()[0].id).toBe(device.id);
  expect(runtime.devices()[0].state).toBe('idle');
});
test('registered offline devices do not create controllers during a resource switch', async () => {
  const { runtime, configs } = fixture();
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  await runtime.disconnectDevice(device.id);
  await runtime.beforeSwitch();
  await runtime.afterSwitch();
  await runtime.finishSwitch();
  expect(configs).toHaveLength(1);
  expect(runtime.devices()[0].state).toBe('offline');
});
test('failed reconnect leaves only that device offline and preserves the validated resource activation', async () => {
  const { runtime, workers } = fixture();
  const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
  await runtime.beforeSwitch();
  runtime['options'].frameworkWorkerFactory = async () => {
    throw new Error('synthetic reconnect failed');
  };
  await runtime.afterSwitch();
  await runtime.finishSwitch();
  expect(runtime.devices()[0].state).toBe('offline');
  expect(runtime.devices()[0].connectionError).toContain('synthetic reconnect failed');
  expect(workers[0].closed).toBe(true);
});
test('aborting the actual worker bridge closes a child that has not sent ready', async () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-worker-start-abort-'));
  roots.push(root);
  const script = path.join(root, 'startup.mjs'),
    launched = path.join(root, 'launched.txt'),
    exited = path.join(root, 'exited.txt');
  writeFileSync(
    script,
    `import { writeFileSync } from 'node:fs';
process.stdin.once('data', () => writeFileSync(${JSON.stringify(launched)}, String(process.pid)));
process.stdin.once('end', () => { writeFileSync(${JSON.stringify(exited)}, 'closed'); process.exit(0); });
process.stdin.resume();
`,
  );
  const controller = new AbortController();
  const starting = NativeWorkerTransport.start(
    { userDir: path.join(root, 'user'), lockPath: path.join(root, 'synthetic.lock') },
    { command: [process.execPath, script], signal: controller.signal },
  );
  await until(() => existsSync(launched));
  controller.abort();
  await expect(starting).rejects.toThrow('启动已取消');
  expect(readFileSync(exited, 'utf8')).toBe('closed');
});

test('worker initialization errors retain the native cause from stderr without promoting unrelated output', async () => {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-worker-start-error-'));
  roots.push(root);
  for (const [name, diagnostic, expected] of [
    ['resource', 'maaverge-native-worker: cannot load resource snapshot', '资源缺失或加载失败'],
    [
      'unknown',
      'maaverge-native-worker: synthetic specific initialization failure',
      'synthetic specific initialization failure',
    ],
    [
      'timeout',
      'native timeout in load and initialize; result unknown, do not replay',
      '原生调用超时',
    ],
    ['unrelated', 'unrelated diagnostic about unauthorized device', '退出码 7'],
  ]) {
    const script = path.join(root, name + '.mjs');
    writeFileSync(
      script,
      `process.stdin.once('data', () => { process.stderr.write('x'.repeat(32768) + '\\n' + ${JSON.stringify(diagnostic)} + '\\n', () => process.exit(7)); });`,
    );
    const userDir = path.join(root, name);
    await expect(
      NativeWorkerTransport.start(
        { userDir, lockPath: path.join(root, 'synthetic.lock') },
        { command: [process.execPath, script] },
      ),
    ).rejects.toThrow(expected);
    expect(readFileSync(path.join(userDir, 'worker.stderr.log'), 'utf8')).toContain(diagnostic);
  }
  await expect(
    NativeWorkerTransport.start(
      { userDir: path.join(root, 'missing'), lockPath: path.join(root, 'synthetic.lock') },
      { command: [path.join(root, 'missing-synthetic-worker')] },
    ),
  ).rejects.toThrow('原生工作进程文件不存在');
});
