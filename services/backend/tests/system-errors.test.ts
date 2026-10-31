import { expect, test } from 'bun:test';
import { processRequest } from '@backend/transport/json-rpc';

test('RPC translates confirmed system failures while keeping their original diagnostic', async () => {
  for (const [code, expected] of [
    ['ENOSPC', '磁盘空间不足'],
    ['SQLITE_FULL', '磁盘空间不足'],
    ['EACCES', '访问权限'],
    ['EROFS', '只读磁盘'],
    ['ENOENT', '不存在'],
    ['EBUSY', '占用'],
  ]) {
    const failure = Object.assign(new Error(`synthetic ${code} operation failure`), { code });
    const result = await processRequest(
      {
        handle: async () => {
          throw failure;
        },
      },
      { jsonrpc: '2.0', id: 1, method: 'settings.save' },
    );
    expect(result.error.message).toContain(expected);
    expect(result.error.data).toBe(failure.message);
  }
  const unknown = await processRequest(
    {
      handle: async () => {
        throw new Error('synthetic unclassified failure');
      },
    },
    { jsonrpc: '2.0', id: 2, method: 'settings.save' },
  );
  expect(unknown.error).toEqual({ code: -32603, message: '本地运行时内部错误' });
});
