import Select from './Select';
import { runDisplayName } from './run-source';
import { useContextMenu } from './ContextMenu';
import { useState } from 'react';
import { Monitor, Play, Square } from 'lucide-react';
import {
  localizeExecutionMessage,
  planAllowsDevice,
  planDeviceIds,
  type Device,
  type Plan,
  type Run,
} from '@maaverge/contracts';
import Button from './kit/Button';
import './multi-run.css';

export default function MultiRunPanel({
  devices,
  plans,
  runs,
  pending,
  onStart,
  onStop,
  onInspect,
  onConnect,
}: {
  devices: Device[];
  plans: Plan[];
  runs: Run[];
  pending: Set<string>;
  onStart: (plan: Plan, deviceId: string) => Promise<boolean>;
  onStop: (run: Run) => Promise<boolean>;
  onInspect: (run: Run) => void;
  onConnect: () => void;
}) {
  const contextMenu = useContextMenu();
  const [selectedPlans, setSelectedPlans] = useState<Record<string, string>>({});
  return (
    <section className="multi-run-panel" aria-label="多开执行面板">
      <div className="multi-run-heading">
        <div>
          <h2>多开执行</h2>
          <p>
            每个实例独立执行与停止。一张任务表可在多个绑定设备上运行，每个设备也可选择不同任务表。
          </p>
        </div>
        <Button onClick={onConnect}>管理模拟器实例</Button>
      </div>
      {!devices.length ? (
        <p>请先在设备页添加并连接模拟器实例。</p>
      ) : (
        <div className="multi-run-grid">
          {devices.map((device) => {
            const run = runs.find(
              (item) => item.deviceId === device.id && item.status === 'running',
            );
            const lastRun = runs.find((item) => item.deviceId === device.id);
            const choices = plans.filter((plan) => planAllowsDevice(plan, device.id));
            const selected =
              choices.find((plan) => plan.id === selectedPlans[device.id]) ||
              choices.find((plan) => planDeviceIds(plan).includes(device.id)) ||
              choices[0];
            return (
              <article
                className="multi-run-card"
                key={device.id}
                {...contextMenu('实例执行菜单', [
                  {
                    label: '开始执行',
                    disabled:
                      !!run ||
                      !selected ||
                      device.state !== 'idle' ||
                      pending.has(`start-plan-${device.id}`),
                    action: () => {
                      if (selected) void onStart(selected, device.id);
                    },
                  },
                  {
                    label: '查看执行详情',
                    disabled: !lastRun,
                    action: () => {
                      if (run || lastRun) onInspect((run || lastRun)!);
                    },
                  },
                  {
                    label: '停止执行',
                    danger: true,
                    disabled: !run || pending.has(`stop-${run?.id}`),
                    action: () => {
                      if (run) void onStop(run);
                    },
                  },
                  { label: '管理模拟器实例', action: onConnect },
                ])}
                aria-label={`模拟器实例 ${device.name}`}
              >
                <header>
                  <Monitor size={17} />
                  <div>
                    <h3>{device.name}</h3>
                    <small>{device.address}</small>
                  </div>
                  <span className={`pill ${run ? 'running' : ''}`}>
                    {run ? '执行中' : device.state === 'offline' ? '离线' : '就绪'}
                  </span>
                </header>
                {run ? (
                  <>
                    <strong>{runDisplayName(run, plans)}</strong>
                    <p>{localizeExecutionMessage(run.message)}</p>
                    <progress
                      aria-label={`${device.name}执行进度`}
                      max={100}
                      value={run.progress}
                    />
                    <div className="multi-run-actions">
                      <Button className="multi-run-action" onClick={() => onInspect(run)}>
                        查看此实例
                      </Button>
                      <Button
                        className="multi-run-action"
                        variant="danger"
                        disabled={pending.has(`stop-${run.id}`)}
                        aria-label={`停止实例 ${device.name}`}
                        onClick={() => void onStop(run)}
                      >
                        <Square size={13} />
                        停止此实例
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="field-label" htmlFor={`instance-plan-${device.id}`}>
                      任务表
                    </label>
                    <Select
                      id={`instance-plan-${device.id}`}
                      className="text-input"
                      aria-label={`${device.name}使用的任务表`}
                      value={selected?.id || ''}
                      onChange={(event) =>
                        setSelectedPlans((previous) => ({
                          ...previous,
                          [device.id]: event.target.value,
                        }))
                      }
                    >
                      {!choices.length && <option value="">没有可用任务表</option>}
                      {choices.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                          {planDeviceIds(plan).includes(device.id) ? ' · 已绑定' : ''}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="primary"
                      aria-label={`启动实例 ${device.name}`}
                      disabled={
                        !selected ||
                        device.state !== 'idle' ||
                        pending.has(`start-plan-${device.id}`)
                      }
                      onClick={() => selected && void onStart(selected, device.id)}
                    >
                      <Play size={13} />
                      {device.state === 'offline' ? '请先连接实例' : '在此实例执行'}
                    </Button>
                    {lastRun && (
                      <p>
                        <Button variant="text" onClick={() => onInspect(lastRun)}>
                          查看上次执行
                        </Button>
                        ：{localizeExecutionMessage(lastRun.message)}
                      </p>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
      <p className="multi-run-note">
        消耗上限按每次执行分别检查；同一实例同时只允许一个控制者。修改任务表不改变已经启动的执行快照。
      </p>
    </section>
  );
}
