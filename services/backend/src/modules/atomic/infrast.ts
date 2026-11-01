import {
  atomicFacilities,
  type AtomicBox,
  type AtomicCapabilityResult,
  type AtomicExecutionContext,
  type AtomicFacility,
  type AtomicFrame,
  type AtomicMatch,
  type AtomicOperatorCard,
  type AtomicOperatorObservation,
  type AtomicRoomShiftInput,
  type AtomicRoomTarget,
} from './types';
import { AtomicFailure, AtomicVision, checkCancelled, ordered } from './vision';

export type OverviewRow = AtomicRoomTarget & { box: AtomicBox; identity: string };
export type OverviewObservation = { frameId: string; rows: OverviewRow[]; texts: string[] };
export type TrainingObservation = { frameId: string; locked: boolean; trainee?: string };
export type TrimObservation = { frameId: string; texts: string[] };
export type RosterEvidence = { operators: string[]; capacity: number; frameId: string };
export type InfrastRoute = 'overview' | 'room';
type Role = 'trainee' | 'assistant';
/** Test ports replace this boundary; production always uses createInfrastDriver's real recognitions. */
export interface InfrastDriver {
  preflight?(target: AtomicRoomTarget): void;
  overview(): Promise<OverviewObservation>;
  enterOverview(): Promise<OverviewObservation>;
  rotateQueue(): Promise<void>;
  enterTrim(): Promise<TrimObservation>;
  trim(): Promise<void>;
  trimObservation(): Promise<TrimObservation>;
  openRoom(target: AtomicRoomTarget, route: InfrastRoute): Promise<void>;
  openRoster(target: AtomicRoomTarget, role?: Role): Promise<void>;
  operators(): Promise<AtomicOperatorObservation>;
  resetFilter(): Promise<void>;
  page(direction: 'left' | 'right'): Promise<void>;
  clickOperator(card: AtomicOperatorCard): Promise<void>;
  clear(): Promise<void>;
  confirm(role?: Role): Promise<void>;
  training(): Promise<TrainingObservation>;
  chooseTrainee(name: string): Promise<void>;
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const normalize = (name: string) => name.normalize('NFKC').replace(/\s+/g, '').trim();
const sameNames = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().every((name, index) => name === [...b].sort()[index]);

/** Pure-color Mini also fits a Full stripe; only a Full hit establishes normal view. */
export async function observeFacility(vision: AtomicVision, facility: AtomicFacility) {
  const frame = await vision.frame();
  const full = vision.profile.rules[`facility.icon.${facility}`];
  const mini = vision.profile.rules[`facility.icon.${facility}.mini`];
  const normal = full ? await vision.recognize(frame, full) : { matches: [], hit: false };
  const pureColor = ['Mfg', 'Trade', 'Power'].includes(facility);
  if (pureColor && normal.hit)
    return { frame, matches: ordered(normal.matches), view: 'normal' as const };
  const small = mini ? await vision.recognize(frame, mini) : { matches: [], hit: false };
  if (pureColor && small.hit)
    return { frame, matches: ordered(small.matches), view: 'unknown' as const };
  const best = (matches: AtomicMatch[]) => Math.max(0, ...matches.map((match) => match.score));
  if (normal.hit || small.hit)
    return best(normal.matches) >= best(small.matches)
      ? { frame, matches: ordered(normal.matches), view: 'normal' as const }
      : { frame, matches: ordered(small.matches), view: 'mini' as const };
  const label = await vision.recognize(frame, vision.rule(`facility.label.${facility}`));
  return { frame, matches: ordered(label.matches), view: 'unknown' as const };
}
// Sanity ceilings from MaaCore facility classes. Actual unlocked capacity must still be read.
const capacityCeilings: Record<AtomicFacility, number> = {
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
/** Ordinals are not identities when the game's map/overview may already be scrolled. */
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
function validateAssignments(rooms: AtomicRoomShiftInput[]) {
  const roomKeys = new Set<string>(),
    positions = new Set<string>(),
    assignments = new Map<string, string>();
  for (const room of rooms) {
    validateRoomIdentity(room);
    const key = `${room.facility}:${room.room}`;
    if (roomKeys.has(key)) throw new AtomicFailure('同一批次不能重复安排同一房间');
    roomKeys.add(key);
    if (room.position) {
      const position = normalize(room.position).toUpperCase();
      if (positions.has(position)) throw new AtomicFailure('同一批次不能重复安排同一房间 position');
      positions.add(position);
    }
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
function name(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 100)
    throw new AtomicFailure(`${field} 必须是明确干员姓名`);
  return value.trim();
}
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
  return {
    facility: input.facility as AtomicFacility,
    room: Number(input.room),
    ...(typeof input.position === 'string'
      ? { position: normalize(input.position).toUpperCase() }
      : {}),
  };
}
export function parseRoomShift(value: unknown): AtomicRoomShiftInput {
  const target = parseTarget(value),
    input = value as Record<string, unknown>;
  const result: AtomicRoomShiftInput = { ...target };
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
    result.operators = input.operators.map((value) => name(value, 'operators'));
    if (new Set(result.operators.map(normalize)).size !== result.operators.length)
      throw new AtomicFailure('名单包含重复干员');
  }
  return result;
}

/** Finite, deterministic business orchestration; no native task graph, retries or resource writes. */
export class InfrastWorkflows {
  constructor(
    readonly driver: InfrastDriver,
    readonly context: AtomicExecutionContext = {},
  ) {}
  private progress(message: string, data?: unknown) {
    checkCancelled(this.context);
    this.context.onProgress?.({ capabilityId: 'workflow.infrast', message, data });
  }
  private failure(
    error: unknown,
    data: Record<string, unknown>,
    committed = false,
  ): AtomicCapabilityResult {
    return {
      status: this.context.signal?.aborted
        ? 'cancelled'
        : committed
          ? 'unknown'
          : error instanceof AtomicFailure
            ? error.status
            : 'unknown',
      data,
      verified: false,
      message: message(error),
    };
  }
  async queueRotate(expectedRooms: AtomicRoomShiftInput[] = []): Promise<AtomicCapabilityResult> {
    let before: OverviewObservation | undefined,
      after: OverviewObservation | undefined,
      accepted = false,
      attempted = false;
    const checkedRooms: { target: AtomicRoomShiftInput; result: AtomicCapabilityResult }[] = [];
    try {
      validateAssignments(expectedRooms);
      for (const target of expectedRooms) this.driver.preflight?.(target);
      before = await this.driver.enterOverview();
      this.progress('已确认游戏总览，执行一次队列轮换');
      attempted = true;
      await this.driver.rotateQueue();
      accepted = true;
      after = await this.driver.overview();
      for (const target of expectedRooms) {
        const result = await this.readRoom(target, 'room');
        checkedRooms.push({ target, result });
        const actual = result.data as Record<string, unknown>;
        if (
          result.status !== 'completed' ||
          (target.facility === 'Training'
            ? (target.trainee !== undefined && actual.trainee !== target.trainee) ||
              (target.assistant !== undefined && actual.assistant !== target.assistant)
            : !Array.isArray(actual.operators) ||
              !sameNames(actual.operators as string[], target.operators!))
        )
          throw new AtomicFailure('一键轮换后实际进驻名单未能与明确期望全部吻合', 'unknown');
      }
      if (expectedRooms.length)
        return {
          status: 'completed',
          data: { before, after, checkedRooms, actionCount: 1, trimExecuted: false },
          nativeSuccess: true,
          verified: true,
        };
      // The official source immediately proceeds to Trim; that side effect is deliberately excluded.
      // A new screenshot and an accepted input cannot prove that every game's queue was applied.
      return {
        status: 'unknown',
        data: { before, after, checkedRooms, actionCount: 1, trimExecuted: false },
        nativeSuccess: true,
        verified: false,
        message:
          '轮换点击已被原生接受；已重新读取总览，但未取得足以证明全部进驻名单的证据。不会自动重放。',
      };
    } catch (error) {
      return {
        ...this.failure(
          error,
          { before, after, checkedRooms, actionCount: attempted ? 1 : 0, trimExecuted: false },
          accepted,
        ),
        ...(accepted ? { nativeSuccess: true } : {}),
      };
    }
  }
  async trim(): Promise<AtomicCapabilityResult> {
    let before: TrimObservation | undefined,
      after: TrimObservation | undefined,
      attempted = false,
      accepted = false;
    try {
      before = await this.driver.enterTrim();
      this.progress('已确认游戏整顿页，执行一次整顿');
      attempted = true;
      await this.driver.trim();
      accepted = true;
      after = await this.driver.trimObservation();
      return {
        status: 'unknown',
        data: { before, after, actionCount: 1, queueRotationExecuted: false },
        nativeSuccess: true,
        verified: false,
        message: '整顿点击已被原生接受并重新读取画面；尚无逐房名单证据，不自动重放。',
      };
    } catch (error) {
      return {
        ...this.failure(
          error,
          { before, after, actionCount: attempted ? 1 : 0, queueRotationExecuted: false },
          accepted,
        ),
        ...(accepted ? { nativeSuccess: true } : {}),
      };
    }
  }
  /** Gather selected names from every necessary page, using the game's actual counter. */
  async roster(maxCapacity = 5): Promise<RosterEvidence> {
    await this.driver.resetFilter();
    let current = await this.driver.operators();
    const capacity = current.capacity,
      selectedCount = current.selectedCount;
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > maxCapacity)
      throw new AtomicFailure(
        `当前页面容量 ${capacity} 超出该设施上限 ${maxCapacity}，拒绝使用异常识别结果`,
      );
    const selected = new Set<string>();
    const pages = new Set<string>();
    const collect = (observation: AtomicOperatorObservation) => {
      if (observation.capacity !== capacity || observation.selectedCount !== selectedCount)
        throw new AtomicFailure('扫描过程中进驻计数发生变化，拒绝使用混合画面确认名单');
      for (const card of observation.cards) if (card.selected) selected.add(card.name);
      if (selected.size > selectedCount) throw new AtomicFailure('选中姓名与游戏计数不一致');
    };
    if (selectedCount === 0) return { operators: [], capacity, frameId: current.frameId };
    // Return to the start without assuming a horizontal scroll position.
    for (let index = 0; index < 100; index++) {
      collect(current);
      if (selected.size === selectedCount)
        return { operators: [...selected], capacity, frameId: current.frameId };
      const identity = current.pageIdentity;
      await this.driver.page('left');
      current = await this.driver.operators();
      if (current.pageIdentity === identity) break;
      if (index === 99) throw new AtomicFailure('干员列表回到起点超出 100 页界限');
    }
    for (let index = 0; index < 100; index++) {
      collect(current);
      if (selected.size === selectedCount)
        return { operators: [...selected], capacity, frameId: current.frameId };
      if (pages.has(current.pageIdentity)) break;
      pages.add(current.pageIdentity);
      await this.driver.page('right');
      current = await this.driver.operators();
    }
    throw new AtomicFailure(`只识别到 ${selected.size}/${selectedCount} 位已选干员，名单不完整`);
  }
  async readRoom(
    target: AtomicRoomTarget,
    route: InfrastRoute = 'room',
  ): Promise<AtomicCapabilityResult> {
    try {
      validateRoomIdentity(target);
      await this.driver.openRoom(target, route);
      if (target.facility === 'Training') {
        const training = await this.driver.training();
        await this.driver.openRoster(target, 'assistant');
        const assistant = await this.roster(1);
        if (assistant.capacity !== 1 || assistant.operators.length > 1)
          throw new AtomicFailure('训练协助者列表容量不是当前适配的单角色');
        return {
          status: training.trainee === undefined ? 'unknown' : 'completed',
          data: {
            target,
            ...training,
            assistant: assistant.operators[0] ?? null,
            assistantEvidence: assistant,
          },
          verified: training.trainee !== undefined,
          ...(training.trainee === undefined
            ? { message: '协助者已核验，但当前房间页无法区分受训者姓名缺失与未进驻' }
            : {}),
        };
      }
      await this.driver.openRoster(target);
      return {
        status: 'completed',
        data: { target, ...(await this.roster(capacityCeilings[target.facility])) },
        verified: true,
      };
    } catch (error) {
      return this.failure(error, { target });
    }
  }
  private async selectExact(
    requested: string[],
    maxCapacity: number,
    attempt: Record<string, unknown>,
  ): Promise<RosterEvidence> {
    await this.driver.resetFilter();
    const initial = await this.driver.operators();
    attempt.capacity = initial.capacity;
    const clicked: string[] = [];
    attempt.clicked = clicked;
    if (initial.capacity > maxCapacity) throw new AtomicFailure('实际容量超出当前设施的硬性上限');
    if (requested.length > initial.capacity)
      throw new AtomicFailure(
        `当前房间实际开放 ${initial.capacity} 个位置，不能安排 ${requested.length} 人`,
      );
    await this.driver.clear();
    let current = await this.driver.operators();
    if (current.selectedCount !== 0) throw new AtomicFailure('清空后游戏已选计数未归零，已停止');
    if (!requested.length)
      return { operators: [], capacity: current.capacity, frameId: current.frameId };
    for (let index = 0; index < 100; index++) {
      const identity = current.pageIdentity;
      await this.driver.page('left');
      current = await this.driver.operators();
      if (current.pageIdentity === identity) break;
      if (index === 99) throw new AtomicFailure('干员列表无法确定第一页');
    }
    const selected = new Set<string>(),
      pages = new Set<string>();
    for (let index = 0; index < 100; index++) {
      checkCancelled(this.context);
      if (current.capacity !== initial.capacity)
        throw new AtomicFailure('选人过程中实际容量发生变化');
      const candidates = requested.filter(
        (name) => !selected.has(name) && current.cards.some((card) => card.name === name),
      );
      for (const target of candidates) {
        // Re-observe after every mutation. The driver rechecks the exact name on a fresh frame before clicking.
        current = await this.driver.operators();
        const card = current.cards.find((card) => card.name === target);
        if (!card) throw new AtomicFailure(`干员 ${target} 在操作前消失，选人已停止`);
        if (card.selected) throw new AtomicFailure('选中状态与本次已确认动作不一致');
        await this.driver.clickOperator(card);
        clicked.push(target);
        this.progress('已点击明确干员，等待重读选中状态', { name: target });
        selected.add(target);
        current = await this.driver.operators();
        if (current.selectedCount !== selected.size)
          throw new AtomicFailure('点击后游戏已选计数与明确名单不一致');
      }
      if (selected.size === requested.length) {
        const verified = await this.roster(maxCapacity);
        if (!sameNames(verified.operators, requested))
          throw new AtomicFailure('确认前的选中名单与请求不一致');
        return verified;
      }
      if (pages.has(current.pageIdentity)) break;
      pages.add(current.pageIdentity);
      await this.driver.page('right');
      current = await this.driver.operators();
    }
    throw new AtomicFailure(
      `未在完整可读列表中找到：${requested.filter((name) => !selected.has(name)).join('、')}`,
    );
  }
  async setRoom(input: AtomicRoomShiftInput, route: InfrastRoute): Promise<AtomicCapabilityResult> {
    const evidence: Record<string, unknown> = { target: input, route, phase: 'open' };
    let committed = false;
    try {
      validateRoomIdentity(input);
      await this.driver.openRoom(input, route);
      if (input.facility === 'Training') return await this.setTraining(input, route, evidence);
      await this.driver.openRoster(input);
      evidence.before = await this.roster(capacityCeilings[input.facility]);
      evidence.phase = 'select';
      const selectionAttempt = {};
      evidence.selectionAttempt = selectionAttempt;
      evidence.selected = await this.selectExact(
        input.operators!,
        capacityCeilings[input.facility],
        selectionAttempt,
      );
      this.progress('确认前名单已逐名核对', evidence.selected);
      evidence.phase = 'confirm';
      // An ambiguous native failure can still have applied the confirmation. Never replay it.
      committed = true;
      await this.driver.confirm();
      evidence.phase = 'reread';
      await this.driver.openRoom(input, route);
      await this.driver.openRoster(input);
      const after = await this.roster(capacityCeilings[input.facility]);
      evidence.after = after;
      if (!sameNames(after.operators, input.operators!))
        throw new AtomicFailure('确认后重新打开房间，实际进驻名单与请求不一致', 'unknown');
      evidence.phase = 'verified';
      return { status: 'completed', data: evidence, verified: true, nativeSuccess: true };
    } catch (error) {
      return this.failure(error, evidence, committed);
    }
  }
  private async setTraining(
    input: AtomicRoomShiftInput,
    route: InfrastRoute,
    evidence: Record<string, unknown>,
  ): Promise<AtomicCapabilityResult> {
    let committed = false;
    try {
      const before = await this.driver.training();
      evidence.before = before;
      if (input.trainee !== undefined && before.locked && input.trainee !== before.trainee)
        throw new AtomicFailure('训练正在进行，受训者锁定；未更换任何角色');
      if (input.trainee === undefined && before.trainee === undefined)
        throw new AtomicFailure(
          '无法读出应保持不变的受训者，不能声称双角色均已核验',
          'unavailable',
        );
      await this.driver.openRoster(input, 'assistant');
      const assistantBefore = await this.roster(1);
      evidence.assistantBefore = assistantBefore;
      await this.driver.openRoom(input, route);
      if (input.trainee !== undefined && input.trainee !== before.trainee) {
        evidence.phase = 'trainee';
        await this.driver.openRoster(input, 'trainee');
        await this.driver.chooseTrainee(input.trainee);
        committed = true;
        await this.driver.confirm('trainee');
        await this.driver.openRoom(input, route);
        const traineeAfter = await this.driver.training();
        evidence.traineeAfter = traineeAfter;
        if (traineeAfter.trainee !== input.trainee)
          throw new AtomicFailure('受训者确认后姓名未能重读为请求值', 'unknown');
      }
      if (input.assistant !== undefined) {
        evidence.phase = 'assistant';
        await this.driver.openRoster(input, 'assistant');
        const selectionAttempt = {};
        evidence.selectionAttempt = selectionAttempt;
        evidence.assistantSelected = await this.selectExact([input.assistant], 1, selectionAttempt);
        committed = true;
        await this.driver.confirm('assistant');
        await this.driver.openRoom(input, route);
        await this.driver.openRoster(input, 'assistant');
        const assistantAfter = await this.roster(1);
        evidence.assistantAfter = assistantAfter;
        if (
          assistantAfter.capacity !== 1 ||
          !sameNames(assistantAfter.operators, [input.assistant])
        )
          throw new AtomicFailure('协助者确认后实际名单不一致', 'unknown');
      } else {
        await this.driver.openRoster(input, 'assistant');
        const assistantAfter = await this.roster(1);
        evidence.assistantAfter = assistantAfter;
        if (!sameNames(assistantBefore.operators, assistantAfter.operators))
          throw new AtomicFailure('省略的协助者在受训者换班后发生变化', 'unknown');
      }
      await this.driver.openRoom(input, route);
      const after = await this.driver.training();
      evidence.after = after;
      if (input.trainee !== undefined && after.trainee !== input.trainee)
        throw new AtomicFailure('训练室最终受训者未能确认', 'unknown');
      if (input.trainee === undefined && before.trainee !== after.trainee)
        throw new AtomicFailure('省略的受训者发生变化', 'unknown');
      if (before.locked !== after.locked)
        throw new AtomicFailure('训练锁定状态在换班期间改变，需重新检查', 'unknown');
      evidence.phase = 'verified';
      return {
        status: 'completed',
        data: evidence,
        verified: true,
        ...(committed ? { nativeSuccess: true } : {}),
      };
    } catch (error) {
      return this.failure(error, evidence, committed);
    }
  }
  async batch(rooms: AtomicRoomShiftInput[], route: InfrastRoute): Promise<AtomicCapabilityResult> {
    const results: { target: AtomicRoomTarget; result: AtomicCapabilityResult }[] = [];
    try {
      validateAssignments(rooms);
      for (const target of rooms) this.driver.preflight?.(target);
    } catch (error) {
      return this.failure(error, { rooms: [] });
    }
    for (const room of rooms) {
      if (this.context.signal?.aborted)
        return {
          status: 'cancelled',
          data: { rooms: results, remaining: rooms.slice(results.length) },
          verified: false,
        };
      this.progress('开始处理明确房间', room);
      const result = await this.setRoom(room, route);
      results.push({ target: room, result });
      if (result.status !== 'completed')
        return {
          status:
            result.status === 'cancelled'
              ? 'cancelled'
              : results.length > 1
                ? 'partial'
                : result.status,
          data: { rooms: results, remaining: rooms.slice(results.length) },
          verified: false,
          message: result.message,
        };
    }
    const finalChecks: { target: AtomicRoomTarget; result: AtomicCapabilityResult }[] = [];
    // A later room can pull an implicitly retained training role out of an earlier room.
    // Re-read the final state of every target before claiming the whole batch is verified.
    for (let index = 0; index < rooms.length; index++) {
      const target = rooms[index]!,
        checked = await this.readRoom(target, route);
      finalChecks.push({ target, result: checked });
      const actual = checked.data as Record<string, unknown>;
      const evidence = results[index]!.result.data as {
        before?: TrainingObservation;
        assistantBefore?: RosterEvidence;
      };
      const expectedTrainee = target.trainee ?? evidence.before?.trainee;
      const expectedAssistant = target.assistant ?? evidence.assistantBefore?.operators[0] ?? null;
      const matches =
        target.facility === 'Training'
          ? actual.trainee === expectedTrainee && actual.assistant === expectedAssistant
          : Array.isArray(actual.operators) &&
            sameNames(actual.operators as string[], target.operators!);
      if (checked.status !== 'completed' || !matches)
        return {
          status: checked.status === 'cancelled' ? 'cancelled' : 'partial',
          data: { rooms: results, remaining: [], finalChecks },
          verified: false,
          message:
            '批次最终复核未通过；后续房间可能改变了先前已确认的进驻或省略角色，不会自动重放。',
        };
    }
    return {
      status: 'completed',
      data: { rooms: results, remaining: [], finalChecks },
      verified: true,
      nativeSuccess: true,
    };
  }
}

/** Reviewed CN resource adaptation. Every coordinate click is preceded by page/identity recognition. */
export function createInfrastDriver(vision: AtomicVision): InfrastDriver {
  const rowOrder = (a: AtomicMatch, b: AtomicMatch) =>
    Math.abs(a.box[1] - b.box[1]) < 20 ? a.box[0] - b.box[0] : a.box[1] - b.box[1];
  const fullText = async (frame: AtomicFrame) => (await vision.texts(frame)).matches;
  const hasPosition = (texts: AtomicMatch[], position: string) =>
    texts.some((item) =>
      new RegExp(`(?:^|[^A-Z0-9])${normalize(position).toUpperCase()}(?:$|[^A-Z0-9])`, 'u').test(
        normalize(item.text ?? '').toUpperCase(),
      ),
    );
  const requireRoom = async (target: AtomicRoomTarget) => {
    const frame = await vision.frame();
    const label = await vision.recognize(
      frame,
      vision.rule(`facility.label.${target.facility}`),
      [0, 0, 600, 250],
    );
    if (!label.hit) throw new AtomicFailure('进入后未能核对设施标题，不会在未知房间选人');
    if (
      target.position &&
      !hasPosition(
        (await fullText(frame)).filter((item) => item.box[0] < 600 && item.box[1] < 250),
        target.position,
      )
    )
      throw new AtomicFailure('进入后房间位置标识与请求不符');
  };
  const base = async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      if ((await vision.match('base.entered')).hit) return;
      await vision.back();
    }
    throw new AtomicFailure('未能返回基建主页；不会自动从主界面运行其他任务');
  };
  const overview = async (): Promise<OverviewObservation> => {
    const frame = await vision.frame();
    if (!(await vision.recognize(frame, vision.rule('queue.rotate'))).hit)
      throw new AtomicFailure('当前画面未确认游戏总览的队列轮换入口');
    const texts = await fullText(frame),
      rows: OverviewRow[] = [];
    for (const facility of atomicFacilities) {
      const labels = (
        await vision.recognize(frame, vision.rule(`facility.label.${facility}`))
      ).matches.sort(rowOrder);
      for (const [index, label] of labels.entries()) {
        const positions = texts
          .filter((item) => Math.abs(item.box[1] - label.box[1]) < 55)
          .flatMap(
            (item) =>
              (item.text ?? '')
                .normalize('NFKC')
                .match(/\b(?:B[1-4][0-9]{2}|[1-4]F(?:-?[1-9])?|B[1-4](?:-?[1-9])?)\b/g) ?? [],
          );
        const unique = [...new Set(positions)];
        if (unique.length > 1) continue;
        rows.push({
          facility,
          room: index + 1,
          ...(unique[0] ? { position: unique[0] } : {}),
          box: label.box,
          identity: `${facility}:${unique[0] ?? normalize(label.text ?? '')}:${index + 1}`,
        });
      }
    }
    return { frameId: frame.frameId, rows, texts: texts.map((item) => item.text ?? '') };
  };
  const enterOverview = async () => {
    try {
      return await overview();
    } catch (error) {
      if (!(error instanceof AtomicFailure)) throw error;
    }
    await base();
    await vision.clickRule('overview.enter');
    return overview();
  };
  const enterMastery = async () => {
    if ((await vision.match('training.page')).hit) return;
    await requireRoom({ facility: 'Training', room: 1 });
    await vision.action('room.bottomTab');
    if (!(await vision.match('training.page')).hit)
      throw new AtomicFailure('尚未确认训练专精页，拒绝点击角色固定位置');
  };
  const preflight = (target: AtomicRoomTarget) => {
    validateRoomIdentity(target);
    if (target.facility === 'Processing' && !vision.profile.actions['processing.list'])
      throw new AtomicFailure('当前资源缺少独立加工站选人入口', 'unavailable');
    if (target.facility === 'Training') {
      for (const rule of [
        'training.idle',
        'training.processing',
        'training.operator',
        'training.page',
        'training.confirm',
        'training.expandRole',
        'training.allOcr',
        'training.collapseRole',
      ])
        vision.rule(rule);
      for (const action of ['room.bottomTab', 'training.trainee', 'training.assistant'])
        if (!vision.profile.actions[action])
          throw new AtomicFailure(`训练适配缺少明确动作 ${action}`, 'unavailable');
    }
  };
  const driver: InfrastDriver = {
    preflight,
    overview,
    enterOverview,
    rotateQueue: async () => {
      await vision.clickRule('queue.rotate');
    },
    async enterTrim() {
      await enterOverview();
      await vision.clickRule('trim.enter');
      if (!(await vision.match('trim.apply')).hit) throw new AtomicFailure('未能确认游戏整顿入口');
      return this.trimObservation();
    },
    trim: async () => {
      await vision.clickRule('trim.apply');
    },
    async trimObservation() {
      const frame = await vision.frame();
      return {
        frameId: frame.frameId,
        texts: (await fullText(frame)).map((item) => item.text ?? ''),
      };
    },
    async openRoom(target, route) {
      preflight(target);
      await base();
      if (route === 'overview') {
        await enterOverview();
        for (let page = 0; page < 20; page++) {
          const snapshot = await overview();
          const candidates = snapshot.rows.filter(
            (row) =>
              row.facility === target.facility &&
              (target.position ? row.position === target.position : row.room === target.room),
          );
          if (candidates.length === 1) {
            if (!target.position && page > 0)
              throw new AtomicFailure('滚动后的总览序号不构成房间身份，请提供 position');
            // Re-read the row on a fresh frame immediately before mutation.
            const frame = await vision.frame();
            const labels = (
              await vision.recognize(frame, vision.rule(`facility.label.${target.facility}`))
            ).matches.sort(rowOrder);
            const label = labels.find(
              (item) =>
                Math.abs(item.box[1] - candidates[0]!.box[1]) < 10 &&
                Math.abs(item.box[0] - candidates[0]!.box[0]) < 10,
            );
            if (!label) throw new AtomicFailure('操作前总览行发生变化');
            if (
              target.position &&
              !hasPosition(
                (await fullText(frame)).filter((item) => Math.abs(item.box[1] - label.box[1]) < 55),
                target.position,
              )
            )
              throw new AtomicFailure('操作前目标总览行的位置标识消失');
            await vision.click(frame, label.box);
            await vision.wait(500);
            await requireRoom(target);
            return;
          }
          if (!target.position) break;
          await vision.swipeOverview();
        }
        throw new AtomicFailure('总览未找到唯一目标行；请核对明确房间位置');
      }
      const { frame, matches, view } = await observeFacility(vision, target.facility);
      const match = matches[target.room - 1];
      if (!match) throw new AtomicFailure('基建主页未识别到指定设施序号；没有猜测设施坐标');
      vision.context.onProgress?.({
        capabilityId: 'game.infrast',
        message: '已识别设施入口，入房后继续核对完整位置',
        data: { target, view },
      });
      await vision.click(frame, match.box);
      await vision.wait(500);
      await requireRoom(target);
    },
    async openRoster(target, role) {
      if (target.facility === 'Training') {
        await enterMastery();
        if (!role) throw new AtomicFailure('训练选人必须指定角色');
        await vision.action(`training.${role}`);
        if (role === 'trainee') {
          await vision.clickRule('training.expandRole', true);
          const all = vision.profile.rules['training.all']
            ? await vision.clickRule('training.all', true)
            : false;
          if (!all) await vision.clickRule('training.allOcr');
          return;
        }
      } else {
        await requireRoom(target);
        if (target.facility === 'Processing') await vision.action('processing.list');
        else {
          await vision.clickRule('room.stationed', true);
          if (!(await vision.clickRule('room.list', true))) await vision.action('room.bottomTab');
        }
      }
      await vision.operators();
    },
    operators: () => vision.operators(),
    async resetFilter() {
      let opened = await vision.clickRule('operators.filter', true);
      if (!opened && vision.profile.rules['operators.filter.1'])
        opened = await vision.clickRule('operators.filter.1', true);
      if (!opened) throw new AtomicFailure('无法确认筛选入口，拒绝把受筛选列表当作完整名单');
      await vision.clickRule('operators.all');
      // The source defines disappearance of 全部 as the menu-closed condition.
      if ((await vision.match('operators.all')).hit)
        throw new AtomicFailure('全部筛选点击后菜单未关闭，列表状态未确认');
    },
    page: (direction) => vision.swipeOperators(direction),
    clickOperator: (card) => vision.clickCard(card),
    clear: async () => {
      await vision.clickRule('operators.clear');
    },
    async confirm(role) {
      if (role === 'trainee') {
        await vision.clickRule('training.collapseRole', true);
        await vision.clickRule('training.confirm');
        if (!(await vision.match('training.page')).hit)
          throw new AtomicFailure('受训者确认后未返回专精页', 'unknown');
      } else {
        await vision.action('operators.confirm');
        await vision.clickRule('operators.conflict', true);
        if (role === 'assistant' && !(await vision.match('training.page')).hit)
          throw new AtomicFailure('协助者确认后未返回专精页', 'unknown');
      }
    },
    async training() {
      const frame = await vision.frame();
      const idle = await vision.recognize(frame, vision.rule('training.idle'));
      const clock = await vision.recognize(frame, vision.rule('training.processing'));
      const locked = clock.matches.some((item) => /\d{1,2}:\d{2}/.test(item.text ?? ''));
      if (!idle.hit && !locked)
        throw new AtomicFailure(
          '训练状态既非已确认空闲也非有效剩余时间；不领取完成奖励或猜测锁定状态',
        );
      const nameSkill = await vision.recognize(frame, vision.rule('training.operator'));
      const names = [
        ...new Set(
          nameSkill.matches
            .filter((item) => (item.text ?? '').includes('\n'))
            .map((item) => item.text?.split('\n')[0]?.replace(/^\[/, '').trim())
            .filter((item): item is string => Boolean(item)),
        ),
      ];
      if (names.length > 1 || (locked && names.length !== 1))
        throw new AtomicFailure('无法唯一重读受训者姓名');
      return { frameId: frame.frameId, locked, ...(names[0] ? { trainee: names[0] } : {}) };
    },
    async chooseTrainee(name) {
      const pages = new Set<string>();
      for (let page = 0; page < 100; page++) {
        const frame = await vision.frame();
        const texts = await vision.recognize(
          frame,
          { ...vision.rule('operators.name'), onlyRec: false },
          [300, 80, 850, 570],
        );
        const matches = texts.matches.filter(
          (item) => normalize(item.text ?? '') === normalize(name),
        );
        if (matches.length > 1) throw new AtomicFailure('受训者列表姓名存在歧义');
        if (matches.length === 1) {
          // Exact OCR on a fresh image is the distinct quick-formation list adapter.
          await vision.click(frame, matches[0]!.box);
          await vision.wait(300);
          return;
        }
        const identity = texts.matches
          .map((item) => normalize(item.text ?? ''))
          .sort()
          .join('\u0000');
        if (!identity || pages.has(identity)) break;
        pages.add(identity);
        await vision.swipeOperators('right');
      }
      throw new AtomicFailure(
        '未在受训者列表找到明确干员；可能未拥有、未精二或专精已满。未开启训练。',
      );
    },
  };
  return driver;
}
