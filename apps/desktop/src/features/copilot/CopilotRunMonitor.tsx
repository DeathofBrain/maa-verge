import type { RefObject } from 'react';
import { LoaderCircle, Square } from 'lucide-react';
import { rpc, type CopilotKind, type RpcResult, type Snapshot } from '@maaverge/contracts';
import Button from '@/kit/Button';
import ProgressBar from '@/kit/ProgressBar';
import Select from '@/kit/Select';

type Props = {
  panelRef: RefObject<HTMLElement | null>;
  monitorDevice: string;
  monitorDeviceIds: string[];
  deviceName: (id: string) => string;
  selectMonitorDevice: (id: string) => void;
  runId: string;
  runChoices: Snapshot['runs'];
  selectMonitorRun: (id: string) => void;
  runError: string;
  setRunRevision: (updater: (value: number) => number) => void;
  run?: RpcResult<'run.detail'>;
  events: Snapshot['events'];
  detailId?: string;
  onAction: (key: string, call: () => Promise<unknown>, success?: string) => Promise<boolean>;
  kindLabel: (kind: CopilotKind) => string;
};

export default function CopilotRunMonitor({
  panelRef,
  monitorDevice,
  monitorDeviceIds,
  deviceName,
  selectMonitorDevice,
  runId,
  runChoices,
  selectMonitorRun,
  runError,
  setRunRevision,
  run,
  events,
  detailId,
  onAction,
  kindLabel,
}: Props) {
  return (
    <section ref={panelRef} className="sp-section cp-run" aria-label="作业运行状态">
      <header className="cp-run-controls">
        <h2>作业执行结果</h2>
        <div className="cp-run-filters">
          <label className="cp-run-select">
            查看设备
            <Select
              className="text-input"
              aria-label="查看作业设备"
              value={monitorDevice}
              onChange={(event) => selectMonitorDevice(event.target.value)}
            >
              <option value="">全部设备</option>
              {monitorDeviceIds.map((id) => (
                <option key={id} value={id}>
                  {deviceName(id)}
                </option>
              ))}
            </Select>
          </label>
          <label className="cp-run-select cp-run-history">
            执行记录
            <Select
              className="text-input"
              aria-label="查看作业记录"
              value={runId}
              onChange={(event) => selectMonitorRun(event.target.value)}
            >
              <option value="">当前／最近执行</option>
              {runId && !runChoices.some((item) => item.id === runId) && (
                <option value={runId}>指定执行记录</option>
              )}
              {runChoices.map((item) => (
                <option key={item.id} value={item.id}>
                  {!monitorDevice ? deviceName(item.deviceId) + ' · ' : ''}
                  {item.sourceName || item.planName || '作业执行'} ·{' '}
                  {new Date(item.startedAt).toLocaleString('zh-CN')}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </header>
      {runError && (
        <div className="cp-run-error" role="alert">
          <span>读取执行记录失败：{runError}</span>
          <Button variant="text" onClick={() => setRunRevision((value) => value + 1)}>
            重试读取记录
          </Button>
        </div>
      )}
      {run ? (
        <>
          <header className="cp-run-summary">
            <div>
              <span className="cp-stage">
                {run.copilotKind && `${kindLabel(run.copilotKind)} · `}
                {deviceName(run.deviceId)}
              </span>
              <h3>{run.sourceName || run.planName || '作业执行'}</h3>
              <p>{run.message}</p>
            </div>
            {run.status === 'running' && (
              <Button
                className="cp-run-stop"
                icon={<Square size={15} />}
                onClick={() => {
                  void onAction(
                    'stop-' + run.id,
                    () => rpc('run.stop', { id: run.id }),
                    '正在停止作业',
                  );
                }}
              >
                停止作业
              </Button>
            )}
          </header>
          <ProgressBar className="cp-run-progress" value={run.progress} label="作业执行进度" />
          <p className="sp-help">
            {new Date(run.startedAt).toLocaleString('zh-CN')} ·{' '}
            {run.status === 'running'
              ? '运行中'
              : run.status === 'completed'
                ? '核心流程结束'
                : run.status === 'stopped'
                  ? '已停止'
                  : '执行失败'}
            。停止会清空核心队列，本机配置和未执行项保留。
          </p>
          {run.copilotEntries && (
            <ol className="cp-run-entries">
              {run.copilotEntries.map((entry, index) => (
                <li key={entry.id}>
                  <span className="cp-sequence">{String(index + 1).padStart(2, '0')}</span>
                  <strong>{entry.title}</strong>
                  <span className={`cp-verdict ${entry.verdict === 'failure' ? 'is-error' : ''}`}>
                    {entry.verdict === 'success'
                      ? '通关已确认'
                      : entry.verdict === 'failure'
                        ? '战斗失败'
                        : '通关未确认'}
                  </span>
                  <small>
                    {entry.message ||
                      {
                        waiting: '等待执行',
                        running: '执行中',
                        completed: '核心流程结束',
                        failed: '失败',
                        stopped: '已停止',
                        skipped: '未执行',
                      }[entry.status]}
                  </small>
                </li>
              ))}
            </ol>
          )}
          <details key={run.id} className="cp-run-logs">
            <summary>本次运行日志（{events.length}）</summary>
            {events.length ? (
              <ol>
                {events.map((event) => (
                  <li key={event.id}>
                    <time>{new Date(event.createdAt).toLocaleTimeString('zh-CN')}</time>
                    <span>{event.message}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="sp-help">等待本次运行事件。</p>
            )}
          </details>
        </>
      ) : detailId && !runError ? (
        <p className="cp-run-empty" role="status">
          <LoaderCircle size={15} className="spin" />
          正在读取指定执行记录…
        </p>
      ) : !runError ? (
        <p className="cp-run-empty">
          {monitorDevice ? '此设备还没有作业执行记录。' : '还没有作业执行记录。'}
        </p>
      ) : null}
    </section>
  );
}
