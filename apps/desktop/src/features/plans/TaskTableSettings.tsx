import { FileText, RotateCcw, ShieldCheck } from 'lucide-react';
import type { Device, Plan } from '@maaverge/contracts';
import DeviceSelectionList from '../../DeviceSelectionList';
import type { Draft } from './plan-draft';

type Props = {
  draft: Draft;
  devices: Device[];
  patch: (changes: Partial<Draft>) => void;
  consumableSummary: string;
  plan: Plan | 'new';
  dirty: boolean;
  onExport: () => void;
  onRevert: () => void;
};

export default function TaskTableSettings({
  draft,
  devices,
  patch,
  consumableSummary,
  plan,
  dirty,
  onExport,
  onRevert,
}: Props) {
  return (
    <div
      className="wb-table-settings"
      id="wb-panel-settings"
      role="tabpanel"
      aria-labelledby="wb-tab-settings"
    >
      <div className="wb-settings-index">
        <a href="#wb-basic">基本信息</a>
        <a href="#wb-device">设备绑定</a>
        <a href="#wb-consumption">消耗汇总</a>
        <a href="#wb-manage">任务表管理</a>
      </div>
      <div className="wb-settings-form">
        <section id="wb-basic">
          <h2>基本信息</h2>
          <div className="wb-fields">
            <label className="param-field">
              <span className="field-label">任务表名称</span>
              <input
                className="text-input"
                aria-label="任务表名称"
                maxLength={80}
                placeholder="例如：晚间日常"
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </label>
            <label className="param-field wide">
              <span className="field-label">说明</span>
              <textarea
                className="text-input wb-description"
                aria-label="任务表说明"
                maxLength={500}
                placeholder="记录这张表的用途"
                value={draft.description}
                onChange={(event) => patch({ description: event.target.value })}
              />
            </label>
          </div>
        </section>
        <section id="wb-device">
          <h2>设备绑定</h2>
          <DeviceSelectionList
            ariaLabel="绑定设备"
            items={[
              ...devices,
              ...draft.deviceIds
                .filter((id) => !devices.some((device) => device.id === id))
                .map((id) => ({ id, name: id, state: 'missing' as const })),
            ]}
            selectedIds={draft.deviceIds}
            selectedLabel="已绑定"
            checkboxLabel={(device) => `绑定设备${device.name}`}
            maxSelected={100}
            emptyMessage="暂无设备，请先在设备页添加。"
            onChange={(deviceIds) => patch({ deviceIds })}
          />
          {draft.deviceIds.length > 0 && (
            <div className="wb-device-actions">
              <button
                className="button secondary"
                type="button"
                onClick={() => patch({ deviceIds: [] })}
              >
                解除全部绑定
              </button>
            </div>
          )}
          <p className="wb-helper">
            一张任务表可绑定多台设备，一台设备也可绑定多张任务表；绑定不占用设备。运行时可选择绑定设备，未绑定时可临时选择任意设备，同一设备同时只执行一项操作。切换底栏设备不会改写绑定。
          </p>
          <p className="wb-helper">
            所有绑定设备共用本表的任务、游戏客户端和账号设置；每台设备独立计算本次执行的消耗上限。需要不同配置时请复制任务表。
          </p>
        </section>
        <section id="wb-consumption">
          <h2>消耗汇总</h2>
          <p className="wb-helper">
            <ShieldCheck size={14} />
            {consumableSummary}
          </p>
          <p className="wb-helper">
            上限由本表已启用的自动作战任务分别设置，停用的任务不计入。请在任务编排中调整各项理智药与源石上限；默认均为
            0。
          </p>
        </section>
        <section id="wb-manage">
          <h2>任务表管理</h2>
          <div className="wb-management-actions">
            <button className="button secondary" onClick={onExport}>
              <FileText size={15} />
              导出任务表
            </button>
            <button className="button secondary" disabled={!dirty} onClick={onRevert}>
              <RotateCcw size={15} />
              {plan === 'new' ? '恢复初始配置' : '恢复已保存配置'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
