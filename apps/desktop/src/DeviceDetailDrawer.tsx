import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Monitor, X } from 'lucide-react';
import type { Device, Plan, Run, Snapshot } from '@maaverge/contracts';
import ExecutionPage from './ExecutionPage';
import './monitor-log-drawer.css';
import './execution-monitor.css';

type Props = {
  snapshot: Snapshot;
  device: Device;
  run?: Run;
  pending: Set<string>;
  onRunUpdate: (run: Run) => void;
  onStop: (run: Run) => Promise<boolean>;
  onEdit: (plan: Plan) => void;
  onPrepare: () => void;
  onClose: () => void;
};
const when = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

export default function DeviceDetailDrawer({
  snapshot,
  device,
  run,
  pending,
  onRunUpdate,
  onStop,
  onEdit,
  onPrepare,
  onClose,
}: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>('.sidebar');
    const shell = document.querySelector<HTMLElement>('.main-shell');
    const dock = document.querySelector<HTMLElement>('.run-dock');
    const previous = [
      sidebar?.inert ?? false,
      shell?.inert ?? false,
      dock?.inert ?? false,
    ] as const;
    const previousOverflow = document.body.style.overflow;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (sidebar) sidebar.inert = true;
    if (shell) shell.inert = true;
    if (dock) dock.inert = true;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.querySelector('.app-context-menu')) return;
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const targets = [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]',
        ) ?? []),
      ].filter((target) => !target.closest('[hidden]') && target.getClientRects().length > 0);
      const first = targets[0],
        last = targets.at(-1);
      if (!first) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (!targets.includes(document.activeElement as HTMLElement) ||
          document.activeElement === first)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (!targets.includes(document.activeElement as HTMLElement) ||
          document.activeElement === last)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      if (sidebar) sidebar.inert = previous[0];
      if (shell) shell.inert = previous[1];
      if (dock) dock.inert = previous[2];
      document.body.style.overflow = previousOverflow;
      if (active?.isConnected) active.focus({ preventScroll: true });
    };
  }, []);
  const state = run ? 'running' : device.state;
  const stateLabel = run
    ? '执行中'
    : device.state === 'running'
      ? '其他任务执行中'
      : device.state === 'offline'
        ? '离线'
        : '空闲';
  const plan = run ? snapshot.plans.find((item) => item.id === run.planId) : undefined;
  const bound = snapshot.plans.find((item) => item.deviceId === device.id);
  const profile = device.connectionProfileId
    ? snapshot.settings.deviceProfiles?.find((item) => item.id === device.connectionProfileId)
    : undefined;
  const synced =
    [
      device.dataSync?.operatorsAt ? `干员 ${when(device.dataSync.operatorsAt)}` : '',
      device.dataSync?.depotAt ? `仓库 ${when(device.dataSync.depotAt)}` : '',
    ]
      .filter(Boolean)
      .join(' · ') || '尚未同步';
  return createPortal(
    <div className="monitor-log-layer">
      <button
        className="monitor-log-backdrop"
        tabIndex={-1}
        aria-label="关闭设备详情遮罩"
        onClick={() => close.current()}
      />
      <div
        className="monitor-log-panel device-detail-panel"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`设备详情${device.name}`}
      >
        <div className="monitor-log-bar">
          <div className="monitor-log-title">
            <Monitor size={17} />
            <div>
              <strong>{device.name}</strong>
              <small>{device.address}</small>
            </div>
          </div>
          <div className="device-detail-actions">
            <span className={`monitor-device-state ${state}`}>{stateLabel}</span>
            <button
              className="icon-button"
              data-autofocus
              aria-label="关闭设备详情"
              onClick={() => close.current()}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <section className="device-detail-info" aria-label="设备信息">
          <h2>设备信息</h2>
          <dl className="device-detail-grid">
            <div>
              <dt>连接地址</dt>
              <dd>{device.address}</dd>
            </div>
            <div>
              <dt>核心版本</dt>
              <dd>{device.coreVersion || '未加载'}</dd>
            </div>
            <div>
              <dt>资源版本</dt>
              <dd>{device.resourceVersion || '未加载'}</dd>
            </div>
            <div>
              <dt>连接配置</dt>
              <dd>{profile?.name || '默认连接'}</dd>
            </div>
            <div>
              <dt>绑定任务表</dt>
              <dd>{bound?.name || '未绑定'}</dd>
            </div>
            <div>
              <dt>任务表状态</dt>
              <dd>
                {run
                  ? `正在运行 ${run.planName || plan?.name || '已删除的任务表'}`
                  : '现在没有运行'}
              </dd>
            </div>
            <div>
              <dt>数据同步</dt>
              <dd>{synced}</dd>
            </div>
          </dl>
          {device.connectionError && (
            <p className="device-detail-error" role="alert">
              {device.connectionError}
            </p>
          )}
        </section>
        {run ? (
          <div className="device-detail-run">
            <ExecutionPage
              key={run.id}
              snapshot={snapshot}
              run={run}
              pending={pending}
              onRunUpdate={onRunUpdate}
              onStop={onStop}
              onEdit={(plan) => {
                close.current();
                onEdit(plan);
              }}
              onPrepare={() => {
                close.current();
                onPrepare();
              }}
            />
          </div>
        ) : (
          <div className="device-detail-empty">
            <Monitor size={32} />
            <h2>现在没有运行</h2>
            <p>
              {bound
                ? `已绑定 ${bound.name}，开始执行后进度和结果会显示在这里。`
                : '开始执行任务表后，进度和结果会显示在这里。'}
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
