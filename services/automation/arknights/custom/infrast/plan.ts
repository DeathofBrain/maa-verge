/** 官方自定义基建计划的只读解析：保留原文档，逐项拒绝尚不能等价执行的主动语义。
 * 字段基线为 v6.21.2 InfrastTask::parse_and_set_custom_config；空意图遵循
 * InfrastAbstractTask::check_room_shift_intent，不把缺省／空名单转成清空或整房自动换血。 */
import { AtomicFailure } from '#automation/core/errors';
import type { AtomicFacility, AtomicResourceProfile, AtomicRoomShiftInput } from './types';
import { normalize, parseRoomShift } from './validation';
import { resolveOperatorName } from './names';

/** 宿主在预检前读取的一次性快照；摘要描述原始字节，不重写用户文件。 */
export type CustomInfrastPlanSnapshot = { document: unknown; sha256: string };
export type ParsedCustomInfrastPlan = {
  planIndex: number;
  name?: string;
  /** 官方数组序号仍只定位候选；运行时须取得游戏总览的完整位置才能提交。 */
  rooms: AtomicRoomShiftInput[];
  autoFillRooms?: string[];
};

const roomFacilities: Readonly<Record<string, AtomicFacility>> = {
  trading: 'Trade',
  manufacture: 'Mfg',
  power: 'Power',
  dormitory: 'Dorm',
  control: 'Control',
  meeting: 'Reception',
  hire: 'Office',
  processing: 'Processing',
};
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const reject = (path: string, reason: string): never => {
  throw new AtomicFailure(`自定义基建 ${path}：${reason}`, 'unavailable');
};

/** 只接受官方 plans[].rooms 结构；元数据可保留，执行字段必须有明确且已实现的语义。 */
export function parseCustomInfrastPlan(
  document: unknown,
  planIndex = 0,
  facilities?: readonly AtomicFacility[],
): ParsedCustomInfrastPlan {
  if (!record(document) || !Array.isArray(document.plans))
    return reject('plans', '必须使用官方自定义基建文档，不能替换为私有房间数组');
  if (!Number.isInteger(planIndex) || planIndex < 0 || planIndex >= document.plans.length)
    return reject('plan_index', '所选计划不存在');
  const plan = document.plans[planIndex];
  if (!record(plan) || !record(plan.rooms)) return reject(`plans[${planIndex}]`, '缺少 rooms');
  const prefix = `plans[${planIndex}]`;
  // 描述、时间和名称只展示；主动计划扩展必须明确禁用，不能悄悄漏执行。
  const metadata = new Set([
    'name',
    'description',
    'description_pre',
    'description_post',
    'period',
    'rooms',
  ]);
  for (const [field, value] of Object.entries(plan)) {
    if (metadata.has(field)) continue;
    if (['Fiammetta', 'drones'].includes(field) && record(value) && value.enable === false)
      continue;
    reject(`${prefix}.${field}`, '该计划扩展尚未完成迁移，未开始换班');
  }
  const rooms: AtomicRoomShiftInput[] = [];
  const autoFillRooms: string[] = [];
  const assigned = new Map<string, string>();
  for (const [key, entries] of Object.entries(plan.rooms)) {
    const facility = roomFacilities[key];
    if (!facility) reject(`${prefix}.rooms.${key}`, '未知官方设施类型');
    if (facilities && !facilities.includes(facility!)) continue;
    if (!Array.isArray(entries) || entries.length > 9)
      reject(`${prefix}.rooms.${key}`, '设施必须是至多 9 个房间的数组');
    for (const [index, value] of (entries as unknown[]).entries()) {
      const path = `${prefix}.rooms.${key}[${index}]`;
      if (!record(value)) reject(path, '房间必须是对象');
      const room = value as Record<string, unknown>;
      if (room.skip !== undefined && typeof room.skip !== 'boolean')
        reject(`${path}.skip`, '必须是布尔值');
      if (room.skip === true) continue;
      for (const [field, option] of Object.entries(room)) {
        if (['skip', 'operators'].includes(field)) continue;
        if (field === 'autofill' && typeof option === 'boolean') continue;
        if (field === 'sort' && option === false) continue;
        reject(`${path}.${field}`, '该房间选项尚未完成迁移，未开始换班');
      }
      if (!['Mfg', 'Trade', 'Power', 'Dorm'].includes(facility!) && index > 0)
        reject(path, '单例设施不能声明第二个房间');
      const input = parseRoomShift({ facility, room: index + 1, operators: room.operators ?? [] });
      // 官方 check_room_shift_intent：空名单且未启用补位是保持原房，不能转换成清空动作。
      if (!input.operators!.length && room.autofill !== true) continue;
      if (room.autofill === true) {
        if (['Processing', 'Training', 'Recycle'].includes(facility!))
          reject(path, '该设施尚无自动补位策略');
        autoFillRooms.push(`${facility}:${index + 1}`);
      }
      for (const operator of input.operators!) {
        const identity = normalize(operator);
        if (assigned.has(identity))
          reject(path, `干员 ${operator} 已分配到 ${assigned.get(identity)}，不能跨房重复使用`);
        assigned.set(identity, path);
      }
      rooms.push(input);
    }
  }
  if (rooms.length > 32) reject(`${prefix}.rooms`, '至多支持 32 个有效房间');
  return {
    planIndex,
    ...(typeof plan.name === 'string' ? { name: plan.name } : {}),
    rooms,
    ...(autoFillRooms.length ? { autoFillRooms } : {}),
  };
}

/** 在连接、返回主页及强制停止前核对静态输入；动态容量与候选仍须由实际房间观察证明。 */
export function checkCustomInfrastPlanResources(
  profile: AtomicResourceProfile,
  plan: ParsedCustomInfrastPlan,
): string[] {
  const issues: string[] = [];
  // 整份所选计划先查同代完整姓名；不因前房可用就容许末房未知姓名延迟到提交阶段。
  for (const room of plan.rooms)
    for (const name of room.operators ?? []) {
      const resolved = resolveOperatorName(profile, name);
      if (!resolved.nameVerified || resolved.name !== name)
        issues.push(
          `自定义基建 ${room.facility} 第 ${room.room} 房干员 ${name} 不是当前官方字典的完整姓名`,
        );
    }
  // 自动补位才依赖额外像素／技能资源；纯明确名单不能被无关自动策略资源阻断。
  if (plan.autoFillRooms?.length) {
    const missing = [
      ...(!profile.card?.moodOffset ? ['心情观察'] : []),
      ...(!profile.card?.skillOffset || !profile.skills ? ['简单技能观察'] : []),
    ];
    if (missing.length) issues.push(`自定义基建自动补位缺少同代资源：${missing.join('、')}`);
  }
  return issues;
}
