import { expect, test } from 'bun:test';
import { DebugService, type DebugRegistry } from '@backend/modules/atomic/debug-service';
import type { RpcContract, PrimitiveDescriptor } from '@contracts/rpc-types';
import { mockPreviewImage } from '../../../tests/fixtures/preview-image';
const descriptor: PrimitiveDescriptor = {
  id: 'operation.click',
  label: '点击',
  description: '一次输入',
  layer: 'operation',
  inputSchema: {},
  resultSchema: {},
  available: true,
};
const control: RpcContract['results']['control.session.start'] = {
  deviceId: 'device',
  sessionId: 'native-session',
  controlToken: 'private-native-token',
  engine: 'maafw',
  resourceGeneration: 'immutable-generation',
  capabilities: { ocr: true, template: true, click: true, swipe: true, keys: true },
};
function setup(
  execute: DebugRegistry['execute'] = async () => ({
    status: 'completed',
    data: { accepted: true },
    verified: false,
    nativeSuccess: true,
  }),
) {
  let starts = 0,
    ends = 0;
  const service = new DebugService({
    catalog: async () => [descriptor],
    start: async () => {
      starts++;
      return control;
    },
    end: async () => {
      ends++;
    },
    registry: async () => ({ list: () => [descriptor], execute }),
  });
  return { service, counts: () => ({ starts, ends }) };
}

test('catalog is read-only; opaque session and invocation dedupe never leak the control token or replay effects', async () => {
  let calls = 0;
  const { service, counts } = setup(async () => {
    calls++;
    return { status: 'completed', data: { accepted: true }, verified: false, nativeSuccess: true };
  });
  expect((await service.catalog()).items).toHaveLength(1);
  expect(counts().starts).toBe(0);
  const session = await service.start({ deviceId: 'device', requestId: 'start' });
  expect(JSON.stringify(session)).not.toContain(control.controlToken);
  expect(await service.start({ deviceId: 'device', requestId: 'start' })).toEqual(session);
  const request = {
    ...session,
    primitiveId: descriptor.id,
    input: { x: 1, y: 2 },
    requestId: 'invoke',
  };
  delete (request as any).deviceId;
  const first = await service.invoke(request);
  expect(first.status).toBe('succeeded');
  expect(first.nativeSuccess).toBe(true);
  expect(first.verified).toBe(false);
  expect(await service.invoke(request)).toEqual(first);
  expect(calls).toBe(1);
  expect(() => service.invoke({ ...request, input: { x: 2 } })).toThrow('标识');
  const end = { debugSessionId: session.debugSessionId, requestId: 'end' };
  expect(await service.end(end)).toEqual({ ended: true });
  expect(await service.end(end)).toEqual({ ended: true });
  expect(await service.end({ ...end, requestId: 'retry-lost-release-ack' })).toEqual({
    ended: true,
  });
  await expect(service.invoke({ ...request, requestId: 'after-end' })).rejects.toThrow('已结束');
  expect(await service.start({ deviceId: 'device', requestId: 'start' })).toEqual(session);
  expect(counts()).toEqual({ starts: 1, ends: 1 });
  await service.close();
});

test('ending a session cancels its operation, blocks later actions, and waits before release completes', async () => {
  let aborted = false;
  const { service, counts } = setup(
    async (_id, _input, context) =>
      new Promise((resolve) =>
        context.signal!.addEventListener(
          'abort',
          () => {
            aborted = true;
            resolve({ status: 'cancelled', data: { partialRooms: ['Mfg-1'] }, verified: false });
          },
          { once: true },
        ),
      ),
  );
  const session = await service.start({ deviceId: 'device', requestId: 'start' });
  const pending = service.invoke({
    debugSessionId: session.debugSessionId,
    primitiveId: descriptor.id,
    input: {},
    requestId: 'invoke',
  });
  await expect(
    service.invoke({
      debugSessionId: session.debugSessionId,
      primitiveId: descriptor.id,
      input: {},
      requestId: 'parallel',
    }),
  ).rejects.toThrow('尚未结束');
  await service.end({ debugSessionId: session.debugSessionId, requestId: 'stop' });
  expect(aborted).toBe(true);
  expect((await pending).status).toBe('cancelled');
  expect(counts().ends).toBe(1);
  expect((await pending).data.partialRooms).toEqual(['Mfg-1']);
  await service.close();
});

test('frame result uses ScreenFrame and partial workflow evidence is preserved', async () => {
  const frame = {
    ...mockPreviewImage,
    frameId: 'f',
    deviceId: 'device',
    capturedAt: new Date().toISOString(),
    latencyMs: 1,
    canControl: true,
  };
  const { service } = setup(async (_id, input) =>
    input.frame
      ? { status: 'completed', data: frame, verified: true }
      : {
          status: 'partial',
          data: {
            rooms: [
              { room: 1, status: 'completed' },
              { room: 2, status: 'unknown' },
            ],
          },
          verified: false,
          message: '第二房间未确认',
        },
  );
  const session = await service.start({ deviceId: 'device', requestId: 'start' });
  const first = await service.invoke({
    debugSessionId: session.debugSessionId,
    primitiveId: descriptor.id,
    input: { frame: true },
    requestId: 'frame',
  });
  expect(first.frame?.data).toBe(frame.data);
  expect(first.data).not.toHaveProperty('data');
  const second = await service.invoke({
    debugSessionId: session.debugSessionId,
    primitiveId: descriptor.id,
    input: {},
    requestId: 'workflow',
  });
  expect(second.status).toBe('failed');
  expect(second.data.rooms).toHaveLength(2);
  expect(second.data.message).toBe('第二房间未确认');
  await service.close();
});

test('a failed release keeps actions cancelled and permits a new end request to retry cleanup', async () => {
  let endings = 0;
  const service = new DebugService({
    catalog: async () => [descriptor],
    start: async () => control,
    registry: async () => ({ list: () => [descriptor], execute: async () => ({}) }),
    end: async () => {
      if (++endings === 1) throw new Error('release failed');
    },
  });
  const session = await service.start({ deviceId: 'device', requestId: 'start' });
  await expect(
    service.end({ debugSessionId: session.debugSessionId, requestId: 'first' }),
  ).rejects.toThrow('release failed');
  await expect(
    service.invoke({
      debugSessionId: session.debugSessionId,
      primitiveId: descriptor.id,
      input: {},
      requestId: 'after',
    }),
  ).rejects.toThrow('已结束');
  expect(await service.end({ debugSessionId: session.debugSessionId, requestId: 'retry' })).toEqual(
    { ended: true },
  );
  expect(endings).toBe(2);
  await service.close();
});
