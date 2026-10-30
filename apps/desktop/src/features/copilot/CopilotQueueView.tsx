import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Info,
  ListOrdered,
  LoaderCircle,
  Play,
  X,
} from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import {
  type CopilotKind,
  type CopilotOptions,
  type CopilotRecord,
  type CopilotWorkspace,
  type RpcResult,
  type Snapshot,
} from '@maaverge/contracts';
import type { MenuItem } from '../../kit/ContextMenu';
import Button from '../../kit/Button';
import IconButton from '../../kit/IconButton';
import Select from '../../kit/Select';
import CopilotSelectAll from '../../CopilotSelectAll';
import CopilotSettings from './CopilotSettingsView';

type ContextMenuBinding = {
  onContextMenu: (event: MouseEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

type Props = {
  kinds: readonly { value: CopilotKind; label: string; short: string }[];
  kind: CopilotKind;
  importing: boolean;
  setKind: (kind: CopilotKind) => void;
  enabledCount: number;
  workspace?: CopilotWorkspace;
  edit: (update: (value: CopilotWorkspace) => CopilotWorkspace) => void;
  changeQueueSelection: (checked: boolean, id?: string) => void;
  savingImport: boolean;
  showLibrary: (source?: 'local' | 'community') => void;
  queueRecords: Record<string, CopilotRecord | null>;
  contextMenu: (label: string, items: MenuItem[]) => ContextMenuBinding;
  move: (id: string, delta: number) => void;
  addRecords: (records: CopilotRecord[]) => void;
  remove: (id: string) => void;
  openRecord: (record: CopilotRecord, origin?: 'library' | 'preview') => void;
  usesNavigation: boolean;
  queueChange: (id: string, patch: Partial<CopilotWorkspace['queue'][number]>) => void;
  options: (patch: Partial<CopilotOptions>) => void;
  saveState: string;
  saveError: string;
  flush: () => Promise<void>;
  selectedDevice: string;
  onSelectDevice: (id: string) => void;
  snapshot: Snapshot;
  checking: boolean;
  availability?: {
    deviceId: string;
    result?: RpcResult<'device.availability'>;
    error?: string;
  };
  onViewRun?: (id: string) => void;
  startingHint: string;
  disabledReason: string;
  starting: boolean;
  start: () => Promise<void>;
};

export default function CopilotQueueView({
  kinds,
  kind,
  importing,
  setKind,
  enabledCount,
  workspace,
  edit,
  changeQueueSelection,
  savingImport,
  showLibrary,
  queueRecords,
  contextMenu,
  move,
  addRecords,
  remove,
  openRecord,
  usesNavigation,
  queueChange,
  options,
  saveState,
  saveError,
  flush,
  selectedDevice,
  onSelectDevice,
  snapshot,
  checking,
  availability,
  onViewRun,
  startingHint,
  disabledReason,
  starting,
  start,
}: Props) {
  const kindLabel = kinds.find((item) => item.value === kind)?.label ?? kind;
  return (
    <section className="cp-queue sp-section" aria-label="作业执行队列">
      <div className="cp-queue-heading">
        <h2>
          <ListOrdered size={17} />
          执行队列
        </h2>
        <div className="cp-type-bar" role="tablist" aria-label="队列类型">
          {kinds.map((item) => (
            <button
              key={item.value}
              role="tab"
              aria-selected={kind === item.value}
              className={kind === item.value ? 'is-selected' : ''}
              disabled={importing}
              onClick={() => setKind(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="cp-queue-editor">
        <header>
          <div>
            <h2>
              {kindLabel}队列{' '}
              <span>
                {enabledCount} / {workspace?.queue.length ?? 0}
              </span>
            </h2>
            <p>每项独立排序，可重复添加；修改只影响下次执行。</p>
          </div>
          <Button
            variant="text"
            aria-label="清除未勾选项"
            disabled={!workspace?.queue.some((entry) => !entry.enabled)}
            onClick={() =>
              edit((value) => ({
                ...value,
                queue: value.queue.filter((entry) => entry.enabled),
              }))
            }
          >
            清除未选
          </Button>
        </header>
        <div className="cp-preview-selection">
          <CopilotSelectAll
            label="全选执行队列"
            total={workspace?.queue.length ?? 0}
            selected={enabledCount}
            onChange={changeQueueSelection}
          />
        </div>
        {!workspace ? (
          <p role="status">正在读取队列…</p>
        ) : !workspace.queue.length ? (
          <div className="cp-queue-empty">
            <ListOrdered size={26} />
            <strong>还没有待执行的作业</strong>
            <p>
              先在左侧查看作业和干员要求，
              <br />
              再加入这里，按顺序执行。
            </p>
            <Button
              variant="text"
              icon={<ArrowRight size={14} />}
              disabled={savingImport}
              onClick={() => showLibrary('community')}
            >
              去社区找作业
            </Button>
          </div>
        ) : (
          <ol className="cp-queue-list">
            {workspace.queue.map((entry, index) => {
              const record = queueRecords[entry.versionId];
              return (
                <li
                  key={entry.id}
                  className={!entry.enabled ? 'is-disabled' : ''}
                  tabIndex={0}
                  {...contextMenu('队列条目菜单', [
                    {
                      label: entry.enabled ? '取消勾选' : '勾选执行',
                      action: () => changeQueueSelection(!entry.enabled, entry.id),
                    },
                    {
                      label: '上移',
                      action: () => move(entry.id, -1),
                      disabled: index === 0,
                    },
                    {
                      label: '下移',
                      action: () => move(entry.id, 1),
                      disabled: index === workspace.queue.length - 1,
                    },
                    {
                      label: '重复添加',
                      action: () => record && addRecords([record]),
                      disabled: !record || kind === 'SSSCopilot',
                    },
                    { label: '移除条目', action: () => remove(entry.id), danger: true },
                  ])}
                >
                  <div className="cp-queue-row">
                    <input
                      type="checkbox"
                      aria-label={`执行队列 ${index + 1}`}
                      checked={entry.enabled}
                      onChange={(event) => changeQueueSelection(event.target.checked, entry.id)}
                    />
                    <span className="cp-sequence">{String(index + 1).padStart(2, '0')}</span>
                    <button
                      className="cp-queue-title"
                      disabled={!record}
                      onClick={() => record && openRecord(record)}
                    >
                      <strong>
                        {record?.title ?? (record === null ? '作业版本不可用' : '正在读取作业…')}
                      </strong>
                      <small>{record?.stageName || entry.versionId.slice(0, 12)}</small>
                    </button>
                    <div className="cp-queue-actions">
                      <IconButton
                        label={`上移作业 ${index + 1}`}
                        disabled={index === 0}
                        onClick={() => move(entry.id, -1)}
                      >
                        <ArrowUp size={14} />
                      </IconButton>
                      <IconButton
                        label={`下移作业 ${index + 1}`}
                        disabled={index === workspace.queue.length - 1}
                        onClick={() => move(entry.id, 1)}
                      >
                        <ArrowDown size={14} />
                      </IconButton>
                      <IconButton label={`移除作业 ${index + 1}`} onClick={() => remove(entry.id)}>
                        <X size={15} />
                      </IconButton>
                    </div>
                  </div>
                  {usesNavigation && (
                    <div className="cp-entry-options">
                      {
                        <label>
                          <input
                            type="checkbox"
                            checked={entry.isRaid}
                            onChange={(event) =>
                              queueChange(entry.id, { isRaid: event.target.checked })
                            }
                          />
                          突袭
                        </label>
                      }
                      {
                        <label>
                          导航关卡
                          <input
                            className="text-input"
                            aria-label={`导航关卡 ${index + 1}`}
                            value={entry.navName}
                            onChange={(event) =>
                              queueChange(entry.id, { navName: event.target.value })
                            }
                            placeholder="沿用作业关卡"
                            maxLength={200}
                          />
                        </label>
                      }
                    </div>
                  )}
                  {record && record.compatibility.status !== 'ready' && (
                    <p className="cp-error-text">{record.compatibility.reasons.join('；')}</p>
                  )}
                  {record === null && (
                    <p className="cp-error-text">请移除或取消勾选此项后再执行。</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {workspace && (
          <>
            <CopilotSettings
              kind={kind}
              count={enabledCount}
              options={workspace.options}
              change={options}
            />
            <div className="cp-save-state" role="status">
              {saveState}
              {saveError && (
                <>
                  <span className="cp-error-text">{saveError}</span>
                  <Button variant="text" onClick={() => void flush().catch(() => {})}>
                    重试保存
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
      <div className="cp-launch">
        <label className="cp-field">
          目标设备
          <Select
            className="text-input"
            aria-label="作业目标设备"
            value={selectedDevice}
            onChange={(event) => onSelectDevice(event.target.value)}
          >
            <option value="">请选择空闲设备</option>
            {snapshot.devices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ·{' '}
                {item.state === 'offline' ? '离线' : item.state === 'running' ? '执行中' : '已连接'}
              </option>
            ))}
          </Select>
        </label>
        <div className="cp-device-status" role="status">
          {checking && <LoaderCircle size={14} className="spin" />}
          <span>
            {selectedDevice
              ? (availability?.error ?? availability?.result?.reason ?? '正在检查设备…')
              : '浏览和导入无需连接设备'}
          </span>
          {availability?.result?.ownerId &&
            onViewRun &&
            snapshot.runs.some((item) => item.id === availability.result?.ownerId) && (
              <Button variant="text" onClick={() => onViewRun(availability.result!.ownerId!)}>
                查看占用
              </Button>
            )}
        </div>
        <p className="cp-start-hint">
          <Info size={15} />
          {startingHint}
        </p>
        {kind === 'Copilot' && (
          <details className="cp-game-help">
            <summary>游戏内准备与说明</summary>
            <p className="sp-help">
              队列在当前区域内按关卡导航，不支持跨区域；普通与突袭由队列条目选择。单份循环、演习请在游戏内选好关卡与模式。助战限制以核心反馈为准，不使用理智药或源石。
            </p>
          </details>
        )}
        <Button
          className="cp-start"
          variant="primary"
          icon={<Play size={16} />}
          busy={starting}
          disabled={!!disabledReason || starting}
          title={disabledReason || '使用已保存的队列与选项开始执行'}
          onClick={() => void start()}
        >
          开始作业
        </Button>
        {disabledReason && <p className="sp-help">{disabledReason}</p>}
      </div>
    </section>
  );
}
