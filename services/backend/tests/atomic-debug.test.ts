import { expect, test } from 'bun:test';
import { DebugService, type DebugRegistry } from '@backend/modules/debug/debug-service';
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

test('a direct frame with an envelope message still becomes one preview and lightweight data', async () => {
  const frame = {
    ...mockPreviewImage,
    frameId: 'message-frame',
    deviceId: 'device',
    capturedAt: '2026-01-01T00:00:00.000Z',
    latencyMs: 1,
    canControl: true,
  };
  const { service } = setup(async () => ({
    status: 'unknown',
    data: frame,
    message: 'synthetic elapsed deadline',
    verified: false,
  }));
  const session = await service.start({ deviceId: 'device', requestId: 'message-start' });
  const result = await service.invoke({
    debugSessionId: session.debugSessionId,
    primitiveId: descriptor.id,
    input: {},
    requestId: 'message-result',
  });
  expect(result.status).toBe('unknown');
  expect(result.frame).toEqual(frame);
  expect(result.data.frameId).toBe(frame.frameId);
  expect(result.data.message).toBe('synthetic elapsed deadline');
  expect(result.data).not.toHaveProperty('data');
  expect(JSON.stringify(result).split(mockPreviewImage.data)).toHaveLength(2);
  expect(frame.data).toBe(mockPreviewImage.data);
  await service.close();
});

test('nested L2 frames and partial Pipeline evidence keep lightweight references and one preview PNG', async () => {
  const before = {
    ...mockPreviewImage,
    frameId: 'before-frame',
    deviceId: 'device',
    capturedAt: '2026-01-01T00:00:00.000Z',
    latencyMs: 1,
    canControl: true,
  };
  const after = { ...before, frameId: 'after-frame', capturedAt: '2026-01-01T00:00:01.000Z' };
  const output = {
    status: 'partial',
    data: {
      observation: { frame: after, hit: true },
      pipelineSteps: {
        before: { data: { frame: before, matches: [] } },
        after: { data: { frame: after, matches: [{ box: [1, 2, 3, 4], score: 0.9 }] } },
      },
    },
    verified: false,
    message: '保留已执行步骤',
  };
  const { service } = setup(async (_id, _input, context) => {
    context.onProgress?.({ capabilityId: descriptor.id, message: '观察', data: { frame: after } });
    return output;
  });
  const session = await service.start({ deviceId: 'device', requestId: 'nested-start' });
  const result = await service.invoke({
    debugSessionId: session.debugSessionId,
    primitiveId: descriptor.id,
    input: {},
    requestId: 'nested-result',
  });
  expect(result.status).toBe('failed');
  expect(result.frame).toEqual(after);
  expect(result.data.message).toBe('保留已执行步骤');
  expect(result.data.observation).toEqual({
    frame: expect.objectContaining({
      frameId: after.frameId,
      width: after.width,
      height: after.height,
    }),
    hit: true,
  });
  expect(result.data).not.toHaveProperty('observation.frame.data');
  expect(result.data).not.toHaveProperty('pipelineSteps.before.data.frame.data');
  expect(result.data).toHaveProperty('pipelineSteps.after.data.matches', [
    { box: [1, 2, 3, 4], score: 0.9 },
  ]);
  expect(result.steps[0]!.data).toEqual({
    frame: expect.objectContaining({ frameId: after.frameId }),
  });
  expect(JSON.stringify(result).split(mockPreviewImage.data)).toHaveLength(2);
  // 调试序列化生成副本，不删除能力返回值里供同根调用使用的 PNG 或后置证据。
  expect(output.data.observation.frame.data).toBe(mockPreviewImage.data);
  expect(output.data.pipelineSteps.before.data.frame.data).toBe(mockPreviewImage.data);
  await service.close();
});

test('an exception preserves prior progress as lightweight evidence with one preview PNG', async () => {
  const frame = {
    ...mockPreviewImage,
    frameId: 'exception-frame',
    deviceId: 'device',
    capturedAt: '2026-01-01T00:00:00.000Z',
    latencyMs: 1,
    canControl: true,
  };
  const event = { capabilityId: descriptor.id, message: '已观察', data: { frame, hit: true } };
  const { service } = setup(async (_id, _input, context) => {
    context.onProgress?.(event);
    throw new Error('后续原生步骤失败');
  });
  const session = await service.start({ deviceId: 'device', requestId: 'exception-start' });
  const result = await service.invoke({
    debugSessionId: session.debugSessionId,
    primitiveId: descriptor.id,
    input: {},
    requestId: 'exception-result',
  });
  expect(result.status).toBe('unknown');
  expect(result.data.message).toBe('后续原生步骤失败');
  expect(result.frame).toEqual(frame);
  expect(result.steps[0]).toHaveProperty('data.frame.frameId', frame.frameId);
  expect(result.steps[0]).not.toHaveProperty('data.frame.data');
  expect(result.steps[0]).toHaveProperty('data.hit', true);
  expect(JSON.stringify(result).split(mockPreviewImage.data)).toHaveLength(2);
  expect(event.data.frame.data).toBe(mockPreviewImage.data);
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
