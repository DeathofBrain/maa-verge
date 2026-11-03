import { expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NativeResponseError, NativeWorkerTransport } from '@backend/infrastructure/native/worker';
import { makeTemporaryDirectorySync } from '../../../tools/test-support/temporary-directory.mjs';

/** 合成 NDJSON 对端只验证传输层，不解释设备连接或游戏任务。 */
async function transportFixture(
  peer: string,
  operation: (worker: NativeWorkerTransport) => Promise<void>,
) {
  const root = makeTemporaryDirectorySync(path.join(tmpdir(), 'maaverge-native-transport-'));
  let worker: NativeWorkerTransport | undefined;
  try {
    worker = await NativeWorkerTransport.start(
      { userDir: root },
      { command: [process.execPath, '-e', peer] },
    );
    await operation(worker);
  } finally {
    await worker?.close();
    rmSync(root, { recursive: true, force: true });
  }
}
const peer = (reply: string) => `
  const { createInterface } = require('node:readline'); let configured = false;
  createInterface({ input: process.stdin }).on('line', line => {
    const command = JSON.parse(line);
    if (!configured) {
      configured = true;
      process.stdout.write(JSON.stringify({protocolVersion:1,type:'ready'})+'\\n');
      return;
    }
    ${reply}
  });
`;

test('transport separates explicit native failures from missing acknowledgments', async () => {
  await transportFixture(
    peer(
      `if (command.operation === 'reject') process.stdout.write(JSON.stringify({protocolVersion:1,type:'response',id:command.id,error:'explicit native failure'})+'\\n');`,
    ),
    async (worker) => {
      await expect(worker.request('reject')).rejects.toBeInstanceOf(NativeResponseError);
      await expect(worker.request('unacknowledged', {}, 20)).rejects.toThrow('结果未知');
      expect(worker.alive).toBe(true);
    },
  );
});
test('native transport never interprets legacy task callbacks as device connection state', async () => {
  await transportFixture(
    peer(
      `process.stdout.write(JSON.stringify({protocolVersion:1,type:'legacy_fixture_event',payload:command.operation})+'\\n'); process.stdout.write(JSON.stringify({protocolVersion:1,type:'response',id:command.id,result:{accepted:true}})+'\\n');`,
    ),
    async (worker) => {
      const received: unknown[] = [];
      worker.onEvent((event) => {
        received.push(event);
        return true;
      });
      expect(await worker.request('probe')).toEqual({ accepted: true });
      expect(received).toHaveLength(1);
      expect(worker).not.toHaveProperty('connected');
      expect(worker).not.toHaveProperty('task');
    },
  );
});
test('protocol faults close the native process and reject pending requests without replay', async () => {
  await transportFixture(
    peer(
      `process.stdout.write(JSON.stringify({protocolVersion:2,type:'response',id:command.id,result:{}})+'\\n');`,
    ),
    async (worker) => {
      await expect(worker.request('probe')).rejects.toThrow('结果未知');
      expect(worker.alive).toBe(false);
      expect(worker.events.some((event) => event.type === 'protocol_error')).toBe(true);
      await expect(worker.request('retry')).rejects.toThrow('已关闭');
    },
  );
});
