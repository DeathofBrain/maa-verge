import Button from '@/kit/Button';
import IconButton from '@/kit/IconButton';
import {
  ChevronDown,
  ChevronUp,
  Layers,
  ListChecks,
  LoaderCircle,
  Monitor,
  Square,
  Terminal,
} from 'lucide-react';
import { localizeExecutionMessage, type Device, type Plan } from '@maaverge/contracts';
import DevicePicker from '@/features/devices/DevicePicker';
import type { RunPanelTab } from '@/app/model/device-activity';

type DockActivity = { id: string; message: string; progress: number };

type Props = {
  devices: Device[];
  selectedDevice: string;
  onSelectDevice: (id: string) => void;
  device?: Device;
  dockExecution?: DockActivity;
  selectedPlan?: Plan;
  pageLabel: string;
  isHome: boolean;
  runPanel: RunPanelTab | null;
  onTogglePanel: (panel: RunPanelTab) => void;
  onClosePanel: () => void;
  activeRunsCount: number;
  stopDisabled: boolean;
  onStopDock: () => void;
};

export default function RunDock({
  devices,
  selectedDevice,
  onSelectDevice,
  device,
  dockExecution,
  selectedPlan,
  pageLabel,
  isHome,
  runPanel,
  onTogglePanel,
  onClosePanel,
  activeRunsCount,
  stopDisabled,
  onStopDock,
}: Props) {
  return (
    <footer className={`run-dock ${dockExecution ? 'is-running' : ''}`} aria-label="执行状态栏">
      <DevicePicker devices={devices} value={selectedDevice} onChange={onSelectDevice} />
      <button
        className="dock-status"
        aria-controls="run-panel"
        aria-expanded={runPanel === 'progress'}
        onClick={() => onTogglePanel('progress')}
      >
        {dockExecution ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          <span
            className={`status-dot ${!device || device.state === 'offline' ? 'offline' : ''}`}
          />
        )}
        <strong>
          {dockExecution ? '执行中' : device && device.state !== 'offline' ? '就绪' : '等待连接'}
        </strong>
        {(dockExecution || !isHome) && (
          <>
            <span className="dock-divider" />
            <span className="dock-message">
              {dockExecution
                ? localizeExecutionMessage(dockExecution.message)
                : selectedPlan?.name || pageLabel}
              <small>
                {dockExecution
                  ? `任务进度 ${dockExecution.progress}%`
                  : device?.name || '请连接模拟器或设备'}
              </small>
            </span>
          </>
        )}
      </button>
      <div className="dock-actions">
        <button
          aria-label="多开执行"
          className={runPanel === 'instances' ? 'selected' : ''}
          onClick={() => onTogglePanel('instances')}
        >
          <Layers size={16} />
          <span>多开执行{activeRunsCount > 1 ? ` · ${activeRunsCount}` : ''}</span>
        </button>
        {dockExecution && device?.state !== 'offline' && (
          <Button
            variant="danger"
            size="sm"
            className="dock-stop"
            disabled={stopDisabled}
            onClick={onStopDock}
          >
            <Square size={12} />
            <span>停止执行</span>
          </Button>
        )}
        <button
          aria-label="运行详情"
          aria-controls="run-panel"
          aria-expanded={runPanel === 'progress'}
          className={runPanel === 'progress' ? 'selected' : ''}
          onClick={() => onTogglePanel('progress')}
        >
          <ListChecks size={16} />
          <span>运行详情</span>
        </button>
        <button
          aria-label="日志"
          aria-controls="run-panel"
          aria-expanded={runPanel === 'logs'}
          className={runPanel === 'logs' ? 'selected' : ''}
          onClick={() => onTogglePanel('logs')}
        >
          <Terminal size={16} />
          <span>日志</span>
        </button>
        <button
          aria-label="画面"
          aria-controls="run-panel"
          aria-expanded={runPanel === 'preview'}
          className={runPanel === 'preview' ? 'selected' : ''}
          onClick={() => onTogglePanel('preview')}
        >
          <Monitor size={16} />
          <span>画面</span>
        </button>
        <IconButton
          className="dock-panel-toggle"
          label={runPanel ? '收起运行面板' : '展开运行面板'}
          onClick={() => {
            if (runPanel) onClosePanel();
            else onTogglePanel('progress');
          }}
        >
          {runPanel ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
        </IconButton>
      </div>
    </footer>
  );
}
