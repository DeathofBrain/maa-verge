import { useEffect, useState } from 'react';
import {
  errorMessage,
  rpc,
  type AgentJsonObject,
  type AgentMission,
  type AgentSession,
  type CopilotKind,
  type CopilotWorkspace,
  type Plan,
  type RpcParams,
} from '@maaverge/contracts';
import Button from '@/kit/Button';
import TextField from '@/kit/TextField';
import NumberField from '@/kit/NumberField';
import CheckField from '@/kit/CheckField';
import Notice from '@/kit/Notice';
import StatusPill from '@/kit/StatusPill';
import ErrorBanner from '@/kit/ErrorBanner';

type Props = {
  session?: AgentSession;
  plans: Plan[];
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
  refresh: () => Promise<void>;
  onOpenConversation: () => void;
};
type ToolKind = RpcParams<'tool.config.get'>['kind'];
const localDateTime = (timestamp: number) =>
  new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const labels: Record<AgentMission['status'], string> = {
  active: '已授权',
  paused: '已暂停',
  waiting: '等待确认',
  revoked: '已撤销',
  completed: '已完成',
};
const tools: { kind: ToolKind; label: string }[] = [
  { kind: 'depot', label: '仓库' },
  { kind: 'operators', label: '干员' },
  { kind: 'recruit', label: '公招计算' },
  { kind: 'inventory', label: '库存保持' },
  { kind: 'data', label: '数据管理' },
  { kind: 'games', label: '小游戏' },
];
const copilotKinds: { kind: CopilotKind; label: string }[] = [
  { kind: 'Copilot', label: '普通作业' },
  { kind: 'SSSCopilot', label: '保全派驻' },
  { kind: 'ParadoxCopilot', label: '悖论模拟' },
];

export default function AgentMissionPanel({
  session,
  plans,
  busy,
  run,
  refresh,
  onOpenConversation,
}: Props) {
  const [missions, setMissions] = useState<AgentMission[]>([]);
  const [planIds, setPlanIds] = useState<string[]>([]);
  const [toolKinds, setToolKinds] = useState<ToolKind[]>([]);
  const [selectedCopilots, setSelectedCopilots] = useState<CopilotKind[]>([]);
  const [workspaces, setWorkspaces] = useState<CopilotWorkspace[]>([]);
  const [loadError, setLoadError] = useState('');
  const [executions, setExecutions] = useState(1);
  const [medicine, setMedicine] = useState(0);
  const [stone, setStone] = useState(0);
  const [expiresAt, setExpiresAt] = useState(() => localDateTime(Date.now() + 3600000));
  const [wakeAt, setWakeAt] = useState('');
  const load = async () => setMissions(await rpc('agent.mission.list', { sessionId: session?.id }));
  useEffect(() => {
    void run(load);
    let current = true;
    void Promise.all(copilotKinds.map(({ kind }) => rpc('copilot.workspace.get', { kind })))
      .then((value) => {
        if (current) setWorkspaces(value);
      })
      .catch((cause: unknown) => {
        if (current) setLoadError(errorMessage(cause));
      });
    const timer = window.setInterval(() => {
      void load().catch((cause: unknown) => {
        if (current) setLoadError(errorMessage(cause));
      });
    }, 5000);
    return () => {
      current = false;
      window.clearInterval(timer);
    };
  }, [session?.id]);
  return (
    <section className="aw-panel aw-stack" aria-label="托管授权管理">
      <div>
        <h2>托管授权</h2>
        <p className="aw-muted">
          选择已经保存的任务表、工具配置或作业队列，并设置次数、时间和消耗额度。创建后先核对固定快照，再批准执行。
        </p>
      </div>
      <Notice tone="neutral" size="sm">
        托管只在 Maa Verge 运行期间处理。重启后的任务需要显式恢复；自动打新关卡不在此范围。
      </Notice>
      {loadError && <ErrorBanner>{loadError}</ErrorBanner>}
      <form
        className="aw-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!session) return;
          void run(async () => {
            const toolTargets = await Promise.all(
              toolKinds.map(async (toolKind): Promise<AgentJsonObject> => ({
                kind: 'tool',
                toolKind,
                config: {
                  ...(await rpc('tool.config.get', {
                    deviceId: session.scope.deviceId,
                    clientType: session.scope.clientType,
                    kind: toolKind,
                  })),
                },
              })),
            );
            await rpc('agent.mission.create', {
              sessionId: session.id,
              expiresAt: new Date(expiresAt).toISOString(),
              maxExecutions: executions,
              medicine,
              stone,
              targets: [
                ...planIds.map((planId) => ({ kind: 'plan', planId })),
                ...toolTargets,
                ...selectedCopilots.map((copilotKind) => ({ kind: 'copilot', copilotKind })),
              ],
              ...(wakeAt ? { wakeAt: new Date(wakeAt).toISOString() } : {}),
            });
            setPlanIds([]);
            setToolKinds([]);
            setSelectedCopilots([]);
            await load();
            await refresh();
            onOpenConversation();
          });
        }}
      >
        <fieldset className="aw-fieldset">
          <legend>允许执行的任务表</legend>
          {plans.length ? (
            plans.map((plan) => (
              <CheckField
                key={plan.id}
                label={plan.name}
                checked={planIds.includes(plan.id)}
                disabled={busy}
                onChange={(event) =>
                  setPlanIds((previous) =>
                    event.target.checked
                      ? [...previous, plan.id]
                      : previous.filter((id) => id !== plan.id),
                  )
                }
              />
            ))
          ) : (
            <p className="aw-muted">请先在任务表页面保存配置。</p>
          )}
        </fieldset>
        <fieldset className="aw-fieldset">
          <legend>允许执行的独立工具</legend>
          <p className="aw-muted">使用当前设备与客户端在工具箱中保存的配置，审批时再次核对。</p>
          {tools.map(({ kind, label }) => (
            <CheckField
              key={kind}
              label={label}
              checked={toolKinds.includes(kind)}
              disabled={busy || !session?.scope.deviceId}
              onChange={(event) =>
                setToolKinds((previous) =>
                  event.target.checked
                    ? [...previous, kind]
                    : previous.filter((item) => item !== kind),
                )
              }
            />
          ))}
        </fieldset>
        <fieldset className="aw-fieldset">
          <legend>允许执行的已有作业队列</legend>
          <p className="aw-muted">请先在作业中心保存队列；托管只重放已核对的队列。</p>
          {copilotKinds.map(({ kind, label }) => {
            const count =
              workspaces
                .find((workspace) => workspace.kind === kind)
                ?.queue.filter((entry) => entry.enabled).length ?? 0;
            return (
              <CheckField
                key={kind}
                label={`${label}（${count} 项）`}
                checked={selectedCopilots.includes(kind)}
                disabled={busy || !session || !count}
                onChange={(event) =>
                  setSelectedCopilots((previous) =>
                    event.target.checked
                      ? [...previous, kind]
                      : previous.filter((item) => item !== kind),
                  )
                }
              />
            );
          })}
        </fieldset>
        <div className="aw-fields">
          <label className="aw-field">
            最多执行次数
            <NumberField
              aria-label="托管最多执行次数"
              min={1}
              max={100}
              value={executions}
              disabled={busy}
              onChange={(event) => setExecutions(Number(event.target.value))}
            />
          </label>
          <label className="aw-field">
            理智药上限
            <NumberField
              aria-label="托管理智药上限"
              min={0}
              max={1000}
              value={medicine}
              disabled={busy}
              onChange={(event) => setMedicine(Number(event.target.value))}
            />
          </label>
          <label className="aw-field">
            源石上限
            <NumberField
              aria-label="托管源石上限"
              min={0}
              max={1000}
              value={stone}
              disabled={busy}
              onChange={(event) => setStone(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="aw-fields">
          <label className="aw-field">
            授权截止时间
            <TextField
              type="datetime-local"
              aria-label="托管授权截止时间"
              value={expiresAt}
              disabled={busy}
              required
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </label>
          <label className="aw-field">
            首次执行时间（可选）
            <TextField
              type="datetime-local"
              aria-label="托管首次执行时间"
              value={wakeAt}
              disabled={busy}
              onChange={(event) => setWakeAt(event.target.value)}
            />
          </label>
        </div>
        <Button
          variant="primary"
          type="submit"
          disabled={
            busy ||
            !session ||
            session.mode !== 'goal' ||
            !(planIds.length + toolKinds.length + selectedCopilots.length) ||
            !expiresAt
          }
        >
          准备托管授权
        </Button>
        {session?.mode !== 'goal' && <p className="aw-muted">请先将当前会话切换到目标模式。</p>}
      </form>
      {missions.map((mission) => (
        <article key={mission.id} className="aw-card aw-stack">
          <div className="aw-row aw-between">
            <h3>
              {mission.targets
                .map((target) =>
                  target.kind === 'plan'
                    ? (plans.find((plan) => plan.id === target.planId)?.name ?? '任务表')
                    : target.kind === 'tool'
                      ? (tools.find((tool) => tool.kind === target.toolKind)?.label ?? '工具')
                      : (copilotKinds.find((item) => item.kind === target.copilotKind)?.label ??
                        '作业队列'),
                )
                .join('、')}
            </h3>
            <StatusPill
              tone={mission.status === 'active' ? 'running' : 'neutral'}
              label={labels[mission.status]}
            />
          </div>
          <p>
            剩余 {mission.remainingExecutions} 次 · 理智药占用 {mission.reservedMedicine}/
            {mission.medicine} · 源石占用 {mission.reservedStone}/{mission.stone}
          </p>
          <p className="aw-muted">
            模型调用 {mission.usage.modelCalls} 次 · 输入 {mission.usage.inputTokens} / 输出{' '}
            {mission.usage.outputTokens} / 合计 {mission.usage.totalTokens} Token
            {mission.usage.estimatedCost !== undefined
              ? ` · 费用估算 ${mission.usage.estimatedCost.toFixed(4)}`
              : ''}
            {mission.usage.incomplete ? '（部分用量未知）' : ''}
          </p>
          <p className="aw-muted">
            截止 {new Date(mission.expiresAt).toLocaleString('zh-CN')}
            {mission.wakeAt ? ` · 下次 ${new Date(mission.wakeAt).toLocaleString('zh-CN')}` : ''}
          </p>
          <div className="aw-row">
            {mission.status === 'waiting' && (
              <Button disabled={busy} variant="primary" onClick={onOpenConversation}>
                核对托管授权
              </Button>
            )}
            <Button
              disabled={busy || mission.status !== 'paused'}
              onClick={() =>
                void run(async () => {
                  await rpc('agent.mission.resume', { missionId: mission.id });
                  await load();
                  await refresh();
                })
              }
            >
              恢复托管
            </Button>
            <Button
              variant="danger"
              disabled={busy || mission.status === 'revoked' || mission.status === 'completed'}
              onClick={() =>
                void run(async () => {
                  await rpc('agent.mission.revoke', { missionId: mission.id });
                  await load();
                  await refresh();
                })
              }
            >
              撤销授权
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
