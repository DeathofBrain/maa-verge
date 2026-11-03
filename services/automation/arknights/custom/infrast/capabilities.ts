/** 向通用注册表提供基建能力描述、输入校验与处理器；不持有设备控制权或可变游戏状态。 */
import { atomicInputSchemas, atomicCapabilityResultSchema } from '@contracts/atomic-input-schemas';
import { atomicInputValidators } from '@contracts/validators.js';
import type {
  AtomicCapabilityResult,
  AtomicExecutionContext,
  AtomicExecutionPort,
  AtomicLayer,
} from '#automation/core/types';
import type { CapabilityRegistration } from '#automation/registry/types';
import { AtomicFailure } from '#automation/core/errors';
import type {
  AtomicResourceProfile,
  AtomicFacility,
  RosterEvidence,
  RoomCapacityEvidence,
} from './types';
import { AtomicVision } from './observations';
import { createInfrastDriver } from './driver';
import { InfrastWorkflows } from './workflows';
import {
  parseRoomShift,
  parseTarget,
  parseRoute,
  parsePrepareRoster,
  parsePreparedRoster,
  validateRoomIdentity,
} from './validation';
import { InfrastRoomPrimitives } from './room';
import { InfrastRoster } from './roster';
import { InfrastPreparations } from './preparations';
import { infrastCapabilityEntries, infrastPipeline } from './definitions';
import { prepareAutomaticRoster } from './strategy';

/** 用同一执行端口与资源快照组装能力；新增能力须登记权威 Schema、资源依赖及明确结果语义。 */
export function createInfrastCapabilities(
  port: AtomicExecutionPort,
  profile: AtomicResourceProfile,
): CapabilityRegistration[] {
  type Handler = CapabilityRegistration['handler'];
  const entries: CapabilityRegistration[] = [];
  const resultSchema = atomicCapabilityResultSchema;
  const preparations = new InfrastPreparations(
    () => JSON.stringify([profile.id, profile.resourceVersion, profile.sources]),
    () => port.getInputRevision?.(),
  );
  // 以权威 Schema 和显式资源依赖登记能力；设备就绪与控制权仍在宿主执行时检查。
  const add = (
    id: string,
    label: string,
    layer: Exclude<AtomicLayer, 'operation'>,
    description: string,
    handler: Handler,
    dependencies: string[] = [],
    needsCards = false,
  ) => {
    const pipelineEntry = infrastCapabilityEntries[id as keyof typeof infrastCapabilityEntries];
    if (!pipelineEntry) throw new AtomicFailure(`基建能力缺少 JSON 入口：${id}`, 'unavailable');
    const primitiveLevel =
      id.startsWith('workflow.') || id === 'game.infrast.set_room' ? undefined : 3;
    const effect = id.startsWith('observation.')
      ? 'observe'
      : ['game.infrast.confirm', 'game.infrast.rotate_queue', 'game.infrast.trim'].includes(id) ||
          primitiveLevel === undefined
        ? 'commit'
        : 'input';
    const roomWorkflowDependencies = [
      'game.infrast.read_room',
      'game.infrast.prepare_roster',
      'game.infrast.confirm',
      'game.infrast.verify_room',
      'game.infrast.open_room',
      'game.infrast.open_roster',
      'game.infrast.read_roster',
      'observation.training',
    ];
    const capabilityDependencies =
      primitiveLevel === undefined
        ? id === 'workflow.infrast.queue_rotate'
          ? [
              'game.infrast.enter_overview',
              'observation.overview',
              'game.infrast.rotate_queue',
              'game.infrast.read_room',
            ]
          : id === 'workflow.infrast.trim'
            ? ['game.infrast.enter_trim', 'game.infrast.trim', 'observation.trim']
            : [
                ...roomWorkflowDependencies,
                ...(id === 'workflow.infrast.custom_shift' ? ['game.infrast.resolve_rooms'] : []),
                ...(['workflow.infrast.auto_room_shift', 'workflow.infrast.custom_shift'].includes(
                  id,
                )
                  ? ['game.infrast.prepare_auto_roster']
                  : []),
                ...(id === 'workflow.infrast.daily'
                  ? ['game.infrast.enumerate_rooms', 'game.infrast.prepare_auto_roster']
                  : []),
              ]
        : [
            'operation.frame',
            'operation.recognize',
            ...(effect === 'observe'
              ? []
              : ['operation.click', 'operation.swipe', 'operation.press_key']),
          ];
    const needsNames = needsCards || id === 'observation.training';
    const autoResources = [
      'game.infrast.prepare_auto_roster',
      'workflow.infrast.auto_room_shift',
      'workflow.infrast.daily',
    ].includes(id)
      ? ['operators.mood', 'operators.simpleSkills']
      : [];
    const layoutResources = ['game.infrast.enumerate_rooms', 'workflow.infrast.daily'].includes(id)
      ? ['Mfg', 'Trade', 'Power', 'Control', 'Reception', 'Office', 'Dorm'].map(
          (facility) => `facility.icon.${facility}`,
        )
      : [];
    const requiredResources = [
      ...dependencies,
      ...(needsNames ? ['operators.dictionary'] : []),
      ...autoResources,
      ...layoutResources,
    ];
    const missing = requiredResources.filter((id) =>
      id === 'operators.dictionary'
        ? !profile.operatorNames?.names.length ||
          !['Official', 'Bilibili'].includes(profile.clientType)
        : id === 'operators.mood'
          ? !profile.card?.moodOffset
          : id === 'operators.simpleSkills'
            ? !profile.card?.skillOffset || !profile.skills
            : !profile.rules[id] && !profile.actions[id],
    );
    // 总体适配可用还不够：每项能力逐一检查规则／动作，以及需要时的完整卡片参数。
    const available =
      profile.available && !missing.length && (!needsCards || Boolean(profile.card));
    entries.push({
      descriptor: {
        id,
        label,
        layer,
        description,
        inputSchema: atomicInputSchemas[id],
        ...(primitiveLevel === undefined ? {} : { primitiveLevel }),
        effect,
        pipelineEntry,
        requiredResources,
        dependencies: capabilityDependencies,
        resultSchema,
        // 原生权限声明来自实际规则种类与动作层级；资源缺失同时保留可诊断的占位依赖。
        requiredCapabilities: [
          ...new Set([
            'frame',
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
      // 校验器由 contracts 的权威 Schema 生成；通用注册表在进入 handler 前调用。
      pipeline: { definitions: infrastPipeline.definitions, entry: pipelineEntry },
      dependencies: capabilityDependencies,
      validate: atomicInputValidators[id as keyof typeof atomicInputValidators],
      async handler(input, context) {
        // 可信准备只覆盖当前页面状态；其他游戏输入、新准备和失败都会使先前凭据失效。
        if (effect !== 'observe' && id !== 'game.infrast.confirm') preparations.clear();
        try {
          const result = await handler(input, context);
          if (result.status !== 'completed' || context.signal?.aborted) preparations.clear();
          return result;
        } catch (error) {
          preparations.clear();
          throw error;
        }
      },
    });
  };
  // 每次调用都携带自己的取消与进度上下文，观察层和流程层复用同一宿主执行端口。
  const vision = (context: AtomicExecutionContext) => new AtomicVision(port, profile, context);
  const workflows = (context: AtomicExecutionContext) =>
    new InfrastWorkflows(createInfrastDriver(vision(context)), context);
  // verified 仅证明当前阶段的明确状态；实际进驻仍须由完整 workflows 提交后复读。
  const room = (
    context: AtomicExecutionContext,
    trustedRoom?: RoomCapacityEvidence,
    trustedSelectedCount?: number,
  ) =>
    new InfrastRoomPrimitives(
      createInfrastDriver(vision(context), trustedRoom, trustedSelectedCount),
      context,
    );
  const roster = (context: AtomicExecutionContext) =>
    new InfrastRoster(createInfrastDriver(vision(context)), context);
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
    '读取当前页实际卡片姓名与选中状态；不由卡片或心情文字推算完整人数和房间容量。',
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
  // 游戏操作可导航或修改单个房间；具体实现负责页面身份与结果复核。
  add(
    'game.infrast.enter_overview',
    '打开游戏总览',
    'game',
    '从基建打开游戏左侧总览，并重新确认总览页面。',
    async (_input, context) => observed(await createInfrastDriver(vision(context)).enterOverview()),
    ['base.entered', 'overview.enter', 'queue.rotate'],
  );
  add(
    'game.infrast.resolve_rooms',
    '解析官方计划房间身份',
    'game',
    '只读浏览总览，将官方设施序号绑定完整游戏位置；全部收齐前不修改名单。',
    async (input, context) => {
      const rooms = (input.rooms as unknown[]).map(parseRoomShift);
      const driver = createInfrastDriver(vision(context));
      return observed({ rooms: await driver.resolveRooms!(rooms) });
    },
    ['base.entered', 'overview.enter', 'queue.rotate'],
  );
  add(
    'game.infrast.enumerate_rooms',
    '读取完整基建房间集合',
    'game',
    '同帧九格生产区／四宿舍／单例槽位双读证明可观察全集，再从总览绑定每房身份。',
    async (input, context) =>
      observed(
        await createInfrastDriver(vision(context)).enumerateRooms!(
          input.facilities as AtomicFacility[],
        ),
      ),
    ['base.entered', 'overview.enter', 'queue.rotate'],
  );
  add(
    'game.infrast.read_room',
    '读取房间进驻',
    'game',
    '打开明确房间的选人列表，读取完整当前名单与动态容量。制造、贸易、发电、宿舍必须提供可验证的 position。',
    async (input, context) =>
      room(context).readRoom(
        parseTarget(input),
        input.route === undefined ? 'room' : parseRoute(input.route),
      ),
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
  // 业务层只能组合 L3；这些边界避免训练保护、队列轮换和整顿越层直接操作设备。
  add(
    'game.infrast.open_room',
    '打开明确房间',
    'game',
    '导航后核对设施标题与完整位置，不提交名单。',
    async (input, context) => {
      const target = parseTarget(input);
      await createInfrastDriver(vision(context)).openRoom(
        target,
        input.route === undefined ? 'room' : parseRoute(input.route),
      );
      return observed({ target });
    },
    ['base.entered'],
  );
  add(
    'game.infrast.open_roster',
    '打开房间名单',
    'game',
    '从已核对房间进入普通或指定训练角色名单，不执行选人或提交。',
    async (input, context) => {
      const target = parseTarget(input.target);
      validateRoomIdentity(target);
      if (
        target.facility === 'Training'
          ? input.role !== 'trainee' && input.role !== 'assistant'
          : input.role !== undefined
      )
        throw new AtomicFailure('名单角色与设施不匹配');
      await createInfrastDriver(vision(context)).openRoster(
        target,
        input.role as 'trainee' | 'assistant' | undefined,
      );
      return observed({ target, ...(input.role ? { role: input.role } : {}) });
    },
    ['operators.name', 'operators.anchor.0'],
    true,
  );
  add(
    'game.infrast.read_roster',
    '读取完整待选名单',
    'game',
    '在当前名单页按游戏计数有限扫描，筛选与翻页会改变页面但不提交名单。',
    async (input, context) =>
      observed(await room(context).roster.roster(Number(input.maxCapacity ?? 5))),
    ['operators.filter', 'operators.all', 'operators.name'],
    true,
  );
  // 当前名单页的四个独立事件各有 JSON 入口，不隐式翻页找人或把待选状态提交为进驻。
  add(
    'game.infrast.reset_filter',
    '重置干员筛选',
    'game',
    '重置全部筛选并观察可读名单；不提交房间名单，不宣称当前页是完整名单。',
    async (_input, context) => roster(context).resetFilter(),
    ['operators.filter', 'operators.all', 'operators.name', 'operators.anchor.0'],
    true,
  );
  add(
    'game.infrast.page_roster',
    '翻阅当前名单',
    'game',
    '先确认名单页，按明确方向滑动一次，再复核人数与容量；页面未变不自动补滑。',
    async (input, context) => roster(context).page(input.direction as 'left' | 'right'),
    ['operators.name', 'operators.anchor.0'],
    true,
  );
  add(
    'game.infrast.select_operator',
    '切换可见干员待选',
    'game',
    '仅当前页唯一完整姓名，默认选中；状态已满足不点击，否则一次切换并复读同名状态与人数。',
    async (input, context) =>
      roster(context).selectOperator(input.name as string, input.selected !== false),
    ['operators.name', 'operators.anchor.0'],
    true,
  );
  add(
    'game.infrast.clear_roster',
    '清空当前待选名单',
    'game',
    '核对当前容量和人数后清空一次，并复读零人数；结果未确认不重放，不提交进驻。',
    async (_input, context) => roster(context).clear(),
    ['operators.clear', 'operators.name', 'operators.anchor.0'],
    true,
  );
  add(
    'game.infrast.rotate_queue',
    '点击队列轮换',
    'game',
    '在已确认总览执行一次轮换，原生接受不能证明房间名单全部生效。',
    async (_input, context) => {
      await createInfrastDriver(vision(context)).rotateQueue();
      return {
        status: 'completed',
        data: { actionCount: 1 },
        verified: false,
        nativeSuccess: true,
      };
    },
    ['queue.rotate'],
  );
  add(
    'game.infrast.enter_trim',
    '打开整顿页面',
    'game',
    '从总览进入整顿并返回当前页面观察，不执行整顿。',
    async (_input, context) => observed(await createInfrastDriver(vision(context)).enterTrim()),
    ['overview.enter', 'trim.enter'],
  );
  add(
    'game.infrast.trim',
    '点击整顿',
    'game',
    '在已确认整顿页提交一次，具体名单效果仍需上层复读。',
    async (_input, context) => {
      await createInfrastDriver(vision(context)).trim();
      return {
        status: 'completed',
        data: { actionCount: 1 },
        verified: false,
        nativeSuccess: true,
      };
    },
    ['trim.apply'],
  );
  add(
    'observation.trim',
    '观察整顿页面',
    'observation',
    '只读取当前页面的文字证据，不将其视为整顿业务完成。',
    async (_input, context) => observed(await vision(context).trimObservation()),
  );

  // 三个可独立调用的 L3 组件各自提供 JSON 入口；普通／训练业务链显式组合它们。
  add(
    'game.infrast.prepare_roster',
    '准备明确名单',
    'game',
    '进入明确房间并准备待选名单；重读当前容量和姓名，不提交进驻。',
    async (input, context) => {
      const result = await room(context).prepareRoster(parsePrepareRoster(input));
      if (result.status !== 'completed' || !result.verified) return result;
      return {
        ...result,
        data: preparations.issue(parsePreparedRoster(result.data), context.signal),
      };
    },
    ['overview.enter', 'operators.clear', 'operators.filter', 'operators.all'],
    true,
  );
  add(
    'game.infrast.prepare_auto_roster',
    '准备单房自动名单',
    'game',
    '从有界已观察候选按心情与简单技能选满实际容量；只选明确未进驻或当前房间原成员，不提交名单。',
    async (input, context) => {
      if (!profile.card?.moodOffset || !profile.card.skillOffset || !profile.skills)
        throw new AtomicFailure(
          '当前资源缺少心情／简单技能观察 profile，未修改名单',
          'unavailable',
        );
      const result = await prepareAutomaticRoster(
        createInfrastDriver(vision(context), undefined, undefined, true),
        profile,
        context,
        {
          target: parseTarget(input.target),
          route: input.route === undefined ? 'room' : parseRoute(input.route),
          threshold: Number(input.threshold ?? 0.3),
          excludedNames: input.excludedNames as string[] | undefined,
          requiredNames: input.requiredNames as string[] | undefined,
        },
      );
      return observed({
        ...result,
        prepared: preparations.issue(parsePreparedRoster(result.prepared), context.signal),
      });
    },
    ['overview.enter', 'operators.clear', 'operators.filter', 'operators.all'],
    true,
  );
  add(
    'game.infrast.confirm',
    '确认当前待选名单',
    'game',
    '对当前已准备角色确认一次；普通和协助名单先重新核对，提交异常不重放。',
    async (input, context) => {
      const trusted = preparations.consume(parsePreparedRoster(input.prepared));
      const capacity =
        trusted.role === 'trainee' ? undefined : (trusted.selected as RosterEvidence).room;
      return room(
        context,
        capacity,
        trusted.role === 'trainee'
          ? undefined
          : (trusted.selected as RosterEvidence).operators.length,
      ).confirm(trusted);
    },
    ['operators.confirm', 'operators.conflict'],
    true,
  );
  add(
    'game.infrast.verify_room',
    '复读房间角色',
    'game',
    '重新进入房间读取指定角色，与明确请求比较；不以确认回调代替实际进驻证据。',
    async (input, context) =>
      room(context).verifyRoom(
        parsePrepareRoster(input.request),
        parsePreparedRoster(input.prepared),
        input.before,
      ),
    ['overview.enter', 'operators.name', 'operators.filter', 'operators.all'],
    true,
  );

  // 业务流程分别组合队列轮换、整顿和逐房换班，保留各自的证据与部分完成结果。
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

  // 两条换班路径共用名单校验和批次编排，定位房间的方式由 route 传给游戏驱动。
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
  add(
    'workflow.infrast.custom_shift',
    '官方自定义计划换班',
    'workflow',
    '只读解析官方 plans[].rooms，先取得全部实际房间身份，再逐房准备、确认并复读。',
    async (input, context) =>
      workflows(context).customShift(
        input.plan,
        Number(input.planIndex ?? 0),
        input.sourceSha256 as string | undefined,
        input.facilities as AtomicFacility[] | undefined,
        Number(input.threshold ?? 0.3),
      ),
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
    'workflow.infrast.auto_room_shift',
    '常规单房自动换班',
    'workflow',
    '明确房间内按心情阈值和简单技能准备满员名单，再通过 JSON 确认并复读；不做跨房组合优化。',
    async (input, context) =>
      workflows(context).autoRoom({
        target: parseTarget(input.target),
        route: input.route === undefined ? 'room' : parseRoute(input.route),
        threshold: Number(input.threshold ?? 0.3),
        excludedNames: input.excludedNames as string[] | undefined,
        requiredNames: input.requiredNames as string[] | undefined,
      }),
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
    'workflow.infrast.daily',
    '常规基建换班',
    'workflow',
    '证明完整房间集合，按设施顺序自动准备并逐房确认；整轮再次枚举和复读全部名单。',
    async (input, context) =>
      workflows(context).daily(
        (input.facilities ?? [
          'Mfg',
          'Trade',
          'Power',
          'Control',
          'Reception',
          'Office',
          'Dorm',
        ]) as AtomicFacility[],
        Number(input.threshold ?? 0.3),
      ),
    [
      'base.entered',
      'overview.enter',
      'operators.clear',
      'operators.confirm',
      'operators.conflict',
      'operators.filter',
      'operators.all',
    ],
    true,
  );
  return entries;
}
