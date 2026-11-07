import type { AgentContract, AgentMission, AgentSession } from '@contracts/agent-types';
import type { MaaToolAuthorization, MaaToolHost } from '@maaverge/agent/tools';
import { AgentWait } from '@maaverge/agent/response-graph';
import { emptyUsage } from '@maaverge/agent/responses';
import { taskConsumableLimits } from '@contracts/task-policy';
import type { Store } from '@backend/infrastructure/storage/storage';
import { RpcError } from '@backend/shared/errors';
import { AgentLedger, digest, timestamp, type ActionRecord } from './ledger';
import type { ContextRepository } from './context';

type Rule = { name: string; input: Record<string, any>; actionHash: string };
type Rules = {
  id: string;
  version: string;
  rules: Rule[];
  approvalId: string;
  activeRunId?: string;
  nextTarget: number;
};
/** 审批绑定实际操作而非投递 ID；停止只锁定目标身份，不把持续变化的进度纳入快照。 */
export function actionSnapshot(request: MaaToolAuthorization) {
  const { requestId: _, ...action } = request.action;
  if (request.effect === 'stop') {
    const target = (action.run ?? action.job) as { id?: string; deviceId?: string } | undefined;
    return {
      name: request.toolName,
      deviceId: request.deviceId,
      clientType: request.clientType,
      action: { id: target?.id, deviceId: target?.deviceId },
    };
  }
  return {
    name: request.toolName,
    deviceId: request.deviceId,
    clientType: request.clientType,
    action,
  };
}

/** 计划模式禁止设备副作用；目标模式也必须经过单次审批或有限托管的快照与额度校验。 */
export class AgentExecutionPolicy {
  constructor(
    private store: Store,
    private context: ContextRepository,
    private ledger: AgentLedger,
    private host: MaaToolHost,
    private version: (session: AgentSession) => string,
  ) {}

  async authorize(
    sessionId: string,
    turnId: string,
    record: ActionRecord,
    request: MaaToolAuthorization,
  ): Promise<boolean> {
    const session = this.context.get(sessionId);
    if (session.mode !== 'goal')
      throw new RpcError(
        -32010,
        '计划模式只允许读取、提问和生成草稿，请切换目标模式后审阅执行范围',
      );
    if (
      session.scope.deviceId !== request.deviceId ||
      session.scope.clientType !== request.clientType
    )
      throw new RpcError(-32010, '操作设备或客户端超出会话范围');
    if (!['execute', 'stop'].includes(request.effect))
      throw new RpcError(-32010, '本版 Agent 未开放视觉控制');
    const snapshot = actionSnapshot(request),
      version = this.version(session);
    const authorizationHash = digest([snapshot, version]);
    const turn = this.ledger.turn(turnId);
    if (turn.missionId) {
      this.reserve(turn.missionId, record, request, authorizationHash);
      return true;
    }
    const interactionId = 'approval-' + record.id;
    const limits = this.consumables(request);
    const interaction = this.ledger.question({
      id: interactionId,
      sessionId,
      turnId,
      kind: 'approval',
      title: request.effect === 'stop' ? '停止执行审批' : '执行范围审批',
      prompt: `请核对完整操作快照。药剂上限 ${limits.medicine}，源石上限 ${limits.stone}；提交后缺少可信实际消耗时按上限占用。回答普通问题不会批准此操作。`,
      snapshot: { ...snapshot, version, medicine: limits.medicine, stone: limits.stone } as any,
    });
    if (interaction.status === 'pending') {
      this.ledger.putAction({
        ...record,
        interactionId,
        authorizationHash,
        requestId: request.requestId,
      });
      throw new AgentWait(interactionId);
    }
    if (interaction.status !== 'answered' || interaction.answer?.decision !== 'approve')
      return false;
    // 恢复后重新绑定操作快照与扩展版本；用户批准旧快照不代表批准后来修改的计划。
    const live = this.store.get<ActionRecord>('agent_action', record.id);
    if (live.authorizationHash !== authorizationHash)
      throw new RpcError(-32011, '已批准的快照或 Skill 内容已变化，请重新审批');
    this.ledger.putAction({
      ...live,
      requestId: request.requestId,
      authorizationHash,
      status: 'submitted',
      ...limits,
    });
    return true;
  }

  private consumables(request: MaaToolAuthorization) {
    const plan = request.action.plan as any;
    const limits = plan ? taskConsumableLimits(plan) : { medicine: 0, originium: 0 };
    return { medicine: limits.medicine, stone: limits.originium };
  }
  list(sessionId?: string): AgentMission[] {
    return this.store
      .all<AgentMission>('agent_mission')
      .filter((mission) => {
        if (sessionId && mission.sessionId !== sessionId) return false;
        try {
          this.context.get(mission.sessionId);
          return true;
        } catch {
          return false;
        }
      })
      .slice(-100);
  }
  get(id: string): AgentMission {
    const mission = this.store.get<AgentMission | undefined>('agent_mission', id);
    if (!mission) throw new RpcError(-32004, '托管目标不存在');
    this.context.get(mission.sessionId);
    return mission;
  }
  async create(params: AgentContract['params']['agent.mission.create']): Promise<AgentMission> {
    const session = this.context.get(params.sessionId);
    if (session.mode !== 'goal' || !session.scope.deviceId)
      throw new RpcError(-32010, '请先选择设备并切换目标模式');
    const expiry = Date.parse(params.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 30 * 86400000)
      throw new RpcError(-32602, '托管期限须在未来 30 天内');
    if (
      params.wakeAt &&
      (!Number.isFinite(Date.parse(params.wakeAt)) || Date.parse(params.wakeAt) >= expiry)
    )
      throw new RpcError(-32602, '唤醒时间必须早于托管期限');
    const rules: Rule[] = [],
      snapshots: unknown[] = [];
    for (const target of params.targets) {
      let request: Omit<MaaToolAuthorization, 'requestId'>;
      let input: Record<string, any>;
      if (target.kind === 'plan' && typeof target.planId === 'string') {
        const plan = (await this.host.listPlans()).find((plan) => plan.id === target.planId);
        if (!plan) throw new RpcError(-32004, '托管任务表不存在');
        this.host.preparePlan(plan);
        input = { planId: plan.id };
        request = {
          toolName: 'maa_start_plan',
          effect: 'execute',
          deviceId: session.scope.deviceId,
          clientType: session.scope.clientType,
          action: { plan },
        };
      } else if (target.kind === 'tool' && typeof target.toolKind === 'string') {
        input = { kind: target.toolKind, config: target.config ?? {} };
        request = {
          toolName: 'maa_start_tool',
          effect: 'execute',
          deviceId: session.scope.deviceId,
          clientType: session.scope.clientType,
          action: {
            ...input,
            deviceId: session.scope.deviceId,
            clientType: session.scope.clientType,
          },
        };
      } else if (target.kind === 'copilot' && typeof target.copilotKind === 'string') {
        const workspace = await this.host.getCopilotWorkspace(target.copilotKind as any);
        input = { kind: workspace.kind };
        request = {
          toolName: 'maa_start_copilot',
          effect: 'execute',
          deviceId: session.scope.deviceId,
          clientType: session.scope.clientType,
          action: { workspace },
        };
      } else throw new RpcError(-32602, '托管目标仅支持已保存任务表、独立工具或已有作业');
      const snapshot = actionSnapshot({ ...request, requestId: '' });
      rules.push({
        name: request.toolName,
        input,
        actionHash: digest([snapshot, this.version(session)]),
      });
      snapshots.push(snapshot);
    }
    if (!rules.length) throw new RpcError(-32602, '请选择有限托管目标');
    const id = crypto.randomUUID(),
      turnId = 'mission-' + id,
      approvalId = 'mission-approval-' + id;
    const mission: AgentMission = {
      id,
      sessionId: session.id,
      deviceId: session.scope.deviceId,
      clientType: session.scope.clientType,
      expiresAt: params.expiresAt,
      maxExecutions: params.maxExecutions,
      medicine: params.medicine,
      stone: params.stone,
      status: 'waiting',
      remainingExecutions: params.maxExecutions,
      reservedMedicine: 0,
      reservedStone: 0,
      targets: params.targets,
      snapshotHashes: rules.map((rule) => rule.actionHash),
      usage: emptyUsage(),
      createdAt: timestamp(),
      updatedAt: timestamp(),
      ...(params.wakeAt ? { wakeAt: params.wakeAt } : {}),
      ...(params.wakeOnRunId ? { wakeOnRunId: params.wakeOnRunId } : {}),
    };
    if (
      params.wakeOnRunId &&
      !this.ledger.actions(session.id).some((action) => {
        const result = (action.result as any)?.content ?? (action.result as any);
        return (
          action.status === 'completed' &&
          [
            'maa_start_plan',
            'maa_start_copilot',
            'maa_get_run',
            'maa_stop_run',
            'maa_start_tool',
            'maa_get_tool',
            'maa_stop_tool',
          ].includes(action.name) &&
          result?.id === params.wakeOnRunId &&
          result.deviceId === session.scope.deviceId
        );
      })
    )
      throw new RpcError(-32602, '唤醒执行记录未附加到当前会话');
    this.store.transaction(() => {
      this.ledger.putTurn({
        id: turnId,
        sessionId: session.id,
        missionId: id,
        status: 'waiting',
        createdAt: timestamp(),
        updatedAt: timestamp(),
        usage: emptyUsage(),
        pendingInteractionId: approvalId,
      });
      this.store.put('agent_mission', id, mission);
      this.store.put('agent_mission_rules', id, {
        id,
        rules,
        version: this.version(session),
        approvalId,
        nextTarget: 0,
      } satisfies Rules);
      this.ledger.question({
        id: approvalId,
        sessionId: session.id,
        turnId,
        kind: 'approval',
        title: '有限托管审批',
        prompt: `授权至 ${params.expiresAt}，最多 ${params.maxExecutions} 次，理智药 ${params.medicine}，源石 ${params.stone}。重启后暂停，需要手动恢复。撤销托管仅停止后续动作。`,
        snapshot: {
          missionId: id,
          snapshots,
          maxExecutions: params.maxExecutions,
          medicine: params.medicine,
          stone: params.stone,
          version: this.version(session),
        } as any,
      });
    });
    return mission;
  }
  approval(interactionId: string) {
    const rules = this.store
      .all<Rules>('agent_mission_rules')
      .find((rule) => rule.approvalId === interactionId);
    if (!rules) return;
    const interaction = this.ledger.interaction(interactionId);
    const mission = this.get(rules.id);
    if (mission.status !== 'waiting') return mission;
    const approved = interaction.answer?.decision === 'approve';
    const result: AgentMission = {
      ...mission,
      status: approved ? 'active' : 'revoked',
      updatedAt: timestamp(),
    };
    this.store.put('agent_mission', mission.id, result);
    const turn = this.ledger.turn(interaction.turnId);
    this.ledger.putTurn({
      ...turn,
      status: approved ? 'completed' : 'cancelled',
      pendingInteractionId: undefined,
    });
    return result;
  }
  resume(id: string) {
    const mission = this.get(id),
      rules = this.store.get<Rules>('agent_mission_rules', id);
    if (
      ['revoked', 'completed'].includes(mission.status) ||
      ((mission.remainingExecutions < 1 || Date.parse(mission.expiresAt) <= Date.now()) &&
        !rules.activeRunId &&
        !mission.wakeOnRunId)
    )
      throw new RpcError(-32011, '托管授权已结束');
    if (
      this.ledger.interaction(rules.approvalId).answer?.decision !== 'approve' ||
      this.version(this.context.get(mission.sessionId)) !== rules.version
    )
      throw new RpcError(-32011, '托管内容或 Skill 版本已变化，需要重新审批');
    const result: AgentMission = { ...mission, status: 'active', updatedAt: timestamp() };
    this.store.put('agent_mission', id, result);
    return result;
  }
  /** 撤销只禁止托管的后续动作；已提交的原生执行需通过独立停止操作处理。 */
  revoke(id: string) {
    const mission = this.get(id);
    const result: AgentMission = { ...mission, status: 'revoked', updatedAt: timestamp() };
    this.store.put('agent_mission', id, result);
    return result;
  }
  /** 提交标记、执行次数和药石上限一起预留；重复调用不再扣减，未知实际消耗不释放预留。 */
  private reserve(id: string, record: ActionRecord, request: MaaToolAuthorization, hash: string) {
    this.store.transaction(() => {
      const current = this.store.get<ActionRecord>('agent_action', record.id);
      if (current.status === 'submitted' || current.status === 'completed') return;
      const mission = this.get(id),
        rules = this.store.get<Rules>('agent_mission_rules', id);
      if (
        mission.status !== 'active' ||
        Date.parse(mission.expiresAt) <= Date.now() ||
        mission.remainingExecutions < 1 ||
        this.version(this.context.get(mission.sessionId)) !== rules.version ||
        !mission.snapshotHashes.includes(hash)
      )
        throw new RpcError(-32011, '托管已暂停、到期、达到次数或快照变化；请重新审批');
      const limits = this.consumables(request);
      if (
        mission.reservedMedicine + limits.medicine > mission.medicine ||
        mission.reservedStone + limits.stone > mission.stone
      )
        throw new RpcError(-32010, '托管药石额度不足；禁止超额执行');
      this.store.put('agent_mission', id, {
        ...mission,
        remainingExecutions: mission.remainingExecutions - 1,
        reservedMedicine: mission.reservedMedicine + limits.medicine,
        reservedStone: mission.reservedStone + limits.stone,
        updatedAt: timestamp(),
      });
      this.ledger.putAction({
        ...current,
        missionId: id,
        requestId: request.requestId,
        authorizationHash: hash,
        status: 'submitted',
        ...limits,
      });
    });
  }
  rules(id: string) {
    this.get(id);
    return this.store.get<Rules>('agent_mission_rules', id);
  }
  setRun(id: string, runId?: string) {
    const rules = this.rules(id);
    this.store.put('agent_mission_rules', id, {
      ...rules,
      activeRunId: runId,
      nextTarget: rules.nextTarget + (runId ? 1 : 0),
    });
  }
  setStatus(id: string, status: AgentMission['status']) {
    const mission = this.get(id);
    if (['revoked', 'completed'].includes(mission.status)) return;
    this.store.put('agent_mission', id, { ...mission, status, updatedAt: timestamp() });
  }
}
