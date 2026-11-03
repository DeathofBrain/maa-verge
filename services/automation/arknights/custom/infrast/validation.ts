/** 在操作前收窄输入并检查房间身份、容量上限和跨房间分配。 */
import { AtomicFailure } from '#automation/core/errors';
import {
  atomicFacilities,
  type AtomicFacility,
  type AtomicRoomShiftInput,
  type AtomicRoomTarget,
  type InfrastRoute,
  type PrepareRosterInput,
  type PreparedRosterEvidence,
  type RosterEvidence,
} from './types';

// 仅用于身份比较；实际传给页面的姓名仍保留用户输入的字形。
export const normalize = (name: string) => name.normalize('NFKC').replace(/\s+/g, '').trim();
// 名单顺序不影响进驻结果，但人数及每个姓名都必须一致。
export const sameNames = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().every((name, index) => name === [...b].sort()[index]);

// 这里只限制设施容量上限，实际已开放容量仍需从游戏页面读取。
export const capacityCeilings: Record<AtomicFacility, number> = {
  Mfg: 3,
  Trade: 3,
  Power: 1,
  Control: 5,
  Reception: 2,
  Office: 1,
  Dorm: 5,
  Processing: 1,
  Training: 1,
  Recycle: 2,
};
/** 输入须已通过 parseTarget；重复设施依靠完整位置证明身份，单例设施只接受序号 1。 */
export function validateRoomIdentity(target: AtomicRoomTarget) {
  if (['Mfg', 'Trade', 'Power', 'Dorm'].includes(target.facility)) {
    if (
      !target.position ||
      !/^(?:B[1-4][0-9]{2}|[1-4]F[0-9]{2}|(?:B[1-4]|[1-4]F)-[1-9])$/i.test(target.position)
    )
      throw new AtomicFailure(
        '重复设施必须提供可在游戏中核对的完整房间 position（如 B101）；当前可见序号不能证明全局身份',
        'unavailable',
      );
  } else if (target.room !== 1)
    throw new AtomicFailure('当前适配的单例设施只支持 room=1', 'unavailable');
}
/** 在动作前检查重复房间与显式干员分配，避免后一个房间破坏前一个房间的名单。 */
export function validateAssignments(rooms: AtomicRoomShiftInput[]) {
  const roomKeys = new Set<string>(),
    positions = new Set<string>(),
    assignments = new Map<string, string>();
  for (const room of rooms) {
    validateRoomIdentity(room);
    // 同时检查类型内序号和全局位置，拦住两种描述指向同一房间的请求。
    const key = `${room.facility}:${room.room}`;
    if (roomKeys.has(key)) throw new AtomicFailure('同一批次不能重复安排同一房间');
    roomKeys.add(key);
    if (room.position) {
      const position = normalize(room.position).toUpperCase();
      if (positions.has(position)) throw new AtomicFailure('同一批次不能重复安排同一房间 position');
      positions.add(position);
    }
    // 普通房间和训练双角色共用分配表；省略角色留待提交后的最终复核。
    for (const operator of room.facility === 'Training'
      ? [room.trainee, room.assistant].filter((item): item is string => item !== undefined)
      : (room.operators ?? [])) {
      const old = assignments.get(normalize(operator));
      if (old)
        throw new AtomicFailure(
          `干员 ${operator} 同时分配到 ${old} 和 ${key}，后一次迁移会破坏已确认名单`,
        );
      assignments.set(normalize(operator), key);
    }
  }
}
// 姓名只接受有界的明确字符串，不在这里推断简称或 OCR 别名。
function name(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 100)
    throw new AtomicFailure(`${field} 必须是明确干员姓名`);
  return value.trim();
}
/** 将注册表输入收窄为明确目标；能否证明游戏中的房间身份另由 validateRoomIdentity 检查。 */
export function parseTarget(value: unknown): AtomicRoomTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AtomicFailure('房间必须是对象');
  const input = value as Record<string, unknown>;
  if (
    !atomicFacilities.includes(input.facility as AtomicFacility) ||
    !Number.isInteger(input.room) ||
    Number(input.room) < 1 ||
    Number(input.room) > 9
  )
    throw new AtomicFailure('房间需要明确设施类型和从 1 开始的序号');
  if (
    input.position !== undefined &&
    (typeof input.position !== 'string' || !/^[A-Za-z0-9\-]{1,32}$/.test(input.position))
  )
    throw new AtomicFailure('房间位置标识无效');
  // 输出位置统一大写，并沿用页面身份比较的规范化方式。
  return {
    facility: input.facility as AtomicFacility,
    room: Number(input.room),
    ...(typeof input.position === 'string'
      ? { position: normalize(input.position).toUpperCase() }
      : {}),
  };
}
/** 解析显式换班请求：普通房间必须给完整名单；训练室省略的角色表示保持原值。 */
export function parseRoomShift(value: unknown): AtomicRoomShiftInput {
  const target = parseTarget(value),
    input = value as Record<string, unknown>;
  const result: AtomicRoomShiftInput = { ...target };
  // 训练双角色具有不同入口和锁定约束，不能转换成普通 operators 数组。
  if (target.facility === 'Training') {
    if (input.operators !== undefined)
      throw new AtomicFailure(
        '训练室必须分别指定 trainee 和 assistant，不能把双角色展平成普通名单',
      );
    if (input.trainee !== undefined) result.trainee = name(input.trainee, 'trainee');
    if (input.assistant !== undefined) result.assistant = name(input.assistant, 'assistant');
    if (result.trainee === undefined && result.assistant === undefined)
      throw new AtomicFailure('训练室至少明确指定一个角色；省略的角色保持不变');
    if (
      result.trainee !== undefined &&
      result.assistant !== undefined &&
      normalize(result.trainee) === normalize(result.assistant)
    )
      throw new AtomicFailure('受训者和协助者不能是同一干员');
  } else {
    if (input.trainee !== undefined || input.assistant !== undefined)
      throw new AtomicFailure('只有训练室使用 trainee／assistant');
    if (!Array.isArray(input.operators) || input.operators.length > 5)
      throw new AtomicFailure('operators 必须是明确名单，空数组表示清空');
    // 空数组是有意清空；去重检查使用规范化姓名，但输出保留原始可读姓名。
    result.operators = input.operators.map((value) => name(value, 'operators'));
    if (new Set(result.operators.map(normalize)).size !== result.operators.length)
      throw new AtomicFailure('名单包含重复干员');
  }
  return result;
}

/** 低层组件的目标对象须精确，避免把业务字段无意传入页面驱动。 */
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));

/** 路线是明确的页面选择，不根据当前页面静默改走另一条导航路径。 */
export function parseRoute(value: unknown): InfrastRoute {
  if (value !== 'room' && value !== 'overview') throw new AtomicFailure('房间导航路线无效');
  return value;
}

/** 将 L3 准备请求收窄到某个房间和名单角色；真正的容量仍在操作前读游戏页面。 */
export function parsePrepareRoster(value: unknown): PrepareRosterInput {
  if (!object(value) || !exactKeys(value, ['target', 'route', 'role', 'operators', 'name']))
    throw new AtomicFailure('名单准备请求无效');
  if (!object(value.target) || !exactKeys(value.target, ['facility', 'room', 'position']))
    throw new AtomicFailure('名单准备目标无效');
  const target = parseTarget(value.target),
    route = parseRoute(value.route),
    role = value.role;
  validateRoomIdentity(target);
  if (role !== 'normal' && role !== 'trainee' && role !== 'assistant')
    throw new AtomicFailure('名单角色无效');
  if ((role === 'normal') === (target.facility === 'Training'))
    throw new AtomicFailure('训练角色与普通设施名单不能混用');
  if (role === 'trainee') {
    if (value.operators !== undefined) throw new AtomicFailure('受训者只接受明确的 name');
    return { target, route, role, name: name(value.name, 'name') };
  }
  if (value.name !== undefined || !Array.isArray(value.operators))
    throw new AtomicFailure('普通或协助者角色需要明确 operators 名单');
  const operators = value.operators.map((operator) => name(operator, 'operators'));
  if (
    operators.length > (role === 'assistant' ? 1 : capacityCeilings[target.facility]) ||
    new Set(operators.map(normalize)).size !== operators.length
  )
    throw new AtomicFailure('名单人数超限或包含重复干员');
  return { target, route, role, operators };
}

/** 只验证证据结构；容量和选中状态在 confirm 中仍须重新观察，不能信任调用方描述。 */
export function isRosterEvidence(value: unknown): value is RosterEvidence {
  return (
    object(value) &&
    typeof value.frameId === 'string' &&
    value.frameId.length > 0 &&
    Array.isArray(value.operators) &&
    value.operators.length <= 5 &&
    value.operators.every((operator) => typeof operator === 'string' && operator.length > 0) &&
    new Set(value.operators).size === value.operators.length &&
    Number.isInteger(value.capacity) &&
    Number(value.capacity) >= 1 &&
    Number(value.capacity) <= 5 &&
    value.operators.length <= Number(value.capacity)
  );
}

/** prepared 只携带当前角色的待选证据，不能通过嵌套对象指定额外动作。 */
export function parsePreparedRoster(value: unknown): PreparedRosterEvidence {
  if (
    !object(value) ||
    !exactKeys(value, ['target', 'route', 'role', 'before', 'selected', 'selectionAttempt'])
  )
    throw new AtomicFailure('待确认名单证据无效');
  const request = parsePrepareRoster({
    target: value.target,
    route: value.route,
    role: value.role,
    ...(value.role === 'trainee'
      ? { name: object(value.selected) ? value.selected.trainee : undefined }
      : { operators: object(value.selected) ? value.selected.operators : undefined }),
  });
  if (request.role !== 'trainee' && !isRosterEvidence(value.selected))
    throw new AtomicFailure('待确认的选中名单缺少完整计数证据');
  if (
    value.selectionAttempt !== undefined &&
    (!object(value.selectionAttempt) ||
      !exactKeys(value.selectionAttempt, ['capacity', 'clicked']) ||
      (value.selectionAttempt.capacity !== undefined &&
        (!Number.isInteger(value.selectionAttempt.capacity) ||
          Number(value.selectionAttempt.capacity) < 1 ||
          Number(value.selectionAttempt.capacity) > 5)) ||
      (value.selectionAttempt.clicked !== undefined &&
        (!Array.isArray(value.selectionAttempt.clicked) ||
          value.selectionAttempt.clicked.length > 5 ||
          !value.selectionAttempt.clicked.every((operator) => typeof operator === 'string'))))
  )
    throw new AtomicFailure('名单选择步骤证据无效');
  return value as unknown as PreparedRosterEvidence;
}
