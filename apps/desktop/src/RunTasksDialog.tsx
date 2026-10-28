import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Play, TriangleAlert, X } from 'lucide-react';
import type { Device, Plan, Snapshot } from '@maaverge/contracts';
import './task-center.css';

type Props = {
  snapshot: Snapshot;
  plans: Plan[];
  selectedDeviceId: string;
  pending: Set<string>;
  onStart: (plan: Plan, deviceId?: string) => Promise<boolean>;
  onClose: () => void;
};

const boundDevice = (snapshot: Snapshot, plan: Plan) =>
  snapshot.devices.find((device) => device.id === plan.deviceId);

function planReady(plan: Plan) {
  return plan.enabled && plan.tasks.some((task) => task.enabled !== false);
}

function deviceIssue(snapshot: Snapshot, plan: Plan, device: Device | undefined, targetId: string) {
  if (!planReady(plan)) return plan.enabled ? '没有已启用的任务' : '任务表已停用';
  if (!device) return plan.deviceId ? '绑定设备不可用' : '请选择设备';
  if (plan.deviceId && plan.deviceId !== device.id) return '任务表已绑定其他实例';
  if (device.state === 'offline') return '离线，请先连接';
  if (snapshot.runs.some((run) => run.deviceId === device.id && run.status === 'running'))
    return '正在执行其他任务';
  if (device.state !== 'idle') return '设备忙，等待空闲';
  if (plan.deviceId && targetId !== plan.deviceId) return '任务表已绑定其他实例';
  return '';
}

export default function RunTasksDialog({
  snapshot,
  plans,
  selectedDeviceId,
  pending,
  onStart,
  onClose,
}: Props) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const busy = useRef(false);
  const multi = plans.length > 1;
  const single = plans[0];
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [targets, setTargets] = useState<Record<string, string>>(() =>
    initialTargets(snapshot, plans, selectedDeviceId),
  );
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(plans.map((plan) => plan.id)),
  );
  const selectedPlans = multi ? plans.filter((plan) => included.has(plan.id)) : plans;
  const issues = new Map<string, string>();
  for (const plan of selectedPlans) {
    const targetId = plan.deviceId || targets[plan.id] || '';
    issues.set(
      plan.id,
      deviceIssue(
        snapshot,
        plan,
        snapshot.devices.find((device) => device.id === targetId),
        targetId,
      ),
    );
  }
  const targetCounts = new Map<string, number>();
  for (const plan of selectedPlans) {
    const targetId = plan.deviceId || targets[plan.id] || '';
    if (!targetId) continue;
    targetCounts.set(targetId, (targetCounts.get(targetId) || 0) + 1);
  }
  for (const plan of selectedPlans) {
    const targetId = plan.deviceId || targets[plan.id] || '';
    if (targetId && (targetCounts.get(targetId) || 0) > 1)
      issues.set(plan.id, '同一设备只能运行一张任务表');
  }
  const blocked = [...issues.values()].some(Boolean);
  busy.current = submitting;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current
      ?.querySelector<HTMLElement>(
        'input:not(:disabled), select:not(:disabled), button:not(:disabled)',
      )
      ?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy.current) return;
      event.preventDefault();
      close.current();
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const toggle = (deviceId: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  const togglePlan = (planId: string) =>
    setIncluded((previous) => {
      const next = new Set(previous);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  const submit = async () => {
    if (submitting || blocked || !selectedPlans.length) return;
    const requests = multi
      ? selectedPlans.map((plan) => ({ plan, deviceId: plan.deviceId || targets[plan.id] || '' }))
      : single
        ? [...selected].map((deviceId) => ({ plan: single, deviceId }))
        : [];
    if (!requests.length || requests.some((item) => !item.deviceId)) return;
    setSubmitting(true);
    setErrors({});
    setNotice('');
    const settled = await Promise.allSettled(
      requests.map(async ({ plan, deviceId }) => ({ ok: await onStart(plan, deviceId) })),
    );
    const failed = settled.flatMap((result, index) =>
      result.status === 'rejected' || !result.value.ok
        ? [multi ? requests[index].plan.id : requests[index].deviceId]
        : [],
    );
    if (!failed.length) {
      onClose();
      return;
    }
    setErrors(
      Object.fromEntries(failed.map((key) => [key, '启动失败，请查看提示或连接状态后重试'])),
    );
    setNotice(
      multi
        ? `已在 ${requests.length - failed.length} 张任务表开始执行，${failed.length} 张失败。`
        : `已在 ${requests.length - failed.length} 台设备开始执行，${failed.length} 台失败。`,
    );
    if (multi) setIncluded(new Set(failed));
    else setSelected(new Set(failed));
    setSubmitting(false);
  };
  const dialogLabel = multi ? '运行所选任务表' : '运行任务表';
  const submitLabel = multi
    ? selectedPlans.length
      ? `运行 ${selectedPlans.length} 张任务表`
      : '选择任务表后运行'
    : selected.size
      ? `在 ${selected.size} 台设备运行`
      : '选择设备后运行';
  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <section
        ref={dialog}
        className="modal tc-launch"
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const nodes = [
            ...(dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),select:not(:disabled),input:not(:disabled)',
            ) ?? []),
          ].filter((node) => node.getClientRects().length > 0);
          if (!nodes.length) return;
          if (event.shiftKey && document.activeElement === nodes[0]) {
            event.preventDefault();
            nodes.at(-1)?.focus();
          } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
            event.preventDefault();
            nodes[0].focus();
          }
        }}
      >
        <div className="modal-title">
          <h2>{dialogLabel}</h2>
          <button
            className="icon-button"
            aria-label={multi ? '关闭运行所选任务表' : '关闭运行任务表'}
            disabled={submitting}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="tc-launch-body">
          {multi ? (
            <fieldset className="tc-launch-plans">
              <legend>
                已选任务表<span>{selectedPlans.length} 张</span>
              </legend>
              {plans.map((plan) => {
                const targetId = plan.deviceId || targets[plan.id] || '';
                const target = snapshot.devices.find((device) => device.id === targetId);
                const reason = issues.get(plan.id) || '';
                const active = included.has(plan.id);
                return (
                  <div className={`tc-launch-plan ${active ? '' : 'is-excluded'}`} key={plan.id}>
                    <input
                      type="checkbox"
                      aria-label={`选择运行任务表${plan.name}`}
                      disabled={submitting}
                      checked={active}
                      onChange={() => togglePlan(plan.id)}
                    />
                    <div className="tc-launch-plan-main">
                      <strong>{plan.name}</strong>
                      <small>
                        {plan.tasks.filter((task) => task.enabled !== false).length} 项启用
                        {plan.deviceId ? ` · 绑定 ${target?.name || '设备'}` : ' · 未绑定设备'}
                      </small>
                      {!plan.deviceId && (
                        <select
                          className="text-input"
                          aria-label={`为${plan.name}选择设备`}
                          value={targets[plan.id] || ''}
                          disabled={submitting || !active}
                          onChange={(event) => {
                            setTargets((previous) => ({
                              ...previous,
                              [plan.id]: event.target.value,
                            }));
                          }}
                        >
                          <option value="">选择运行设备</option>
                          {snapshot.devices.map((device) => (
                            <option key={device.id} value={device.id}>
                              {device.name} ·{' '}
                              {device.state === 'offline'
                                ? '离线'
                                : device.state === 'running'
                                  ? '执行中'
                                  : '空闲'}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <span className={`tc-launch-reason ${reason ? 'is-blocked' : ''}`}>
                      {errors[plan.id] ||
                        reason ||
                        (pending.has(`start-plan-${targetId}`)
                          ? '正在开始…'
                          : active
                            ? '可以运行'
                            : '已排除')}
                    </span>
                  </div>
                );
              })}
            </fieldset>
          ) : (
            single && (
              <>
                <div className="tc-launch-plan-fixed">
                  <span>任务表</span>
                  <strong>{single.name}</strong>
                  <small>
                    {single.tasks.filter((task) => task.enabled !== false).length} 项启用
                    {single.deviceId
                      ? ` · 绑定 ${boundDevice(snapshot, single)?.name || '设备'}`
                      : ' · 未绑定设备'}
                  </small>
                </div>
                <fieldset className="tc-launch-devices">
                  <legend>
                    选择设备<span>已选 {selected.size} 台</span>
                  </legend>
                  {!snapshot.devices.length && (
                    <p className="tc-launch-empty">
                      还没有设备，请先在设备页添加并连接模拟器实例。
                    </p>
                  )}
                  {snapshot.devices.map((device) => {
                    const reason = deviceIssue(snapshot, single, device, device.id);
                    const active = snapshot.runs.some(
                      (run) => run.deviceId === device.id && run.status === 'running',
                    );
                    return (
                      <label
                        key={device.id}
                        className={`tc-launch-device ${reason ? 'is-unavailable' : ''}`}
                      >
                        <input
                          type="checkbox"
                          aria-label={`选择设备${device.name}`}
                          disabled={!!reason || submitting}
                          checked={selected.has(device.id)}
                          onChange={() => toggle(device.id)}
                        />
                        <span className="tc-launch-device-copy">
                          <strong>
                            {device.name}
                            {device.id === selectedDeviceId && <small>当前设备</small>}
                            {active && <small className="is-running">执行中</small>}
                          </strong>
                          <small>{device.address}</small>
                        </span>
                        <span className={`tc-launch-reason ${reason ? 'is-blocked' : ''}`}>
                          {errors[device.id] ||
                            reason ||
                            (pending.has(`start-plan-${single.deviceId || device.id}`)
                              ? '正在开始…'
                              : '空闲就绪')}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              </>
            )
          )}
          {notice && (
            <p className="tc-launch-notice" role="status">
              <TriangleAlert size={14} />
              {notice}
            </p>
          )}
          <p className="tc-launch-hint">
            {multi
              ? '每张任务表只在其绑定设备上运行；未绑定任务表需在行内选择设备。同一设备不能同时运行多张任务表。'
              : '每台设备独立执行；绑定任务表只能在其绑定实例上启动。执行开始后可在「执行监控」查看进度。'}
          </p>
        </div>
        <div className="modal-actions">
          <button className="button secondary" disabled={submitting} onClick={onClose}>
            取消
          </button>
          <button
            className="button primary"
            disabled={submitting || blocked || (multi ? !selectedPlans.length : !selected.size)}
            onClick={() => void submit()}
          >
            {submitting ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}
            {submitting ? '正在运行…' : submitLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function initialTargets(snapshot: Snapshot, plans: Plan[], selectedDeviceId: string) {
  const used = new Set(plans.map((plan) => plan.deviceId).filter((id): id is string => !!id));
  const targets: Record<string, string> = {};
  for (const plan of plans) {
    if (plan.deviceId) {
      targets[plan.id] = plan.deviceId;
      continue;
    }
    const preferred = snapshot.devices.find(
      (device) => device.id === selectedDeviceId && device.state === 'idle' && !used.has(device.id),
    );
    const candidate =
      preferred ||
      snapshot.devices.find((device) => device.state === 'idle' && !used.has(device.id));
    if (candidate) {
      targets[plan.id] = candidate.id;
      used.add(candidate.id);
    }
  }
  return targets;
}
