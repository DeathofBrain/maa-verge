/** 验证会话内准备凭据的来源、一次消费、取消和资源失效；不连接设备或调用实际确认。 */
import { expect, test } from 'bun:test';
import {
  InfrastPreparations,
  createInfrastCapabilities,
  type AtomicExecutionPort,
  type AtomicResourceProfile,
  type PreparedRosterEvidence,
  type RosterEvidence,
} from '@maaverge/automation';
import { unexpectedPipeline } from './pipeline-fixture';

const prepared = (): PreparedRosterEvidence => ({
  target: { facility: 'Control', room: 1 },
  route: 'room',
  role: 'normal',
  selected: {
    frameId: 'roster-frame',
    operators: ['甲'],
    capacity: 3,
    room: {
      source: 'room_panel',
      frameId: 'room-frame',
      target: { facility: 'Control', room: 1 },
      occupied: 2,
      capacity: 3,
    },
  },
});

test('issued preparation carries an opaque id and can be consumed exactly once', () => {
  const preparations = new InfrastPreparations(
    () => 'resource-1',
    () => 0,
  );
  const issued = preparations.issue(prepared());
  expect((issued.selected as RosterEvidence).preparationId).toMatch(/^[a-f0-9-]{36}$/);
  expect(preparations.consume(issued)).toEqual(issued);
  expect(() => preparations.consume(issued)).toThrow('尚未消费');
});

for (const mutate of [
  (value: PreparedRosterEvidence) => (value.target.room = 2),
  (value: PreparedRosterEvidence) => ((value.selected as RosterEvidence).operators = ['乙']),
  (value: PreparedRosterEvidence) => ((value.selected as RosterEvidence).room!.capacity = 5),
  (value: PreparedRosterEvidence) => ((value.selected as RosterEvidence).preparationId = 'forged'),
])
  test('tampering never changes the stored preparation and a failed attempt consumes the credential', () => {
    const preparations = new InfrastPreparations(
      () => 'resource-1',
      () => 0,
    );
    const issued = preparations.issue(prepared());
    const changed = structuredClone(issued);
    mutate(changed);
    expect(() => preparations.consume(changed)).toThrow('本会话');
    expect(() => preparations.consume(issued)).toThrow('本会话');
  });

test('public room descriptions and another provider cannot create or consume a trusted preparation', () => {
  const first = new InfrastPreparations(
    () => 'resource-1',
    () => 0,
  );
  const second = new InfrastPreparations(
    () => 'resource-1',
    () => 0,
  );
  expect(() => first.consume(prepared())).toThrow('本会话');
  const issued = first.issue(prepared());
  expect(() => second.consume(issued)).toThrow('本会话');
  expect(first.consume(issued)).toEqual(issued);
});

test('resource activation invalidates a prepared roster even if its opaque id still matches', () => {
  let resource = 'resource-1';
  const preparations = new InfrastPreparations(
    () => resource,
    () => 0,
  );
  const issued = preparations.issue(prepared());
  resource = 'resource-2';
  expect(() => preparations.consume(issued)).toThrow('本会话');
});

test('cancellation and a later preparation both invalidate earlier credentials', () => {
  const preparations = new InfrastPreparations(
    () => 'resource-1',
    () => 0,
  );
  const controller = new AbortController();
  const cancelled = preparations.issue(prepared(), controller.signal);
  controller.abort();
  expect(() => preparations.consume(cancelled)).toThrow('本会话');
  const old = preparations.issue(prepared());
  preparations.issue(prepared());
  expect(() => preparations.consume(old)).toThrow('本会话');
});

test('an aborted preparation cannot issue a confirmation credential', () => {
  const preparations = new InfrastPreparations(
    () => 'resource-1',
    () => 0,
  );
  const controller = new AbortController();
  controller.abort();
  expect(() => preparations.issue(prepared(), controller.signal)).toThrow('取消');
});

test('the actual provider rejects fabricated confirmation before any device call', async () => {
  let deviceCalls = 0;
  const port: AtomicExecutionPort = {
    runPipeline: unexpectedPipeline,
    async execute() {
      deviceCalls++;
      throw new Error('forged confirmation must not reach the device');
    },
  };
  const profile: AtomicResourceProfile = {
    id: 'synthetic-resource',
    available: true,
    clientType: 'Official',
    diagnostics: [],
    rules: {},
    actions: {},
    sources: [],
    card: null,
  };
  const confirm = createInfrastCapabilities(port, profile).find(
    (entry) => entry.descriptor.id === 'game.infrast.confirm',
  )!;
  await expect(confirm.handler({ prepared: prepared() }, {})).rejects.toThrow('本会话');
  expect(deviceCalls).toBe(0);
});

test('any attempted external input invalidates the credential even when selected names are unchanged', () => {
  let revision = 4;
  const preparations = new InfrastPreparations(
    () => 'resource-1',
    () => revision,
  );
  const issued = preparations.issue(prepared());
  revision++;
  expect(() => preparations.consume(issued)).toThrow('本会话');
});

test('missing or invalid host input revisions cannot authorize a public confirmation', () => {
  for (const revision of [undefined, -1, Number.NaN, 1.5]) {
    const preparations = new InfrastPreparations(
      () => 'resource-1',
      () => revision,
    );
    const issued = preparations.issue(prepared());
    expect(() => preparations.consume(issued)).toThrow('输入代际');
    expect(() => preparations.consume(issued)).toThrow('尚未消费');
  }
});
