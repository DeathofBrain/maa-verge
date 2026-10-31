import {
  planAllowsDevice,
  planDeviceIds,
  type Device,
  type Plan,
  type Snapshot,
} from '@maaverge/contracts';

export function planDeviceIssue(snapshot: Snapshot, plan: Plan, device: Device | undefined) {
  if (!plan.tasks.some((task) => task.enabled !== false && task.params.enable !== false))
    return '没有已启用的任务';
  if (!device) return planDeviceIds(plan).length ? '绑定设备不可用' : '设备不可用';
  const active = snapshot.runs.find(
    (run) => run.deviceId === device.id && run.status === 'running',
  );
  if (active?.source !== 'copilot' && active?.planId === plan.id) return '本表执行中';
  if (!planAllowsDevice(plan, device.id)) return '未绑定到本任务表';
  if (device.state === 'offline') return '离线，请先连接';
  if (active) return '正在执行其他任务';
  if (snapshot.toolJobs?.some((job) => job.deviceId === device.id && job.status === 'running'))
    return '正在执行工具';
  if (device.state !== 'idle') return '设备忙，等待空闲';
  return '';
}

export function availablePlanDevices(
  snapshot: Snapshot,
  plan: Plan,
  pending?: ReadonlySet<string>,
): Device[] {
  return snapshot.devices.filter(
    (device) =>
      !planDeviceIssue(snapshot, plan, device) && !pending?.has(`start-plan-${device.id}`),
  );
}
