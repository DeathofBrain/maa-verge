import type { Snapshot } from '@maaverge/contracts';

export type RunPanelTab = 'progress' | 'logs' | 'preview' | 'instances';

function latest<T extends { deviceId: string; startedAt: string; id: string }>(
  items: T[],
  deviceId: string,
) {
  return items.reduce<T | undefined>((result, item) => {
    if (item.deviceId !== deviceId) return result;
    if (!result) return item;
    return item.startedAt.localeCompare(result.startedAt) > 0 ||
      (item.startedAt === result.startedAt && item.id.localeCompare(result.id) > 0)
      ? item
      : result;
  }, undefined);
}

export function deviceActivity(snapshot: Snapshot | null, deviceId: string) {
  const device = snapshot?.devices.find((item) => item.id === deviceId);
  const activeRuns = snapshot?.runs.filter((item) => item.status === 'running') || [];
  const dockRun =
    device?.state !== 'offline' ? activeRuns.find((item) => item.deviceId === deviceId) : undefined;
  const dockTool =
    device?.state !== 'offline'
      ? snapshot?.toolJobs?.find((item) => item.deviceId === deviceId && item.status === 'running')
      : undefined;
  const latestRun = latest(snapshot?.runs || [], deviceId);
  const latestTool = latest(snapshot?.toolJobs || [], deviceId);
  const panelTool =
    dockTool ||
    (!dockRun && latestTool && (!latestRun || latestTool.startedAt > latestRun.startedAt)
      ? latestTool
      : undefined);

  return {
    device,
    activeRuns,
    dockRun,
    dockTool,
    dockExecution: dockRun || dockTool,
    panelTool,
    panelRun: panelTool ? undefined : dockRun || latestRun,
  };
}
