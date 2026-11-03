/** L3 房间组件：导航读取、准备待选、提交和复读分开，完整业务顺序由 JSON 流程编排。 */
import { AtomicFailure } from '#automation/core/errors';
import type { AtomicCapabilityResult, AtomicExecutionContext } from '#automation/core/types';
import type {
  AtomicRoomTarget,
  InfrastDriver,
  InfrastRoute,
  PreparedRosterEvidence,
  PrepareRosterInput,
  RosterEvidence,
} from './types';
import { InfrastRoster } from './roster';
import {
  capacityCeilings,
  parsePreparedRoster,
  sameNames,
  validateRoomIdentity,
} from './validation';

/** 已提交与未提交失败采用不同结果语义；所有分支保留本阶段已经取得的证据。 */
export function infrastFailure(
  error: unknown,
  data: Record<string, unknown>,
  context: AtomicExecutionContext,
  committed = false,
): AtomicCapabilityResult {
  return {
    status: context.signal?.aborted
      ? 'cancelled'
      : committed
        ? 'unknown'
        : error instanceof AtomicFailure
          ? error.status
          : 'unknown',
    data,
    verified: false,
    message: error instanceof Error ? error.message : String(error),
  };
}

/** 每次能力调用绑定自己的上下文；组件不持有跨设备缓存或隐式确认队列。 */
export class InfrastRoomPrimitives {
  readonly roster: InfrastRoster;

  constructor(
    readonly driver: InfrastDriver,
    readonly context: AtomicExecutionContext = {},
  ) {
    this.roster = new InfrastRoster(driver, context);
  }

  /** 读取会导航到明确目标，但不提交换班；训练双角色必须分别读取页面与名单。 */
  async readRoom(
    target: AtomicRoomTarget,
    route: InfrastRoute = 'room',
  ): Promise<AtomicCapabilityResult> {
    try {
      validateRoomIdentity(target);
      this.driver.preflight?.(target);
      await this.driver.openRoom(target, route);
      if (target.facility === 'Training') {
        const training = await this.driver.training();
        await this.driver.openRoster(target, 'assistant');
        const assistant = await this.roster.roster(1);
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
      const observed = await this.roster.roster(capacityCeilings[target.facility]);
      if (observed.room && observed.operators.length !== observed.room.occupied)
        throw new AtomicFailure('完整已选名单与同次入房面板的实际进驻人数不一致');
      return {
        status: 'completed',
        data: { target, ...observed },
        verified: true,
      };
    } catch (error) {
      return infrastFailure(error, { target }, this.context);
    }
  }

  /** 独立进入目标名单并准备明确选择；返回成功只证明待选状态，不代表角色已经进驻。 */
  async prepareRoster(input: PrepareRosterInput): Promise<AtomicCapabilityResult> {
    const { target, route, role } = input;
    const evidence: Record<string, unknown> = { target, route, role, phase: 'select' };
    try {
      validateRoomIdentity(target);
      this.driver.preflight?.(target);
      this.driver.preflightOperators?.(role === 'trainee' ? [input.name!] : input.operators!);
      await this.driver.openRoom(target, route);
      if (role === 'trainee') {
        // 独立使用本组件也必须遵守训练锁定，不能依赖上层碰巧做过检查。
        const before = await this.driver.training();
        evidence.before = before;
        if (before.locked && input.name !== before.trainee)
          throw new AtomicFailure('训练正在进行，受训者锁定；未更换任何角色');
        await this.driver.openRoster(target, 'trainee');
        await this.driver.chooseTrainee(input.name!);
        evidence.selected = { trainee: input.name! };
      } else {
        await this.driver.openRoster(target, role === 'assistant' ? 'assistant' : undefined);
        const maxCapacity = role === 'assistant' ? 1 : capacityCeilings[target.facility];
        evidence.before = await this.roster.roster(maxCapacity);
        const before = evidence.before as RosterEvidence;
        if (before.room && before.operators.length !== before.room.occupied)
          throw new AtomicFailure('准备前完整名单与同次入房面板的实际进驻人数不一致');
        const selectionAttempt = {};
        evidence.selectionAttempt = selectionAttempt;
        evidence.selected = await this.roster.selectExact(
          input.operators!,
          maxCapacity,
          selectionAttempt,
        );
      }
      // 成功证据只导出契约字段；phase 属于失败诊断，不作为确认组件的执行参数。
      const { phase: _phase, ...prepared } = evidence;
      return { status: 'completed', data: prepared, verified: true };
    } catch (error) {
      return infrastFailure(error, evidence, this.context);
    }
  }

  /** 提交当前待选角色一次；普通／协助者再次重读完整名单，确认开始后异常保持未知。 */
  async confirm(prepared: PreparedRosterEvidence): Promise<AtomicCapabilityResult> {
    const evidence: Record<string, unknown> = { ...prepared, phase: 'confirm' };
    let committed = false;
    try {
      parsePreparedRoster(prepared);
      if (prepared.role !== 'trainee') {
        const selected = prepared.selected as RosterEvidence;
        const current = await this.roster.roster(
          prepared.role === 'assistant' ? 1 : capacityCeilings[prepared.target.facility],
          selected.operators.length === selected.capacity,
        );
        if (
          current.capacity !== selected.capacity ||
          !sameNames(current.operators, selected.operators)
        )
          throw new AtomicFailure('确认前的选中名单与已准备证据不一致');
      } else {
        const selected = prepared.selected as { trainee: string };
        const current = await this.driver.training();
        if (current.trainee !== selected.trainee)
          throw new AtomicFailure('确认前无法核对当前已选受训者姓名，未提交', 'unavailable');
      }
      if (!this.driver.verifyConfirmTarget)
        throw new AtomicFailure('当前驱动缺少确认前的实际目标新帧核验，未提交名单', 'unavailable');
      await this.driver.verifyConfirmTarget(prepared.target);
      // 受训者名单是独立 OCR 页面，准备组件已在当前新帧精确选择；这里不重新导航丢失选择。
      committed = true;
      await this.driver.confirm(
        prepared.role === 'normal' ? undefined : prepared.role,
        prepared.target,
        prepared.role === 'trainee'
          ? (prepared.selected as { trainee: string }).trainee
          : undefined,
      );
      return { status: 'completed', data: evidence, verified: false, nativeSuccess: true };
    } catch (error) {
      return infrastFailure(error, evidence, this.context, committed);
    }
  }

  /** 重新进入房间核对某个角色；本方法只证明观察吻合，不能伪造之前提交的原生接受状态。 */
  async verifyRoom(
    request: PrepareRosterInput,
    prepared: PreparedRosterEvidence,
    before: unknown = prepared.before,
  ): Promise<AtomicCapabilityResult> {
    const { target, route, role } = request;
    const evidence: Record<string, unknown> = {
      target,
      route,
      phase: 'reread',
      before,
      selected: prepared.selected,
      ...(prepared.selectionAttempt ? { selectionAttempt: prepared.selectionAttempt } : {}),
    };
    try {
      validateRoomIdentity(target);
      if (
        prepared.target.facility !== target.facility ||
        prepared.target.room !== target.room ||
        prepared.target.position !== target.position ||
        prepared.role !== role ||
        prepared.route !== route
      )
        throw new AtomicFailure('复读目标与已准备名单不一致');
      await this.driver.openRoom(target, route);
      if (role === 'trainee') {
        const after = await this.driver.training();
        evidence.after = after;
        if (after.trainee !== request.name)
          throw new AtomicFailure('受训者确认后姓名未能重读为请求值', 'unknown');
      } else {
        await this.driver.openRoster(target, role === 'assistant' ? 'assistant' : undefined);
        const after = await this.roster.roster(
          role === 'assistant' ? 1 : capacityCeilings[target.facility],
        );
        evidence.after = after;
        if (after.room && after.operators.length !== after.room.occupied)
          throw new AtomicFailure('复读完整名单与同次房间面板实际进驻人数不一致', 'unknown');
        if (!sameNames(after.operators, request.operators!))
          throw new AtomicFailure('确认后重新打开房间，实际进驻名单与请求不一致', 'unknown');
      }
      evidence.phase = 'verified';
      return { status: 'completed', data: evidence, verified: true };
    } catch (error) {
      // 该组件用于提交后复读；任何失败都不能把已经可能提交的修改降格为确定未生效。
      return infrastFailure(error, evidence, this.context, true);
    }
  }
}
