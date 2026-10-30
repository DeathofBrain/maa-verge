import type { Device, Run, RunTask, ToolJobSummary, UpdateChannel } from '@maaverge/contracts';
import type { StatusTone } from './StatusPill';

/** 执行状态文案。此前在 App、TasksPage、ExecutionMonitor、ExecutionPage、HomeDashboard 各存一份，取值完全一致。 */
export const runStatusLabels: Record<Run['status'], string> = {
  running: '执行中',
  completed: '已完成',
  failed: '执行失败',
  stopped: '已停止',
};

/** 执行状态对应的胶囊色。 */
export const runStatusTones: Record<Run['status'], StatusTone> = {
  running: 'running',
  completed: 'success',
  failed: 'danger',
  stopped: 'neutral',
};

/** 执行内单个任务的状态文案，比执行状态多出「未执行」与「已跳过」。 */
export const runTaskStatusLabels: Record<RunTask['status'], string> = {
  waiting: '未执行',
  running: '执行中',
  completed: '已完成',
  failed: '执行失败',
  stopped: '已停止',
  skipped: '已跳过',
};

/** 执行内任务状态对应的胶囊色。 */
export const runTaskStatusTones: Record<RunTask['status'], StatusTone> = {
  waiting: 'neutral',
  running: 'running',
  completed: 'success',
  failed: 'danger',
  stopped: 'neutral',
  skipped: 'neutral',
};

/** 工具作业类型文案。 */
export const toolKindLabels: Record<ToolJobSummary['kind'], string> = {
  depot: '仓库识别',
  operators: '干员识别',
  recruit: '公招计算',
  inventory: '库存保持',
  data: '数据管理',
  games: '小游戏',
};

/** 设备选择列表的状态文案；`missing` 是 UI 侧扩展值，表示计划引用的设备已不在快照中。 */
export const deviceSelectionStateLabels: Record<Device['state'] | 'missing', string> = {
  idle: '空闲',
  running: '执行中',
  offline: '离线',
  missing: '未发现',
};

/** 更新渠道名称。 */
export const updateChannelLabels: Record<UpdateChannel['id'], string> = {
  app: 'Maa Verge 应用',
  core: 'MaaCore 核心',
  resource: '游戏资源',
};

// 与 updateStatusShortLabels 取值不同且都未被测试耦合；文案归一待产品确认，不得静默合并。
/** 设置页「更新」分类的渠道状态文案（完整表述）。 */
export const updateStatusLabels: Record<UpdateChannel['status'], string> = {
  idle: '等待检查',
  checking: '正在检查',
  available: '发现新版本',
  downloading: '正在准备',
  staged: '已验证，待生效',
  waiting_idle: '等待空闲生效',
  active: '已更新',
  failed: '更新失败',
};

/** 主页仪表盘更新卡片的渠道状态文案（短语，适配窄卡片）。 */
export const updateStatusShortLabels: Record<UpdateChannel['status'], string> = {
  idle: '未检查',
  checking: '检查中',
  available: '有更新',
  downloading: '准备中',
  staged: '待生效',
  waiting_idle: '等待空闲',
  active: '已更新',
  failed: '更新失败',
};
