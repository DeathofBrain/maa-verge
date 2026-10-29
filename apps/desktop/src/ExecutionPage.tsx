import Select from './Select';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Circle,
  Clock3,
  ImageIcon,
  Layers,
  ListChecks,
  LoaderCircle,
  Monitor,
  Package,
  Square,
  Terminal,
  TriangleAlert,
} from 'lucide-react';
import {
  errorMessage,
  localizeExecutionMessage,
  rpc,
  taskLabels,
  type Plan,
  type Run,
  type RunArtifact,
  type RunTask,
  type Snapshot,
} from '@maaverge/contracts';
import { isCopilotRun, runDisplayName, runSourceLabel } from './run-source';
import MaterialIcon from './MaterialIcon';
import OperatorBadge from './OperatorBadge';
import './execution-page.css';

type Props = {
  snapshot: Snapshot;
  run?: Run;
  pending: Set<string>;
  onRunUpdate: (run: Run) => void;
  onStop: (run: Run) => Promise<boolean>;
  onEdit: (plan: Plan) => void;
  onPrepare: () => void;
  onOpenLogs?: () => void;
};
const runNames: Record<Run['status'], string> = {
  running: '执行中',
  completed: '已完成',
  failed: '执行失败',
  stopped: '已停止',
};
const taskNames: Record<RunTask['status'], string> = {
  waiting: '未执行',
  running: '执行中',
  completed: '已完成',
  failed: '执行失败',
  stopped: '已停止',
  skipped: '已跳过',
};
const pendingDetails = new Map<string, Promise<Run>>();
function readRunDetail(id: string): Promise<Run> {
  const previous = pendingDetails.get(id);
  if (previous) return previous;
  const request = rpc('run.detail', { id });
  pendingDetails.set(id, request);
  const clear = () => {
    if (pendingDetails.get(id) === request) pendingDetails.delete(id);
  };
  void request.then(clear, clear);
  return request;
}
const dateTime = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
const duration = (start: string, end: string | null | undefined, now: number) => {
  const seconds = Math.max(
    0,
    Math.floor(((end ? Date.parse(end) : now) - Date.parse(start)) / 1000),
  );
  if (!Number.isFinite(seconds)) return '—';
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)} 小时 ${Math.floor((seconds % 3600) / 60)} 分`
    : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
};

export default function ExecutionPage({
  snapshot,
  run: summary,
  pending,
  onRunUpdate,
  onStop,
  onEdit,
  onPrepare,
  onOpenLogs,
}: Props) {
  const [detail, setDetail] = useState<Run>();
  const [loadError, setLoadError] = useState('');
  const run =
    detail?.id === summary?.id &&
    (detail?.status === summary?.status || detail?.status !== 'running')
      ? detail
      : summary;
  const [referenceRun, setReferenceRun] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    if (!summary) return;
    const id = summary.id;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const value = await readRunDetail(id);
        if (cancelled) return;
        setDetail(value);
        setLoadError('');
        onRunUpdate(value);
        if (value.status === 'running')
          timer = window.setTimeout(() => {
            void poll();
          }, 1000);
      } catch (cause) {
        if (cancelled) return;
        setLoadError(errorMessage(cause));
        timer = window.setTimeout(() => {
          void poll();
        }, 5000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [summary?.id, onRunUpdate]);
  useEffect(() => {
    if (run?.status !== 'running') return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [run?.status]);
  if (!run)
    return (
      <section className="exec-empty" aria-label="任务表执行页面">
        <ListChecks size={36} />
        <h1>任务表执行</h1>
        <p>开始执行后，在这里查看各项任务结果、材料与基建换班。</p>
        <button className="button primary" onClick={onPrepare}>
          前往任务表
        </button>
      </section>
    );

  const plan = snapshot.plans.find((item) => item.id === run.planId);
  const device = snapshot.devices.find((item) => item.id === run.deviceId);
  const tasks = run.tasks || [];
  const completed = tasks.filter((task) => task.status === 'completed').length;
  const counts = Object.fromEntries(
    Object.keys(taskNames).map((status) => [
      status,
      tasks.filter((task) => task.status === status).length,
    ]),
  );
  const resourceKey = snapshot.updates
    .filter((channel) => channel.id !== 'app')
    .map((channel) => channel.currentVersion)
    .join(':');
  const artifacts = tasks.flatMap((task) =>
    task.artifacts.map((artifact) => ({
      ...artifact,
      taskLabel: `${task.index + 1}. ${taskLabels[task.type] || '任务'}`,
    })),
  );
  const allDrops = tasks.flatMap((task) => task.drops);
  const totals = new Map<
    string,
    { itemId: string; name: string; quantity: number; stages: Set<string> }
  >();
  for (const drop of allDrops) {
    const key = drop.itemId || drop.name;
    const item = totals.get(key) || {
      itemId: drop.itemId,
      name: drop.name || drop.itemId,
      quantity: 0,
      stages: new Set<string>(),
    };
    item.quantity += drop.quantity;
    if (drop.stage) item.stages.add(drop.stage);
    totals.set(key, item);
  }
  const infrastructure = tasks.flatMap((task) =>
    task.infrastructure.map((item) => ({ ...item, taskIndex: task.index })),
  );

  return (
    <section className="exec-page" aria-label="任务表执行页面">
      <header className="exec-header">
        <div>
          <div className="exec-eyebrow">
            <ListChecks size={14} />
            {runSourceLabel(run)}执行
            <span className={`pill ${run.status}`}>{runNames[run.status]}</span>
          </div>
          <h1>{runDisplayName(run, snapshot.plans)}</h1>
          <p>{localizeExecutionMessage(run.message)}</p>
        </div>
        <div className="exec-actions">
          {!isCopilotRun(run) && (
            <button
              className="button secondary"
              onClick={() => (plan ? onEdit(plan) : onPrepare())}
            >
              <ArrowLeft size={15} />
              返回任务设置
            </button>
          )}
          {onOpenLogs && (
            <button className="button secondary" onClick={onOpenLogs}>
              <Terminal size={15} />
              查看日志
            </button>
          )}
          {run.status === 'running' && (
            <button
              className="button danger"
              disabled={pending.has(`stop-${run.id}`)}
              onClick={() => void onStop(run)}
            >
              <Square size={13} />
              停止执行
            </button>
          )}
        </div>
      </header>
      {loadError && (
        <p className="error-banner" role="alert">
          任务结果读取失败：{loadError}
        </p>
      )}
      <div className="exec-overview">
        <div className="exec-meta">
          <span>
            <Monitor size={14} />
            {device?.name || run.deviceId}
          </span>
          <span>
            <Clock3 size={14} />
            {duration(run.startedAt, run.finishedAt, clock)}
          </span>
          <span title={dateTime(run.startedAt)}>
            开始于 {new Date(run.startedAt).toLocaleTimeString('zh-CN', { hour12: false })}
          </span>
          {run.finishedAt && <span>结束于 {dateTime(run.finishedAt)}</span>}
        </div>
      </div>
      <div className="exec-layout">
        <aside className="exec-task-panel" aria-label="本次执行任务">
          <div className="exec-panel-heading">
            <h2>任务进度</h2>
            <span>
              {completed} / {tasks.length}
            </span>
          </div>
          <div
            className="exec-progress"
            role="progressbar"
            aria-label="整表执行进度"
            aria-valuenow={run.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${run.progress}%` }} />
          </div>
          {tasks.length ? (
            <ol className="exec-tasks">
              {tasks.map((task, index) => (
                <li key={task.index}>
                  <div
                    className={`exec-task ${task.status}`}
                    aria-current={task.status === 'running' ? 'step' : undefined}
                  >
                    <span className="exec-task-icon">
                      <TaskStatusIcon status={task.status} />
                    </span>
                    <span className="exec-task-info">
                      <strong>
                        {index + 1}. {taskLabels[task.type] || '任务'}
                      </strong>
                      <small>{taskNames[task.status]}</small>
                      {task.startedAt && (
                        <small>{duration(task.startedAt, task.finishedAt, clock)}</small>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="exec-placeholder">
              {!detail && !loadError ? '正在读取任务结果…' : '此历史记录未保存逐任务结果。'}
            </p>
          )}
          <p className="exec-snapshot-note">本页显示开始执行时的任务。修改设置用于下次执行。</p>
        </aside>
        <div className="exec-results">
          {isCopilotRun(run) && run.copilotEntries && (
            <section className="exec-panel" aria-label="本次作业队列">
              <div className="exec-panel-heading">
                <h2>
                  <ListChecks size={16} />
                  作业队列
                </h2>
                <span>{run.copilotEntries.length} 份作业</span>
              </div>
              <ol className="exec-outcomes">
                {run.copilotEntries.map((entry, index) => (
                  <li key={entry.id} className={entry.status}>
                    <div className="exec-outcome-heading">
                      <h3>
                        {index + 1}. {entry.title}
                      </h3>
                      <span
                        className={`pill ${entry.verdict === 'success' ? 'completed' : entry.verdict === 'failure' ? 'failed' : ''}`}
                      >
                        {entry.verdict === 'success'
                          ? '通关已确认'
                          : entry.verdict === 'failure'
                            ? '战斗失败'
                            : '通关未确认'}
                      </span>
                    </div>
                    <p>
                      {entry.status === 'completed' ? '核心流程结束' : taskNames[entry.status]}
                      {entry.message && ` · ${localizeExecutionMessage(entry.message)}`}
                    </p>
                  </li>
                ))}
              </ol>
              <p className="exec-result-note">
                作业流程结束不代表已通关，以每份作业的确认结果为准。
              </p>
            </section>
          )}
          <section className="exec-task-summary" aria-label="本次执行总览">
            <div>
              <h2>执行总览</h2>
              <span className={`pill ${run.status}`}>{runNames[run.status]}</span>
            </div>
            <p>{localizeExecutionMessage(run.message)}</p>
            <div className="exec-outcome-counts">
              {Object.entries(taskNames).map(
                ([status, label]) =>
                  counts[status] > 0 && (
                    <span key={status} className={status}>
                      <i />
                      {label}
                      <b>{counts[status]}</b>
                    </span>
                  ),
              )}
            </div>
            {run.finishedAt && <small>结束于 {dateTime(run.finishedAt)}</small>}
          </section>
          <section className="exec-panel" aria-label="全部任务结果">
            <div className="exec-panel-heading">
              <h2>
                <ListChecks size={16} />
                任务结果
              </h2>
              <span>共 {tasks.length} 项</span>
            </div>
            {tasks.length ? (
              <ol className="exec-outcomes">
                {tasks.map((task) => (
                  <li key={task.index} className={task.status}>
                    <div className="exec-outcome-heading">
                      <span className="exec-task-icon">
                        <TaskStatusIcon status={task.status} />
                      </span>
                      <h3>
                        {task.index + 1}. {taskLabels[task.type] || '任务'}
                      </h3>
                      <span className={`pill ${task.status}`}>{taskNames[task.status]}</span>
                      {task.startedAt && (
                        <time>{duration(task.startedAt, task.finishedAt, clock)}</time>
                      )}
                    </div>
                    <p>{localizeExecutionMessage(task.message) || taskNames[task.status]}</p>
                    {task.drops.length > 0 && (
                      <ul className="exec-task-drop-summary">
                        {task.drops.map((item, index) => (
                          <li key={index}>
                            {item.stage && <span>{item.stage} · </span>}
                            {item.name || item.itemId}
                            <b>× {item.quantity}</b>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="exec-placeholder">
                {!detail && !loadError ? '正在读取任务结果…' : '此历史记录未保存逐任务结果。'}
              </p>
            )}
          </section>
          <section className="exec-panel exec-drops" aria-label="本次获得材料">
            <div className="exec-panel-heading">
              <h2>
                <Package size={16} />
                本次获得材料
              </h2>
              <span>{totals.size} 种</span>
            </div>
            {totals.size ? (
              <ul className="exec-drop-list">
                {[...totals].map(([key, item]) => (
                  <li key={key}>
                    <MaterialIcon
                      itemId={item.itemId}
                      name={item.name}
                      resourceKey={resourceKey}
                      className="exec-item-symbol"
                    />
                    <div>
                      <strong>{item.name}</strong>
                      <small>{[...item.stages].join(' · ') || '核心掉落识别'}</small>
                    </div>
                    <b>× {item.quantity.toLocaleString('zh-CN')}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="exec-placeholder">
                <Package size={26} />
                <p>暂无材料反馈</p>
                <small>作战识别到掉落后，会在这里累计。</small>
              </div>
            )}
            <p className="exec-result-note">按本次执行的掉落识别汇总。</p>
          </section>
          {(infrastructure.length > 0 || tasks.some((task) => task.type === 'Infrast')) && (
            <section className="exec-panel" aria-label="基建换班反馈">
              <div className="exec-panel-heading">
                <h2>
                  <Layers size={16} />
                  基建换班结果
                </h2>
                <span>{infrastructure.length} 个设施记录</span>
              </div>
              {infrastructure.length ? (
                <div className="exec-infrastructure">
                  {infrastructure.map((item, index) => (
                    <article key={`${item.taskIndex}:${index}`}>
                      <div className="exec-facility-heading">
                        <strong>
                          {item.facility}
                          {item.room ? ` · ${item.room}` : ''}
                        </strong>
                        <time>
                          {new Date(item.at).toLocaleTimeString('zh-CN', { hour12: false })}
                        </time>
                      </div>
                      <small>第 {item.taskIndex + 1} 项基建换班</small>
                      {(item.staffingStatus || item.operators.length > 0) && (
                        <small className={`exec-staff-status ${item.staffingStatus || ''}`}>
                          {item.staffingStatus === 'confirmed'
                            ? '核心已确认换班'
                            : item.staffingStatus === 'planned'
                              ? '方案待确认'
                              : item.staffingStatus === 'unavailable'
                                ? '未应用排班方案'
                                : '确认状态未记录'}
                        </small>
                      )}
                      {item.operators.length > 0 ? (
                        <>
                          <p className="exec-staff-label">
                            {item.staffingStatus === 'confirmed' ? '本次排班干员' : '方案干员'}
                          </p>
                          <div className="exec-operators">
                            {item.operators.map((name, index) => (
                              <OperatorBadge
                                key={`${name}:${index}`}
                                name={name}
                                resourceKey={resourceKey}
                              />
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="exec-staff-unavailable">本次反馈未提供干员名单</p>
                      )}
                      {item.product && <p>产物：{item.product}</p>}
                      <small>{localizeExecutionMessage(item.message)}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="exec-placeholder">收到设施换班结果后，会在这里展示。</p>
              )}
            </section>
          )}
          <section className="exec-panel exec-reference" aria-label="参考截图">
            <button
              className="exec-reference-toggle"
              aria-expanded={referenceRun === run.id}
              aria-controls="exec-reference-content"
              onClick={() => setReferenceRun(referenceRun === run.id ? null : run.id)}
            >
              <span>
                <ImageIcon size={16} />
                <strong>参考截图</strong>
                <small>{artifacts.length} 张 · 按需查看</small>
              </span>
              <ChevronDown size={16} />
            </button>
            {referenceRun === run.id && (
              <div id="exec-reference-content">
                <ResultImages runId={run.id} artifacts={artifacts} />
                <p className="exec-visual-note">
                  截图仅供参考，来自任务反馈时的核心画面，保存在本机。
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

function TaskStatusIcon({ status }: { status: RunTask['status'] }) {
  return status === 'completed' ? (
    <Check size={15} />
  ) : status === 'running' ? (
    <LoaderCircle size={16} className="spin" />
  ) : status === 'failed' ? (
    <TriangleAlert size={15} />
  ) : status === 'stopped' ? (
    <Square size={12} />
  ) : (
    <Circle size={13} />
  );
}

function ResultImages({
  runId,
  artifacts,
}: {
  runId: string;
  artifacts: (RunArtifact & { taskLabel: string })[];
}) {
  const [selection, setSelection] = useState('');
  const [data, setData] = useState<{ id: string; src: string } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const artifact = artifacts.find((item) => item.id === selection) || artifacts.at(-1);
  useEffect(() => {
    setData(null);
    setError('');
    if (!artifact) return;
    let cancelled = false;
    const id = artifact.id;
    void rpc('run.artifact', { runId, artifactId: id })
      .then((result) => {
        if (!cancelled) setData({ id, src: `data:${result.mimeType};base64,${result.data}` });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [runId, artifact?.id, retry]);
  if (!artifact)
    return (
      <div className="exec-no-capture">
        <ImageIcon size={32} />
        <strong>暂无参考截图</strong>
        <p>收到任务反馈并成功取帧后，画面会保存在这里。</p>
      </div>
    );
  return (
    <div className="exec-captures">
      {artifacts.length > 1 && (
        <label>
          反馈截图
          <Select
            className="text-input"
            aria-label="选择结果截图"
            value={artifact.id}
            onChange={(event) => setSelection(event.target.value)}
          >
            {artifacts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.taskLabel} · {item.label} ·{' '}
                {new Date(item.capturedAt).toLocaleTimeString('zh-CN', { hour12: false })}
              </option>
            ))}
          </Select>
        </label>
      )}
      {error ? (
        <div className="exec-no-capture" role="alert">
          <TriangleAlert size={26} />
          <p>{error}</p>
          <button className="button secondary" onClick={() => setRetry((value) => value + 1)}>
            重新读取截图
          </button>
        </div>
      ) : data?.id === artifact.id ? (
        <figure>
          <img
            src={data.src}
            width={artifact.width}
            height={artifact.height}
            alt={artifact.label}
          />
          <figcaption>
            {artifact.taskLabel} · {artifact.label}
            <time>{dateTime(artifact.capturedAt)}</time>
          </figcaption>
        </figure>
      ) : (
        <div className="exec-no-capture" role="status">
          <LoaderCircle size={24} className="spin" />
          正在读取本机截图…
        </div>
      )}
    </div>
  );
}
