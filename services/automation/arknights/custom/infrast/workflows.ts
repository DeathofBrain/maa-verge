/** 基建业务流程：JSON 明确读／准备／提交／复读顺序，TypeScript 保留跨角色和批次保护。 */
import type { AtomicCapabilityResult, AtomicExecutionContext } from '#automation/core/types';
import { AtomicFailure, checkCancelled } from '#automation/core/errors';
import { infrastPipeline } from './definitions';
import { InfrastRoomPrimitives, infrastFailure } from './room';
import type {
  AtomicRoomShiftInput,
  AtomicFacility,
  AtomicRoomTarget,
  InfrastDriver,
  InfrastRoute,
  InfrastWorkflowRunner,
  PrepareRosterInput,
  OverviewObservation,
  RosterEvidence,
  TrainingObservation,
  TrimObservation,
} from './types';
import { parseTarget, sameNames, validateAssignments, validateRoomIdentity } from './validation';
import { parseCustomInfrastPlan } from './plan';

/** 流程只组合游戏组件；执行器由注册表或显式测试夹具注入，没有 TypeScript 图解释器。 */
export class InfrastWorkflows {
  readonly room: InfrastRoomPrimitives;
  constructor(
    readonly driver: InfrastDriver,
    readonly context: AtomicExecutionContext = {},
  ) {
    this.room = new InfrastRoomPrimitives(driver, context);
  }

  private progress(message: string, data?: unknown) {
    checkCancelled(this.context);
    this.context.onProgress?.({ capabilityId: 'workflow.infrast', message, data });
  }
  private failure(error: unknown, data: Record<string, unknown>, committed = false) {
    return infrastFailure(error, data, this.context, committed);
  }

  /** 业务层只调用已登记的 L3；显式注入的离线驱动仍复用相同领域算法。 */
  private async component<T>(
    id: string,
    input: Record<string, unknown>,
    direct: () => Promise<T>,
  ): Promise<T> {
    if (!this.context.invoke) return direct();
    const result = await this.context.invoke(id, input);
    if (result.status !== 'completed')
      throw new AtomicFailure(
        result.message ?? '游戏组件未完成',
        result.status === 'unavailable'
          ? 'unavailable'
          : result.status === 'failed'
            ? 'failed'
            : 'unknown',
      );
    return result.data as T;
  }

  private openRoom(target: AtomicRoomTarget, route: InfrastRoute) {
    return this.component('game.infrast.open_room', { ...parseTarget(target), route }, () =>
      this.driver.openRoom(target, route),
    );
  }
  private openRoster(target: AtomicRoomTarget, role?: 'trainee' | 'assistant') {
    return this.component(
      'game.infrast.open_roster',
      { target: parseTarget(target), ...(role ? { role } : {}) },
      () => this.driver.openRoster(target, role),
    );
  }
  private training() {
    return this.component('observation.training', {}, () => this.driver.training());
  }

  /** JSON 仍交给原生 Tasker；缺少运行上下文时明确不可用，绝不改走另一套执行路径。 */
  private async runWorkflow(
    entry: 'Infrast@ApplyRoom' | 'Infrast@ApplyRole' | 'Infrast@ApplyAutoRoom',
    input: Record<string, unknown>,
  ): Promise<AtomicCapabilityResult> {
    const run =
      (this.context as AtomicExecutionContext & { runWorkflow?: InfrastWorkflowRunner })
        .runWorkflow ?? this.driver.runWorkflow;
    if (!run) throw new AtomicFailure('基建流程缺少已登记的 JSON 执行上下文', 'unavailable');
    return run(entry, infrastPipeline.subgraph(entry), input);
  }

  /** 自动单房仍由 JSON 明确串联读取、候选准备、一次确认与结果复读。 */
  async autoRoom(input: {
    target: AtomicRoomTarget;
    route: InfrastRoute;
    threshold: number;
    excludedNames?: string[];
    requiredNames?: string[];
  }): Promise<AtomicCapabilityResult> {
    try {
      validateRoomIdentity(input.target);
      const result = await this.runWorkflow('Infrast@ApplyAutoRoom', {
        target: { ...input.target, route: input.route },
        request: input,
      });
      return result.status === 'completed' && result.verified
        ? { ...result, nativeSuccess: true }
        : result;
    } catch (error) {
      return this.failure(error, { target: input.target });
    }
  }

  /** 队列轮换只触发一次；仅在提供期望名单并逐房复读吻合后确认业务成功。 */
  async queueRotate(expectedRooms: AtomicRoomShiftInput[] = []): Promise<AtomicCapabilityResult> {
    let before: OverviewObservation | undefined,
      after: OverviewObservation | undefined,
      accepted = false,
      attempted = false;
    const checkedRooms: { target: AtomicRoomShiftInput; result: AtomicCapabilityResult }[] = [];
    try {
      // 所有期望先验证，避免轮换已点击后才发现房间身份或分配本身无效。
      validateAssignments(expectedRooms);
      for (const target of expectedRooms) this.driver.preflight?.(target);
      before = await this.component('game.infrast.enter_overview', {}, () =>
        this.driver.enterOverview(),
      );
      this.progress('已确认游戏总览，执行一次队列轮换');
      attempted = true;
      await this.component('game.infrast.rotate_queue', {}, () => this.driver.rotateQueue());
      accepted = true;
      after = await this.component('observation.overview', {}, () => this.driver.overview());
      // 动作接受之后逐房核对明确期望；没有期望时只能保存总览证据并返回未知。
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
      // 上游轮换随后会执行整顿，这里保持两个动作独立；新截图和输入接受也不能证明全部换班生效。
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
  /** 整顿与队列轮换独立；点击确认和新画面不足以证明逐房名单，结果保留未知。 */
  async trim(): Promise<AtomicCapabilityResult> {
    let before: TrimObservation | undefined,
      after: TrimObservation | undefined,
      attempted = false,
      accepted = false;
    try {
      before = await this.component('game.infrast.enter_trim', {}, () => this.driver.enterTrim());
      this.progress('已确认游戏整顿页，执行一次整顿');
      // 区分已尝试与已获确认，失败结果仍携带动作次数和已有观察，不自动重试。
      attempted = true;
      await this.component('game.infrast.trim', {}, () => this.driver.trim());
      accepted = true;
      after = await this.component('observation.trim', {}, () => this.driver.trimObservation());
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

  /** 保留直接名单观察 API；算法由 L3 名单组件统一维护，不能把单页卡片当作完整名单。 */
  roster(maxCapacity = 5): Promise<RosterEvidence> {
    return this.component('game.infrast.read_roster', { maxCapacity }, () =>
      this.room.roster.roster(maxCapacity),
    );
  }

  /** 业务层经注册表调用 L3 JSON 入口；独立组件调用仍可直接使用同一页面算法。 */
  async readRoom(
    target: AtomicRoomTarget,
    route: InfrastRoute = 'room',
  ): Promise<AtomicCapabilityResult> {
    const invoke = (
      this.context as AtomicExecutionContext & {
        invoke?: (id: string, input: Record<string, unknown>) => Promise<AtomicCapabilityResult>;
      }
    ).invoke;
    return invoke
      ? invoke('game.infrast.read_room', { ...target, route })
      : this.room.readRoom(target, route);
  }

  /** 普通房间的业务主干是实际 JSON 链；训练双角色另由下方受保护流程编排。 */
  async setRoom(input: AtomicRoomShiftInput, route: InfrastRoute): Promise<AtomicCapabilityResult> {
    const evidence: Record<string, unknown> = { target: input, route, phase: 'open' };
    try {
      validateRoomIdentity(input);
      this.driver.preflight?.(input);
      this.driver.preflightOperators?.(
        input.facility === 'Training'
          ? [input.trainee, input.assistant].filter((name): name is string => name !== undefined)
          : input.operators!,
      );
      if (input.facility === 'Training') {
        await this.openRoom(input, route);
        return await this.setTraining(input, route, evidence);
      }
      const target = parseTarget(input);
      const request: PrepareRosterInput = {
        target,
        route,
        role: 'normal',
        operators: input.operators!,
      };
      const result = await this.runWorkflow('Infrast@ApplyRoom', {
        target: { ...target, route },
        request,
      });
      // 验证组件只报告观察；只有走完整条包含 confirm 的 JSON 链才能报告原生提交接受。
      return result.status === 'completed' && result.verified
        ? { ...result, nativeSuccess: true }
        : result;
    } catch (error) {
      return this.failure(error, evidence);
    }
  }

  /** 训练保护属于业务层：省略角色不变、锁定不可换人，并对每个显式角色运行独立 JSON 链。 */
  private async setTraining(
    input: AtomicRoomShiftInput,
    route: InfrastRoute,
    evidence: Record<string, unknown>,
  ): Promise<AtomicCapabilityResult> {
    let committed = false;
    try {
      // 必须在任何选择前取得两个原角色的证据；无法读出省略角色时不能承诺保持。
      const before = await this.training();
      evidence.before = before;
      if (input.trainee !== undefined && before.locked && input.trainee !== before.trainee)
        throw new AtomicFailure('训练正在进行，受训者锁定；未更换任何角色');
      if (input.trainee === undefined && before.trainee === undefined)
        throw new AtomicFailure(
          '无法读出应保持不变的受训者，不能声称双角色均已核验',
          'unavailable',
        );
      await this.openRoster(input, 'assistant');
      const assistantBefore = await this.roster(1);
      evidence.assistantBefore = assistantBefore;
      await this.openRoom(input, route);
      const target = parseTarget(input);

      // 每角色都经过 prepare→confirm→verify；TypeScript 只决定是否允许改变该角色。
      if (input.trainee !== undefined && input.trainee !== before.trainee) {
        evidence.phase = 'trainee';
        const request: PrepareRosterInput = { target, route, role: 'trainee', name: input.trainee };
        const result = await this.runWorkflow('Infrast@ApplyRole', { request, before });
        evidence.traineeResult = result;
        const detail = result.data as Record<string, unknown>;
        if (detail.after) evidence.traineeAfter = detail.after;
        if (result.status !== 'completed' || !result.verified)
          return {
            ...result,
            status: committed && result.status !== 'cancelled' ? 'unknown' : result.status,
            data: { ...evidence, roleResult: result.data },
            verified: false,
          };
        committed = true;
      }
      if (input.assistant !== undefined) {
        evidence.phase = 'assistant';
        const request: PrepareRosterInput = {
          target,
          route,
          role: 'assistant',
          operators: [input.assistant],
        };
        const result = await this.runWorkflow('Infrast@ApplyRole', {
          request,
          before: assistantBefore,
        });
        evidence.assistantResult = result;
        const detail = result.data as Record<string, unknown>;
        if (detail.selectionAttempt) evidence.selectionAttempt = detail.selectionAttempt;
        if (detail.selected) evidence.assistantSelected = detail.selected;
        if (detail.after) evidence.assistantAfter = detail.after;
        if (result.status !== 'completed' || !result.verified)
          return {
            ...result,
            status: committed && result.status !== 'cancelled' ? 'unknown' : result.status,
            data: { ...evidence, roleResult: result.data },
            verified: false,
          };
        committed = true;
      } else {
        // 受训者修改也可能连带改变协助者；省略不是跳过检查，而是与首轮原值比较。
        await this.openRoster(input, 'assistant');
        const assistantAfter = await this.roster(1);
        evidence.assistantAfter = assistantAfter;
        if (!sameNames(assistantBefore.operators, assistantAfter.operators))
          throw new AtomicFailure('省略的协助者在受训者换班后发生变化', 'unknown');
      }
      await this.openRoom(input, route);
      const after = await this.training();
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

  /** 逐房执行，遇到非完成结果即返回部分证据；全部执行后再复核整批最终状态。 */
  async batch(rooms: AtomicRoomShiftInput[], route: InfrastRoute): Promise<AtomicCapabilityResult> {
    const results: { target: AtomicRoomTarget; result: AtomicCapabilityResult }[] = [];
    try {
      // 批次全部预检在首个动作之前完成；请求内冲突不能依靠执行顺序解决。
      validateAssignments(rooms);
      for (const target of rooms) {
        this.driver.preflight?.(target);
        this.driver.preflightOperators?.(
          target.facility === 'Training'
            ? [target.trainee, target.assistant].filter(
                (name): name is string => name !== undefined,
              )
            : target.operators!,
        );
      }
    } catch (error) {
      return this.failure(error, { rooms: [] });
    }
    // 顺序提交，遇到未完成或取消立即停止；保留已处理和剩余目标，不重新执行前房间。
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
    // 后房间可能拉走前房间中被省略保留的训练角色；整批完成后再次重读所有目标才可确认成功。
    for (let index = 0; index < rooms.length; index++) {
      const target = rooms[index]!,
        checked = await this.readRoom(target, route);
      finalChecks.push({ target, result: checked });
      const actual = checked.data as Record<string, unknown>;
      const evidence = results[index]!.result.data as {
        before?: TrainingObservation;
        assistantBefore?: RosterEvidence;
      };
      // 显式角色使用请求值，省略角色使用首轮观察值，验证的是整批最终状态。
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

  /** 自定义计划先解析官方原文，再用独立 L3 解析现场房间身份；名单提交复用逐房 JSON 主干。 */
  async customShift(
    document: unknown,
    planIndex = 0,
    sourceSha256?: string,
    facilities?: AtomicFacility[],
    threshold = 0.3,
  ): Promise<AtomicCapabilityResult> {
    try {
      const plan = parseCustomInfrastPlan(document, planIndex, facilities);
      this.driver.preflightOperators?.(plan.rooms.flatMap((room) => room.operators!));
      if (!plan.rooms.length)
        return {
          status: 'completed',
          data: {
            planIndex,
            keptUnchanged: true,
            reason: 'room_no_intent',
            ...(sourceSha256 ? { sourceSha256 } : {}),
          },
          verified: true,
        };
      const rooms = await this.component(
        'game.infrast.resolve_rooms',
        { rooms: plan.rooms },
        async () => {
          if (!this.driver.resolveRooms)
            throw new AtomicFailure('基建驱动缺少官方房间身份解析事件', 'unavailable');
          return { rooms: await this.driver.resolveRooms(plan.rooms) };
        },
      );
      const result = plan.autoFillRooms?.length
        ? await this.customAutoBatch(rooms.rooms, new Set(plan.autoFillRooms), threshold)
        : await this.batch(rooms.rooms, 'overview');
      return {
        ...result,
        data: {
          ...(result.data as Record<string, unknown>),
          planIndex,
          ...(plan.name ? { name: plan.name } : {}),
          ...(sourceSha256 ? { sourceSha256 } : {}),
        },
      };
    } catch (error) {
      return this.failure(error, { planIndex, ...(sourceSha256 ? { sourceSha256 } : {}) });
    }
  }

  /** 官方补位只填满所选房间；预留其他房间固定姓名，避免自动候选破坏后续明确名单。 */
  private async customAutoBatch(
    rooms: AtomicRoomShiftInput[],
    automatic: Set<string>,
    threshold: number,
  ): Promise<AtomicCapabilityResult> {
    validateAssignments(rooms);
    const results: {
      target: AtomicRoomTarget;
      operators: string[];
      result: AtomicCapabilityResult;
    }[] = [];
    const assigned = new Set<string>();
    for (const room of rooms) {
      const otherFixed = rooms.filter((item) => item !== room).flatMap((item) => item.operators!);
      const result = automatic.has(`${room.facility}:${room.room}`)
        ? await this.autoRoom({
            target: parseTarget(room),
            route: 'overview',
            threshold,
            requiredNames: room.operators,
            excludedNames: [...new Set([...assigned, ...otherFixed])],
          })
        : await this.setRoom(room, 'overview');
      const after = (result.data as { after?: RosterEvidence }).after;
      results.push({ target: parseTarget(room), operators: after?.operators ?? [], result });
      if (result.status !== 'completed' || !result.verified || !after)
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
      for (const name of after.operators) assigned.add(name);
    }
    const finalChecks = [];
    for (const item of results) {
      const result = await this.readRoom(item.target, 'overview');
      finalChecks.push({ target: item.target, result });
      if (
        result.status !== 'completed' ||
        !result.verified ||
        !sameNames((result.data as RosterEvidence).operators ?? [], item.operators)
      )
        return {
          status: result.status === 'cancelled' ? 'cancelled' : 'partial',
          data: { rooms: results, finalChecks },
          verified: false,
          message: '自定义补位最终名单复读不一致，不重放已提交房间',
        };
    }
    return {
      status: 'completed',
      data: { rooms: results, finalChecks, remaining: [] },
      verified: true,
      nativeSuccess: true,
    };
  }

  /** 常规整轮只处理已证明可观察全集的房间；按请求设施顺序提交，最后重新枚举和逐房复读。 */
  async daily(facilities: AtomicFacility[], threshold = 0.3): Promise<AtomicCapabilityResult> {
    const results: {
      target: AtomicRoomTarget;
      operators: string[];
      result: AtomicCapabilityResult;
    }[] = [];
    let enumeration: { rooms: AtomicRoomTarget[]; evidence: unknown } | undefined;
    try {
      const enumerate = () =>
        this.component('game.infrast.enumerate_rooms', { facilities }, async () => {
          if (!this.driver.enumerateRooms)
            throw new AtomicFailure('缺少基建全集枚举事件', 'unavailable');
          return this.driver.enumerateRooms(facilities);
        });
      enumeration = await enumerate();
      const assigned = new Set<string>();
      for (const target of enumeration.rooms) {
        checkCancelled(this.context);
        const result = await this.autoRoom({
          target,
          route: 'overview',
          threshold,
          excludedNames: [...assigned],
        });
        const after = (result.data as { after?: RosterEvidence }).after;
        const operators = after?.operators ?? [];
        results.push({ target, operators, result });
        if (result.status !== 'completed' || !result.verified || !after)
          return {
            status:
              result.status === 'cancelled'
                ? 'cancelled'
                : results.length > 1
                  ? 'partial'
                  : result.status,
            data: {
              enumeration,
              rooms: results,
              remaining: enumeration.rooms.slice(results.length),
            },
            verified: false,
            message: result.message,
          };
        for (const name of operators) assigned.add(name);
      }
      const finalEnumeration = await enumerate();
      const identities = (rooms: AtomicRoomTarget[]) =>
        rooms
          .map((room) => `${room.facility}:${room.room}:${room.position ?? ''}`)
          .sort()
          .join('|');
      if (identities(enumeration.rooms) !== identities(finalEnumeration.rooms))
        throw new AtomicFailure('换班后完整基建房间集合变化，保留已完成结果且不重放', 'unknown');
      const finalChecks: { target: AtomicRoomTarget; result: AtomicCapabilityResult }[] = [];
      for (const item of results) {
        const result = await this.readRoom(item.target, 'overview');
        finalChecks.push({ target: item.target, result });
        if (
          result.status !== 'completed' ||
          !result.verified ||
          !sameNames((result.data as RosterEvidence).operators ?? [], item.operators)
        )
          return {
            status: result.status === 'cancelled' ? 'cancelled' : 'partial',
            data: { enumeration, rooms: results, finalEnumeration, finalChecks },
            verified: false,
            message: '整轮最终名单复读未通过，已完成房间不会自动重放',
          };
      }
      return {
        status: 'completed',
        data: { enumeration, rooms: results, finalEnumeration, finalChecks },
        verified: true,
        ...(results.length ? { nativeSuccess: true } : {}),
      };
    } catch (error) {
      const failure = this.failure(error, { enumeration, rooms: results }, results.length > 0);
      return results.length && failure.status !== 'cancelled'
        ? { ...failure, status: 'partial' }
        : failure;
    }
  }
}
