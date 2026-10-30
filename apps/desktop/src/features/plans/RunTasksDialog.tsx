import { useRef, useState } from 'react';
import { LoaderCircle, Play, TriangleAlert } from 'lucide-react';
import {
  planAllowsDevice,
  planDeviceIds,
  type Device,
  type Plan,
  type Snapshot,
} from '@maaverge/contracts';
import './task-center.css';
import DeviceSelectionList from '@/features/devices/DeviceSelectionList';
import Modal from '@/kit/Modal';

type Props = {
  snapshot: Snapshot;
  plans: Plan[];
  selectedDeviceId: string;
  pending: Set<string>;
  onStart: (plan: Plan, deviceId?: string, requestId?: string) => Promise<boolean>;
  onClose: () => void;
};

const pairKey = (planId: string, deviceId: string) => JSON.stringify([planId, deviceId]);

function planReady(plan: Plan) {
  return plan.tasks.some((task) => task.enabled !== false && task.params.enable !== false);
}

function deviceIssue(snapshot: Snapshot, plan: Plan, device: Device | undefined) {
  if (!planReady(plan)) return '没有已启用的任务';
  if (!device) return planDeviceIds(plan).length ? '绑定设备不可用' : '设备不可用';
  if (!planAllowsDevice(plan, device.id)) return '未绑定到本任务表';
  if (device.state === 'offline') return '离线，请先连接';
  if (snapshot.runs.some((run) => run.deviceId === device.id && run.status === 'running'))
    return '正在执行其他任务';
  if (snapshot.toolJobs?.some((job) => job.deviceId === device.id && job.status === 'running'))
    return '正在执行工具';
  if (device.state !== 'idle') return '设备忙，等待空闲';
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
  const requestIds = useRef(new Map<string, string>());
  const multi = plans.length > 1;
  const single = plans[0];
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [targets, setTargets] = useState<Record<string, string[]>>(() =>
    initialTargets(snapshot, plans, selectedDeviceId),
  );
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(plans.map((plan) => plan.id)),
  );
  const selectedPlans = multi ? plans.filter((plan) => included.has(plan.id)) : plans;
  const requests = selectedPlans.flatMap((plan) =>
    (targets[plan.id] ?? []).map((deviceId) => ({ plan, deviceId })),
  );
  const targetCounts = new Map<string, number>();
  for (const { deviceId } of requests)
    targetCounts.set(deviceId, (targetCounts.get(deviceId) ?? 0) + 1);
  const issues = new Map<string, string>();
  for (const { plan, deviceId } of requests) {
    issues.set(
      pairKey(plan.id, deviceId),
      (targetCounts.get(deviceId) ?? 0) > 1
        ? '同一设备只能运行一张任务表'
        : completed.has(pairKey(plan.id, deviceId))
          ? '本次已启动'
          : deviceIssue(
              snapshot,
              plan,
              snapshot.devices.find((device) => device.id === deviceId),
            ),
    );
  }
  const blocked =
    selectedPlans.some((plan) => !targets[plan.id]?.length) || [...issues.values()].some(Boolean);
  const togglePlan = (planId: string) =>
    setIncluded((previous) => {
      const next = new Set(previous);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  const submit = async () => {
    if (submitting || blocked || !requests.length) return;
    setSubmitting(true);
    setErrors({});
    setNotice('');
    const settled = await Promise.allSettled(
      requests.map(async ({ plan, deviceId }) => {
        const key = pairKey(plan.id, deviceId);
        let requestId = requestIds.current.get(key);
        if (!requestId) {
          requestId = crypto.randomUUID();
          requestIds.current.set(key, requestId);
        }
        return { ok: await onStart(plan, deviceId, requestId) };
      }),
    );
    const failed = requests.filter((_, index) => {
      const result = settled[index];
      return result.status === 'rejected' || !result.value.ok;
    });
    if (!failed.length) {
      onClose();
      return;
    }
    const failedKeys = new Set(failed.map(({ plan, deviceId }) => pairKey(plan.id, deviceId)));
    setCompleted((previous) => {
      const next = new Set(previous);
      for (const { plan, deviceId } of requests) {
        const key = pairKey(plan.id, deviceId);
        if (!failedKeys.has(key)) next.add(key);
      }
      return next;
    });
    setErrors(
      Object.fromEntries(
        [...failedKeys].map((key) => [key, '启动失败，请查看提示或连接状态后重试']),
      ),
    );
    setNotice(
      `已启动 ${requests.length - failed.length} 项执行，${failed.length} 项失败；重试仅包含失败的任务表与设备。`,
    );
    setIncluded(new Set(failed.map(({ plan }) => plan.id)));
    setTargets((previous) => ({
      ...previous,
      ...Object.fromEntries(
        selectedPlans.map((plan) => [
          plan.id,
          failed.filter((item) => item.plan.id === plan.id).map((item) => item.deviceId),
        ]),
      ),
    }));
    setSubmitting(false);
  };
  const deviceRows = (plan: Plan) => {
    const selected = targets[plan.id] ?? [];
    const ids = [
      ...new Set([
        ...snapshot.devices.map((device) => device.id),
        ...planDeviceIds(plan),
        ...selected,
      ]),
    ];
    const items = ids.map((deviceId) => {
      const device = snapshot.devices.find((item) => item.id === deviceId);
      const key = pairKey(plan.id, deviceId);
      const checked = selected.includes(deviceId);
      const reason =
        issues.get(key) ||
        (completed.has(key) ? '本次已启动' : deviceIssue(snapshot, plan, device));
      const active = snapshot.runs.some(
        (run) => run.deviceId === deviceId && run.status === 'running',
      );
      return {
        id: deviceId,
        name: device?.name || deviceId,
        address: device?.address,
        state: device?.state ?? ('missing' as const),
        tag: [deviceId === selectedDeviceId ? '当前设备' : '', active ? '执行中' : '']
          .filter(Boolean)
          .join(' · '),
        note:
          errors[key] ||
          reason ||
          (pending.has(`start-plan-${deviceId}`) ? '正在开始…' : '空闲就绪'),
        disabled: !!reason && !checked,
      };
    });
    return (
      <DeviceSelectionList
        ariaLabel="运行设备"
        items={items}
        selectedIds={selected}
        disabled={submitting || (multi && !included.has(plan.id))}
        checkboxLabel={(device) =>
          multi ? `为${plan.name}选择设备${device.name}` : `选择设备${device.name}`
        }
        onChange={(deviceIds) => setTargets((previous) => ({ ...previous, [plan.id]: deviceIds }))}
      />
    );
  };
  const dialogLabel = multi ? '运行所选任务表' : '运行任务表';
  const submitLabel = multi
    ? requests.length
      ? `运行 ${selectedPlans.length} 张任务表`
      : '选择任务表与设备后运行'
    : requests.length
      ? `在 ${requests.length} 台设备运行`
      : '选择设备后运行';
  return (
    <Modal
      title={dialogLabel}
      closeLabel={multi ? '关闭运行所选任务表' : '关闭运行任务表'}
      className="modal tc-launch"
      busy={submitting}
      closeDisabled={submitting}
      onClose={onClose}
    >
      <div className="tc-launch-body">
        {multi ? (
          <fieldset className="tc-launch-plans">
            <legend>
              已选任务表
              <span>
                {selectedPlans.length} 张 · {requests.length} 项执行
              </span>
            </legend>
            {plans.map((plan) => {
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
                      {planDeviceIds(plan).length
                        ? ` · 绑定 ${planDeviceIds(plan).length} 台设备`
                        : ' · 未绑定设备'}
                    </small>
                    <fieldset className="tc-launch-devices">
                      <legend>运行设备</legend>
                      {deviceRows(plan)}
                    </fieldset>
                    {active && !targets[plan.id]?.length && <small>请选择至少一台运行设备</small>}
                  </div>
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
                  {planDeviceIds(single).length
                    ? ` · 绑定 ${planDeviceIds(single).length} 台设备`
                    : ' · 未绑定设备'}
                </small>
              </div>
              <fieldset className="tc-launch-devices">
                <legend>选择设备</legend>
                {!snapshot.devices.length && !planDeviceIds(single).length && (
                  <p className="tc-launch-empty">还没有设备，请先在设备页添加并连接模拟器实例。</p>
                )}
                {deviceRows(single)}
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
          每张任务表可选择多台设备独立执行；已绑定的任务表只能选择绑定设备，未绑定可临时选择任意设备。同一设备不能同时运行多张任务表。执行开始后可在「执行监控」查看进度。
        </p>
      </div>
      <div className="modal-actions">
        <button className="button secondary" disabled={submitting} onClick={onClose}>
          取消
        </button>
        <button
          className="button primary"
          disabled={submitting || blocked || !requests.length}
          onClick={() => void submit()}
        >
          {submitting ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}
          {submitting ? '正在运行…' : submitLabel}
        </button>
      </div>
    </Modal>
  );
}

function initialTargets(snapshot: Snapshot, plans: Plan[], selectedDeviceId: string) {
  const used = new Set(plans.flatMap(planDeviceIds));
  const targets: Record<string, string[]> = {};
  for (const plan of plans) {
    const bound = planDeviceIds(plan);
    if (bound.length) {
      targets[plan.id] = [...bound];
      continue;
    }
    if (plans.length === 1) {
      targets[plan.id] = [];
      continue;
    }
    const preferred = snapshot.devices.find(
      (device) => device.id === selectedDeviceId && device.state === 'idle' && !used.has(device.id),
    );
    const candidate =
      preferred ||
      snapshot.devices.find((device) => device.state === 'idle' && !used.has(device.id));
    targets[plan.id] = candidate ? [candidate.id] : [];
    if (candidate) used.add(candidate.id);
  }
  return targets;
}
