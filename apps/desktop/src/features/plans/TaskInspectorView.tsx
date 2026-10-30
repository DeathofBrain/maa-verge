import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  FileText,
  Info,
  ListChecks,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { taskLabels, type Device, type Plan, type RpcParams } from '@maaverge/contracts';
import TaskParameterField from '../../TaskParameterField';
import Button from '../../kit/Button';
import EmptyState from '../../kit/EmptyState';
import IconButton from '../../kit/IconButton';
import SearchField from '../../kit/SearchField';
import TextArea from '../../kit/TextArea';
import { fieldGroups, fields } from './task-fields';
import { type Draft, type Step } from './plan-draft';

type Props = {
  step: Step | undefined;
  draft: Draft;
  selected: number;
  plan: Plan | 'new';
  unsaved?: boolean;
  dirty: boolean;
  saving: boolean;
  starting: boolean;
  fieldSearch: string;
  setFieldSearch: (value: string) => void;
  validJson: boolean;
  advanced: Record<string, boolean>;
  setAdvanced: (updater: (previous: Record<string, boolean>) => Record<string, boolean>) => void;
  setJson: (value: string) => void;
  setParams: (updates: Record<string, unknown>) => void;
  taskClient: NonNullable<RpcParams<'stages.list'>['clientType']>;
  consumableSummary: string;
  syncDevice?: Device;
  contextDeviceId?: string;
  onOpenDeviceSettings?: (deviceId?: string) => void;
  onCopyCopilot?: (planId: string, taskIndex: number) => void;
  setMobileDetail: (value: boolean) => void;
  reorder: (from: number, to: number) => void;
  duplicateTask: (index: number) => void;
  deleteTask: (index: number) => void;
};

export default function TaskInspectorView({
  step,
  draft,
  selected,
  plan,
  unsaved,
  dirty,
  saving,
  starting,
  fieldSearch,
  setFieldSearch,
  validJson,
  advanced,
  setAdvanced,
  setJson,
  setParams,
  taskClient,
  consumableSummary,
  syncDevice,
  contextDeviceId,
  onOpenDeviceSettings,
  onCopyCopilot,
  setMobileDetail,
  reorder,
  duplicateTask,
  deleteTask,
}: Props) {
  return (
    <section className="wb-inspector" aria-label="单项任务设置">
      {step ? (
        <>
          <div className="wb-inspector-header">
            <div>
              <button className="wb-mobile-back" onClick={() => setMobileDetail(false)}>
                <ArrowLeft size={15} />
                任务列表
              </button>
              <h2>{taskLabels[step.task.type] || step.task.type}</h2>
              <p>第 {selected + 1} 条任务 · 独立设置</p>
            </div>
            <div className="wb-step-tools">
              <IconButton
                className="icon-button"
                label="上移任务"
                title="上移任务（Alt ↑）"
                disabled={selected === 0}
                onClick={() => reorder(selected, selected - 1)}
              >
                <ArrowUp size={16} />
              </IconButton>
              <IconButton
                className="icon-button"
                label="下移任务"
                title="下移任务（Alt ↓）"
                disabled={selected === draft.steps.length - 1}
                onClick={() => reorder(selected, selected + 1)}
              >
                <ArrowDown size={16} />
              </IconButton>
              <IconButton
                className="icon-button"
                label="复制任务"
                title="复制任务"
                disabled={draft.steps.length >= 30}
                onClick={() => duplicateTask(selected)}
              >
                <Copy size={16} />
              </IconButton>
              <IconButton
                className="icon-button danger-hover"
                label="删除任务"
                title="删除任务"
                onClick={() => deleteTask(selected)}
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          </div>
          <SearchField
            className="wb-field-search"
            aria-label="搜索当前任务设置"
            placeholder="查找当前任务设置"
            value={fieldSearch}
            onValueChange={setFieldSearch}
            clearLabel="清除任务设置搜索"
          />
          <fieldset className="wb-fieldset task-fields" disabled={!validJson}>
            {fieldGroups(step.task.type).map((group) => {
              const visible = group.fields.filter(
                (field) =>
                  (step.task.type !== 'Infrast' ||
                    !['filename', 'plan_index'].includes(field.key) ||
                    Number(step.task.params.mode) === 10000) &&
                  (!fieldSearch ||
                    `${field.label} ${field.key} ${field.hint || ''}`
                      .toLowerCase()
                      .includes(fieldSearch.toLowerCase())),
              );
              return (
                !!visible.length && (
                  <FieldSection
                    key={`${step.key}-${group.title}`}
                    title={group.title}
                    expanded={group.expanded || !!fieldSearch}
                    summary={`${group.fields.length} 项设置`}
                  >
                    <div className="wb-fields">
                      {visible.map((field) => (
                        <TaskParameterField
                          key={step.key + field.key}
                          field={field}
                          params={step.task.params}
                          onChange={setParams}
                          clientType={taskClient}
                        />
                      ))}
                    </div>
                    {group.title === '消耗上限' && (
                      <p className="wb-helper">
                        <ShieldCheck size={14} />
                        {consumableSummary}
                      </p>
                    )}
                  </FieldSection>
                )
              );
            })}
          </fieldset>
          {fieldSearch &&
            !fields[step.task.type]?.some((field) =>
              `${field.label} ${field.key} ${field.hint || ''}`
                .toLowerCase()
                .includes(fieldSearch.toLowerCase()),
            ) && <p className="wb-helper">没有匹配的表单项，可清除搜索或检查高级参数。</p>}
          {!validJson && (
            <p role="alert" className="wb-inline-error">
              请先修正高级参数中的 JSON，再使用表单。
            </p>
          )}
          {['Copilot', 'SSSCopilot', 'ParadoxCopilot'].includes(step.task.type) && (
            <div className="wb-task-help">
              <Info size={17} />
              <div>
                <p>此旧任务继续兼容。新作业请在作业中心管理，复制不会删除或修改原任务。</p>
                {plan !== 'new' && !unsaved && onCopyCopilot && (
                  <Button
                    className="button"
                    disabled={dirty || saving || starting}
                    title={dirty ? '等待自动保存完成后复制' : undefined}
                    onClick={() => onCopyCopilot(draft.id, selected)}
                  >
                    复制到作业库
                  </Button>
                )}
              </div>
            </div>
          )}
          {step.task.type === 'OperProgress' && (
            <div className="wb-task-help">
              <Info size={17} />
              <p>
                干员养成会执行精英化、技能升级与专精并消耗材料。在高级参数的 plans
                数组填写目标，执行前逐项核对。
              </p>
            </div>
          )}
          {!fields[step.task.type]?.length && step.task.type !== 'OperProgress' && (
            <div className="wb-task-help">
              <FileText size={17} />
              <p>识别使用核心默认参数。结果可在运行事件中查看；专用结果与导出仍待接入。</p>
            </div>
          )}
          {step.task.type === 'Recruit' && (
            <p className="wb-helper">
              次数为 0 时仅识别标签。当前核心无法保证加急次数上限，加急请求会被策略拒绝。
            </p>
          )}
          {step.task.type === 'StartUp' && (
            <FieldSection
              key={`${step.key}-connection`}
              title="执行设备"
              expanded
              summary={syncDevice?.name || '尚未选择设备'}
            >
              <p className="wb-helper">
                {draft.deviceIds.length
                  ? `本表绑定 ${draft.deviceIds.length} 台设备，当前查看：${syncDevice?.name || '设备暂不可用'}`
                  : `使用底栏所选设备：${syncDevice?.name || '尚未选择'}`}
                {syncDevice ? `（${syncDevice.address}）` : ''}
              </p>
              <p className="wb-helper">
                开始唤醒负责启动游戏与切换账号。请先在模拟器中启动实例并连接设备；ADB、触控与截图统一在设备页配置。
              </p>
              {onOpenDeviceSettings && (
                <Button className="button" onClick={() => onOpenDeviceSettings(contextDeviceId)}>
                  管理设备连接
                </Button>
              )}
            </FieldSection>
          )}
          {step.task.type === 'Mall' && (
            <p className="wb-helper">
              会客室信息板收取信用、线索交流与赠送线索，请在「基建换班 → 信用与线索」中设置。
            </p>
          )}
          {step.task.type === 'UserDataUpdate' && (
            <div className="wb-sync-times" aria-label="数据同步状态">
              <span>设备：{syncDevice?.name || '请绑定或选择设备'}</span>
              <span>
                干员上次同步：
                {syncDevice?.dataSync?.operatorsAt
                  ? new Date(syncDevice.dataSync.operatorsAt).toLocaleString('zh-CN')
                  : '暂无成功记录'}
              </span>
              <span>
                仓库上次同步：
                {syncDevice?.dataSync?.depotAt
                  ? new Date(syncDevice.dataSync.depotAt).toLocaleString('zh-CN')
                  : '暂无成功记录'}
              </span>
              <span>
                按游戏客户端时区在凌晨 4 点换日，周一换周；已成功同步的项目在本周期内跳过。
              </span>
            </div>
          )}
          {step.task.type === 'SingleStep' && (
            <p className="wb-helper">
              在高级参数的 details 配置动作；战斗动作使用 details.actions 数组，完成后仍需观察验证。
            </p>
          )}
          <details
            className="wb-advanced advanced-params"
            open={advanced[step.key] || !validJson}
            onToggle={(event) => {
              const open = event.currentTarget.open;
              setAdvanced((previous) =>
                previous[step.key] === open ? previous : { ...previous, [step.key]: open },
              );
            }}
          >
            <summary>
              高级参数 <span>完整 MaaCore JSON</span>
            </summary>
            <p>补充未列出的上游字段；保存时完整保留，并校验参数和消耗。</p>
            <label className="field-label" htmlFor="task-json">
              任务参数 JSON
            </label>
            <TextArea
              id="task-json"
              spellCheck={false}
              value={step.json}
              onChange={(event) => setJson(event.target.value)}
            />
          </details>
          <p className="wb-inspector-footnote">修改后自动保存，用于下次执行。</p>
        </>
      ) : (
        <EmptyState
          className="wb-empty"
          icon={<ListChecks size={30} />}
          title="添加第一条任务"
          text="从任务目录选择要执行的能力。"
        />
      )}
    </section>
  );
}

function FieldSection({
  title,
  expanded,
  summary,
  children,
}: {
  title: string;
  expanded: boolean;
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(expanded);
  useEffect(() => {
    if (expanded) setOpen(true);
  }, [expanded]);
  return (
    <details
      className="wb-field-section"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>{title}</span>
        <small>{!open && summary}</small>
      </summary>
      {children}
    </details>
  );
}
