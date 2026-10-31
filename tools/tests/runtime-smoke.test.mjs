import { makeTemporaryDirectorySync } from '../test-support/temporary-directory.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { cleanupRuntimeSmoke, waitForRuntimeStartup } from '../smoke-runtime.mjs';

const preparing = '正在后台准备随附组件，请稍后再连接或执行';

function rpcError(code, message) {
  return Object.assign(new Error(JSON.stringify({ code, message })), {
    rpcError: { code, message },
  });
}

test('runtime readiness waits for component preparation and requires parameter validation', async () => {
  const calls = [];
  const replies = [
    rpcError(-32021, preparing),
    rpcError(-32021, preparing),
    rpcError(-32602, '请求参数无效'),
  ];
  await waitForRuntimeStartup(async (method, params) => {
    calls.push({ method, params });
    throw replies.shift();
  });
  assert.deepEqual(calls, [
    { method: 'run.start', params: {} },
    { method: 'run.start', params: {} },
    { method: 'run.start', params: {} },
  ]);
  assert.equal(replies.length, 0);
});

for (const [description, error] of [
  ['another busy reason', rpcError(-32021, '已有后台请求在处理中')],
  ['a different RPC error', rpcError(-32004, '设备不存在')],
  ['a transport failure', new Error('Runtime exited 1')],
]) {
  test(`runtime readiness rejects ${description} immediately`, async () => {
    let calls = 0;
    await assert.rejects(
      waitForRuntimeStartup(async () => {
        calls++;
        throw error;
      }),
      (observed) => observed instanceof Error && observed.message.includes(error.message),
    );
    assert.equal(calls, 1);
  });
}

test('runtime readiness rejects unexpected success instead of permitting execution', async () => {
  let calls = 0;
  await assert.rejects(
    waitForRuntimeStartup(async () => {
      calls++;
      return { id: 'unexpected-run' };
    }),
  );
  assert.equal(calls, 1);
});

test('runtime readiness fails when component preparation exceeds its deadline', async () => {
  await assert.rejects(
    waitForRuntimeStartup(
      async () => {
        throw rpcError(-32021, preparing);
      },
      { timeout: 0 },
    ),
    /startup timed out/u,
  );
});

function temporary(t, prefix = 'maaverge-package-smoke-') {
  const directory = makeTemporaryDirectorySync(path.join(tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));
  return directory;
}

async function syntheticChild(cwd) {
  const child = spawn(
    process.execPath,
    ['--eval', "process.send('ready'); setInterval(() => {}, 1000);"],
    { cwd, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true },
  );
  let didClose = false;
  const closed = new Promise((resolve) => {
    child.once('close', () => {
      didClose = true;
      resolve();
    });
  });
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
  };
  try {
    const [message] = await once(child, 'message', { signal: AbortSignal.timeout(5000) });
    assert.equal(message, 'ready');
  } catch (error) {
    await stop();
    throw error;
  }
  return { child, didClose: () => didClose, stop };
}

test(
  'runtime cleanup waits for owned children and preserves unrelated processes and files',
  { timeout: 15000 },
  async (t) => {
    const directory = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-package-smoke-'));
    const sibling = makeTemporaryDirectorySync(
      path.join(tmpdir(), 'maaverge-runtime-smoke-sibling-'),
    );
    const processes = [];
    t.after(async () => {
      await Promise.all(processes.map((process) => process.stop()));
      await Promise.all(
        [directory, sibling].map((directory) =>
          rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
        ),
      );
    });
    const retained = path.join(sibling, 'keep.txt');
    writeFileSync(retained, 'unrelated data');
    const owned = await syntheticChild(directory);
    processes.push(owned);
    const unrelated = await syntheticChild(sibling);
    processes.push(unrelated);
    const children = new Set([owned.child]);
    owned.child.once('close', () => children.delete(owned.child));

    await cleanupRuntimeSmoke(directory, children);

    assert.equal(owned.didClose(), true);
    assert.equal(children.size, 0);
    assert.equal(existsSync(directory), false);
    assert.equal(unrelated.didClose(), false);
    assert.equal(process.kill(unrelated.child.pid, 0), true);
    assert.equal(readFileSync(retained, 'utf8'), 'unrelated data');
  },
);

test('runtime cleanup refuses paths outside its direct temporary-directory scope', async (t) => {
  const sibling = temporary(t, 'maaverge-runtime-smoke-paths-');
  const nested = path.join(sibling, 'maaverge-package-smoke-nested');
  mkdirSync(nested);
  const retained = path.join(nested, 'keep.txt');
  writeFileSync(retained, 'preserve rejected path');

  for (const directory of [sibling, nested]) {
    await assert.rejects(cleanupRuntimeSmoke(directory, new Set()));
    assert.equal(readFileSync(retained, 'utf8'), 'preserve rejected path');
  }
});
