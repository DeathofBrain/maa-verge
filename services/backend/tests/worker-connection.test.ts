import { expect, test } from 'bun:test';
import { CoreWorker } from '@backend/infrastructure/native/worker';

test('a confirmed connection stays ready when a task starts before the connection waiter resumes', async () => {
  const worker = new CoreWorker();
  worker.connected = true;
  worker.running = true;
  worker.pending = 0;

  expect(await worker.waitConnected(1000)).toBe(true);
  expect(worker.safeIdle).toBe(false);
});

test('a connect callback still waits for pending native setup to finish', async () => {
  const worker = new CoreWorker();
  worker.connected = true;
  worker.pending = 1;
  let settled = false;
  const connection = worker.waitConnected(1000).then((result) => {
    settled = true;
    return result;
  });

  try {
    await Promise.resolve();
    expect(settled).toBe(false);
  } finally {
    worker.pending = 0;
  }
  expect(await connection).toBe(true);
});

test.each(['close', 'cancel'] as const)(
  '%s during native setup cannot turn a pending connection into success',
  async (interruption) => {
    const worker = new CoreWorker();
    worker.connected = true;
    worker.pending = 1;
    let cancelled = false;
    const connection = worker.waitConnected(1000, () => cancelled);

    if (interruption === 'close') await worker.close();
    else cancelled = true;
    worker.pending = 0;

    expect(await connection).toBe(false);
  },
);
