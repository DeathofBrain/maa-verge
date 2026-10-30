import { localizeExecutionMessage, type Plan, type Run, type Snapshot } from '@maaverge/contracts';
import DevicePreview from '@/features/devices/DevicePreview';
import ExecutionPage from '@/features/execution/ExecutionPage';
import MonitorLogDrawer from '@/features/execution/MonitorLogDrawer';
import MultiRunPanel from '@/features/execution/MultiRunPanel';
import RunPanel from '@/features/execution/RunPanel';
import StatusPill from '@/kit/StatusPill';
import ProgressBar from '@/kit/ProgressBar';
import { runStatusLabels, runStatusTones } from '@/kit/labels';
import { deviceActivity, type RunPanelTab } from '@/app/model/device-activity';

type Props = {
  snapshot: Snapshot;
  selectedDevice: string;
  panel: RunPanelTab;
  pending: Set<string>;
  onClose: () => void;
  onPrepare: () => void;
  onRunUpdate: (run: Run) => void;
  onStart: (plan: Plan, deviceId?: string, requestId?: string) => Promise<boolean>;
  onStop: (run: Run) => Promise<boolean>;
  onInspect: (run: Run) => void;
  onConnect: () => void;
};

export default function AppRunPanel({
  snapshot,
  selectedDevice,
  panel,
  pending,
  onClose,
  onPrepare,
  onRunUpdate,
  onStart,
  onStop,
  onInspect,
  onConnect,
}: Props) {
  const { device, dockExecution, panelRun, panelTool } = deviceActivity(snapshot, selectedDevice);
  return (
    <RunPanel
      title={
        { progress: '运行详情', logs: '设备日志', preview: '设备画面', instances: '多开执行' }[
          panel
        ]
      }
      deviceName={panel === 'instances' ? undefined : device?.name}
      onClose={onClose}
    >
      {panel === 'progress' &&
        device?.state !== 'offline' &&
        !dockExecution &&
        (panelRun || panelTool) && (
          <p className="run-panel-history" role="status">
            当前没有任务，以下为上次执行
          </p>
        )}
      {panel === 'progress' &&
        (device?.state === 'offline' || !device ? (
          <div className="run-panel-empty">
            <h2>{device ? '设备已离线' : '尚未选择设备'}</h2>
            <p>从底栏选择已连接的设备，查看它的执行情况。</p>
          </div>
        ) : panelRun ? (
          <ExecutionPage
            key={panelRun.id}
            snapshot={snapshot}
            run={panelRun}
            onRunUpdate={onRunUpdate}
            onPrepare={onPrepare}
          />
        ) : panelTool ? (
          <section className="run-panel-tool" aria-label="工具执行状态">
            <h2>工具执行</h2>
            <StatusPill
              tone={runStatusTones[panelTool.status]}
              label={runStatusLabels[panelTool.status]}
            />
            <p>{localizeExecutionMessage(panelTool.message)}</p>
            <ProgressBar value={panelTool.progress} label="工具执行进度" />
          </section>
        ) : (
          <div className="run-panel-empty">
            <h2>{device.state === 'running' ? '正在等待执行状态' : '当前没有任务'}</h2>
            <p>在任务页或作业中心开始执行后，进度与结果会显示在这里。</p>
          </div>
        ))}
      {panel === 'logs' && (
        <MonitorLogDrawer
          key={selectedDevice}
          snapshot={snapshot}
          initialDeviceIds={device ? [device.id] : []}
          embedded
          onClose={onClose}
        />
      )}
      {panel === 'preview' && (
        <div className="run-panel-preview">
          <DevicePreview key={device?.id || 'no-device'} device={device} />
        </div>
      )}
      {panel === 'instances' && (
        <MultiRunPanel
          devices={snapshot.devices}
          plans={snapshot.plans}
          runs={snapshot.runs}
          pending={pending}
          onStart={onStart}
          onStop={onStop}
          onInspect={onInspect}
          onConnect={onConnect}
        />
      )}
    </RunPanel>
  );
}
