import { atomicInputSchemas, atomicCapabilityResultSchema } from '@contracts/atomic-input-schemas';
import { atomicInputValidators } from '@contracts/validators.js';
import { RpcError } from '@backend/shared/errors';
import type {
  AtomicCapabilityDescriptor,
  AtomicCapabilityResult,
  AtomicExecutionContext,
  AtomicExecutionPort,
  AtomicLayer,
  AtomicOperation,
  AtomicResourceProfile,
} from './types';
import { AtomicFailure, AtomicVision, checkCancelled } from './vision';
import { createInfrastDriver, InfrastWorkflows, parseRoomShift, parseTarget } from './infrast';

const resultSchema = atomicCapabilityResultSchema;

/** The registry is a catalog and dispatcher, never a native session owner. */
export function createAtomicCapabilityRegistry(
  port: AtomicExecutionPort,
  options: { profile: AtomicResourceProfile },
) {
  const { profile } = options;
  type Handler = (
    input: Record<string, unknown>,
    context: AtomicExecutionContext,
  ) => Promise<AtomicCapabilityResult>;
  const entries = new Map<string, { descriptor: AtomicCapabilityDescriptor; handler: Handler }>();
  const add = (
    id: string,
    label: string,
    layer: AtomicLayer,
    description: string,
    handler: Handler,
    dependencies: string[] = [],
    needsCards = false,
  ) => {
    const missing = dependencies.filter((id) => !profile.rules[id] && !profile.actions[id]);
    const available =
      layer === 'operation' ||
      id === 'observation.frame' ||
      (profile.available && !missing.length && (!needsCards || Boolean(profile.card)));
    entries.set(id, {
      descriptor: {
        id,
        label,
        layer,
        description,
        inputSchema: atomicInputSchemas[id],
        resultSchema,
        requiredCapabilities: [
          ...new Set([
            'frame',
            ...(layer === 'operation' ? [id.slice('operation.'.length)] : []),
            ...dependencies.map(
              (key) =>
                profile.rules[key]?.kind ?? (profile.actions[key] ? 'click' : `resource:${key}`),
            ),
            ...(layer === 'game' || layer === 'workflow' ? ['click', 'swipe', 'keys'] : []),
          ]),
        ],
        available,
        ...(!available
          ? {
              unavailableReason: missing.length
                ? `资源缺少明确适配：${missing.join('、')}`
                : profile.diagnostics.join('；') || '当前客户端资源尚未适配',
            }
          : {}),
      },
      handler,
    });
  };
  const raw = (id: AtomicOperation, label: string) =>
    add(
      `operation.${id}`,
      label,
      'operation',
      '调用当前 MaaFramework 会话；输入动作只报告原生接受状态，业务结果需另行观察。',
      async (input, context) => {
        const data = await port.execute(id, input, context);
        const accepted =
          data !== null && typeof data === 'object' && 'accepted' in data && data.accepted === true;
        return {
          status: id === 'frame' || id === 'recognize' || accepted ? 'completed' : 'unknown',
          data,
          verified: id === 'frame' || id === 'recognize',
          ...(id !== 'frame' && id !== 'recognize' ? { nativeSuccess: accepted } : {}),
        };
      },
    );
  raw('frame', '读取画面');
  raw('click', '点击');
  raw('swipe', '滑动');
  raw('press_key', '按键');
  raw('long_press', '长按');
  raw('drag', '拖拽');
  raw('recognize', '画面识别');
  add(
    'observation.frame',
    '读取画面',
    'observation',
    '读取当前 MaaFramework 会话的实际画面。',
    async (_input, context) => ({
      status: 'completed',
      data: await port.execute('frame', {}, context),
      verified: true,
    }),
  );
  const vision = (context: AtomicExecutionContext) => new AtomicVision(port, profile, context);
  const workflows = (context: AtomicExecutionContext) =>
    new InfrastWorkflows(createInfrastDriver(vision(context)), context);
  const observed = (data: unknown): AtomicCapabilityResult => ({
    status: 'completed',
    data,
    verified: true,
  });
  add(
    'observation.base',
    '观察基建入口',
    'observation',
    '只识别当前画面是否处于基建，不点击。',
    async (_input, context) => observed(await vision(context).match('base.entered')),
    ['base.entered'],
  );
  add(
    'observation.operators',
    '观察干员列表',
    'observation',
    '读取实际卡片姓名、选中状态和当前页面显示的容量。',
    async (_input, context) => observed(await vision(context).operators()),
    ['operators.name', 'operators.anchor.0'],
    true,
  );
  add(
    'observation.overview',
    '观察游戏总览',
    'observation',
    '读取游戏左侧总览当前可见房间身份；不更换干员。',
    async (_input, context) => observed(await createInfrastDriver(vision(context)).overview()),
    ['overview.enter', 'queue.rotate'],
  );
  add(
    'observation.training',
    '观察训练状态',
    'observation',
    '只读受训者姓名与训练锁定状态；协助者通过房间进驻接口读取。不会领取或继续训练。',
    async (_input, context) => observed(await createInfrastDriver(vision(context)).training()),
    ['training.idle', 'training.page', 'training.processing', 'training.operator'],
  );
  add(
    'game.infrast.enter_overview',
    '打开游戏总览',
    'game',
    '从基建打开游戏左侧总览，并重新确认总览页面。',
    async (_input, context) => observed(await createInfrastDriver(vision(context)).enterOverview()),
    ['base.entered', 'overview.enter', 'queue.rotate'],
  );
  add(
    'game.infrast.read_room',
    '读取房间进驻',
    'game',
    '打开明确房间的选人列表，读取完整当前名单与动态容量。制造、贸易、发电、宿舍必须提供可验证的 position。',
    async (input, context) => workflows(context).readRoom(parseTarget(input)),
    ['overview.enter', 'operators.name', 'operators.anchor.0', 'operators.filter', 'operators.all'],
    true,
  );
  add(
    'game.infrast.set_room',
    '设置单房间名单',
    'game',
    '按明确姓名换班；确认后退出并重读进驻名单。重复设施必须提供 position，训练室分别处理受训者和协助者。',
    async (input, context) => workflows(context).setRoom(parseRoomShift(input), 'room'),
    [
      'overview.enter',
      'operators.clear',
      'operators.confirm',
      'operators.conflict',
      'operators.filter',
      'operators.all',
    ],
    true,
  );
  add(
    'workflow.infrast.queue_rotate',
    '游戏一键队列轮换',
    'workflow',
    '只点击游戏队列轮换一次并核对总览画面；不执行整顿。不会以任务完成回调替代名单证据。',
    async (input, context) =>
      workflows(context).queueRotate(
        Array.isArray(input.expectedRooms) ? input.expectedRooms.map(parseRoomShift) : [],
      ),
    ['overview.enter', 'queue.rotate'],
  );
  add(
    'workflow.infrast.trim',
    '独立整顿',
    'workflow',
    '单独打开游戏整顿并执行一次；与队列轮换分离，缺少明确完成证据时保留结果未知。',
    async (_input, context) => workflows(context).trim(),
    ['overview.enter', 'trim.enter', 'trim.apply'],
  );

  for (const [route, label, description] of [
    [
      'overview',
      '总览逐房换班',
      '从游戏左侧总览定位明确房间，逐房应用名单并重读结果；保留已完成房间证据。',
    ],
    [
      'room',
      '逐房间明确换班',
      '覆盖制造、贸易、发电、中枢、会客、办公室、宿舍、加工、训练、回收；每房读取实际容量。',
    ],
  ] as const)
    add(
      `workflow.infrast.${route}_shift`,
      label,
      'workflow',
      description,
      async (input, context) => {
        if (!Array.isArray(input.rooms) || input.rooms.length < 1 || input.rooms.length > 32)
          throw new AtomicFailure('rooms 必须包含 1 至 32 个明确房间');
        const rooms = input.rooms.map((room) => parseRoomShift(room));
        return workflows(context).batch(rooms, route);
      },
      [
        'overview.enter',
        'operators.clear',
        'operators.confirm',
        'operators.conflict',
        'operators.filter',
        'operators.all',
      ],
      true,
    );
  return {
    list: () => [...entries.values()].map(({ descriptor }) => structuredClone(descriptor)),
    get: (id: string) => {
      const descriptor = entries.get(id)?.descriptor;
      return descriptor ? structuredClone(descriptor) : undefined;
    },
    async execute(
      id: string,
      input: Record<string, unknown>,
      context: AtomicExecutionContext = {},
    ): Promise<AtomicCapabilityResult> {
      try {
        checkCancelled(context);
        const entry = entries.get(id);
        if (!entry) throw new AtomicFailure('原语未注册', 'unavailable');
        if (!entry.descriptor.available)
          throw new AtomicFailure(entry.descriptor.unavailableReason!, 'unavailable');
        if (!input || typeof input !== 'object' || Array.isArray(input))
          throw new AtomicFailure('原语输入必须是对象');
        const validator = atomicInputValidators[id as keyof typeof atomicInputValidators];
        if (!validator || !validator(input))
          throw new AtomicFailure('原语输入不符合已登记的 JSON Schema');
        return await entry.handler(input, context);
      } catch (error) {
        return {
          status: context.signal?.aborted
            ? 'cancelled'
            : error instanceof AtomicFailure
              ? error.status
              : error instanceof RpcError && error.code === -32602
                ? 'failed'
                : 'unknown',
          data: {},
          verified: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
