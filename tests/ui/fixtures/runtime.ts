import { createCopilotFixture } from './copilot';
// Deterministic runtime fixture. Loaded only by the Playwright Tauri bridge.
import type {
  Device,
  Event,
  Plan,
  Run,
  RunArtifact,
  Settings,
  Snapshot,
  UpdateChannel,
} from '../../../packages/contracts/src/types';
import { taskLabels } from '../../../packages/contracts/src/tasks';
import { taskEnabled, validatePlan } from '../../../packages/contracts/src/task-policy';
import { matchingDeviceProfile } from '../../../packages/contracts/src/device-profiles';
import { mockPreviewImage } from '../../fixtures/preview-image';
import { stagePresets } from '../../../packages/contracts/src/stages';
import {
  validateDeviceClickParams,
  validateDeviceFrameParams,
} from '../../../packages/contracts/src/validators.js';
import { homeInfo } from '../../../services/backend/src/home-info';
import type { RpcResult } from '../../../packages/contracts/src/index';

const workspace =
  (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_WORKSPACE_ID ||
  'browser';
const key = 'maaverge:test-runtime:v1:' + workspace;
const recognitionKey = 'maaverge:test-recognition:v1:' + workspace;
type Recognition = {
  deviceId: string;
  kind: 'depot' | 'operators';
  clientType: string;
  collectedAt: string | null;
  runId: string | null;
  items: { id: string; name: string; quantity: number }[];
  operators: {
    id: string;
    name: string;
    own: boolean;
    elite: number;
    level: number;
    potential: number;
    rarity: number;
  }[];
};
function restoreRecognition(): Recognition[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(recognitionKey) || '[]');
    return Array.isArray(value) ? (value as Recognition[]) : [];
  } catch {
    return [];
  }
}
let recognition = restoreRecognition();
const listeners = new Set<(event: Event) => void>();
const executionTasks = new Map<string, Plan['tasks']>();
const requestRuns = new Map<string, string>();
const updateGenerations: Record<UpdateChannel['id'], number> = { app: 0, core: 0, resource: 0 };
const previewFrames = new Map<
  string,
  { deviceId: string; captured: number; canControl: boolean }
>();
const previewClicks = new Map<
  string,
  { signature: string; time: number; promise: Promise<{ accepted: true }> }
>();
function invalidatePreview(deviceId: string) {
  for (const [id, frame] of previewFrames)
    if (frame.deviceId === deviceId) previewFrames.delete(id);
}
const now = () => new Date().toISOString();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const defaults = (): Snapshot => ({
  mode: 'native',
  devices: [
    {
      id: 'mock-device-1',
      name: '本地模拟设备',
      address: '127.0.0.1:5555',
      state: 'idle',
      coreVersion: 'v6.19.0',
      resourceVersion: '2026-10-18',
    },
  ],
  plans: [
    {
      id: 'daily',
      name: '每日长草计划',
      description: '',
      deviceId: null,
      group: 'daily',
      budgets: null,
      enabled: true,
      schedule: null,
      tasks: [
        { enabled: true, type: 'StartUp', params: { client_type: 'Official' } },
        { enabled: true, type: 'Recruit', params: {} },
        { enabled: true, type: 'Infrast', params: {} },
        { enabled: true, type: 'Mall', params: {} },
        { enabled: true, type: 'Award', params: {} },
      ],
    },
    {
      id: 'farm-1-7',
      name: '固源岩补给',
      description: '',
      deviceId: null,
      group: 'daily',
      budgets: null,
      enabled: true,
      schedule: null,
      tasks: [
        { enabled: true, type: 'Fight', params: { stage: '1-7', times: 6, medicine: 0, stone: 0 } },
      ],
    },
  ],
  runs: [],
  updates: [
    {
      id: 'app',
      currentVersion: '0.1.0',
      latestVersion: null,
      status: 'idle',
      progress: 0,
      appCanInstall: true,
      message: '合成应用版本，未访问更新源',
    },
    {
      id: 'core',
      currentVersion: 'v6.19.0',
      latestVersion: null,
      status: 'idle',
      progress: 0,
      message: '演示核心版本，未加载原生库',
    },
    {
      id: 'resource',
      currentVersion: '2026-10-18',
      latestVersion: null,
      status: 'idle',
      progress: 0,
      message: '演示资源快照，不访问网络',
    },
  ],
  settings: {
    autoConnect: true,
    autoUpdateApp: true,
    appUpdateChannel: 'preview',
    coreUpdateChannel: 'stable',
    autoUpdateCore: true,
    autoUpdateResource: true,
    minimizeToTray: true,
    theme: 'system',
    logRetentionDays: 7,
    budgets: { originium: 0, medicine: 0, expedited: 0 },
    model: { provider: 'none', baseUrl: '', model: '' },
    capture: { method: 'adb', emulatorPath: '', instanceIndex: 0 },
  },
  events: [],
});

function normalizePlan(plan: Plan): Plan {
  if (plan.description === undefined) plan.description = '';
  plan.deviceId ??= null;
  if (plan.group === undefined) plan.group = 'daily';
  plan.budgets ??= null;
  if (plan.enabled === undefined) plan.enabled = true;
  if (plan.schedule === undefined) plan.schedule = null;
  if (plan.budgets && typeof plan.budgets === 'object' && !Array.isArray(plan.budgets)) {
    plan.budgets = Object.assign({ originium: 0, medicine: 0, expedited: 0 }, plan.budgets);
  }
  plan.tasks.forEach((task) => {
    if (task.enabled === undefined) task.enabled = true;
    if (task.params === undefined) task.params = {};
  });
  return plan;
}

function restore(): Snapshot {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults();
    const state = JSON.parse(raw) as Snapshot;
    if (state.mode !== 'native' || !state.settings?.budgets || !Array.isArray(state.updates))
      return defaults();
    state.settings = { ...defaults().settings, ...state.settings };
    state.plans.forEach(normalizePlan);
    for (const run of state.runs) {
      if (run.status === 'running') {
        run.status = 'failed';
        run.message = '页面重启，模拟执行已中断，未自动重放';
        run.finishedAt = now();
      }
    }
    state.devices.forEach((device) => {
      if (device.state === 'running') device.state = 'idle';
    });
    return state;
  } catch {
    return defaults();
  }
}

let state = restore();
type ToolJob = RpcResult<'tool.get'>;
type ToolConfig = RpcResult<'tool.config.get'>;
type Schedule = RpcResult<'schedule.save'>;
const toolKey = 'maaverge:test-tools:v1:' + workspace;
const toolData: { jobs: ToolJob[]; configs: Record<string, ToolConfig>; schedules: Schedule[] } =
  (() => {
    try {
      return (
        JSON.parse(localStorage.getItem(toolKey) || 'null') ?? {
          jobs: [],
          configs: {},
          schedules: [],
        }
      );
    } catch {
      return { jobs: [], configs: {}, schedules: [] };
    }
  })();
for (const job of toolData.jobs)
  if (job.status === 'running') {
    job.status = 'failed';
    job.message = '合成页面重启中断';
  }
const toolRequests = new Map<string, ToolJob>();
const overrides = new Map<string, string>();
function fixtureAvailability(deviceId: string) {
  const device = state.devices.find((item) => item.id === deviceId);
  if (!device) throw new Error('设备不存在');
  const tool = toolData.jobs.find(
    (item) => item.deviceId === deviceId && item.status === 'running',
  );
  const run = state.runs.find((item) => item.deviceId === deviceId && item.status === 'running');
  const owner = tool ? 'tool' : run ? 'run' : 'none';
  return {
    deviceId,
    connected: device.state !== 'offline',
    available: device.state === 'idle' && owner === 'none',
    owner,
    ownerId: tool?.id ?? run?.id ?? null,
    reason: tool
      ? '设备正在执行工具，请等待整个操作结束'
      : run
        ? '设备正在执行任务表，请等待整个操作结束'
        : device.state === 'idle'
          ? '设备空闲，可以使用工具'
          : '设备尚未连接',
  };
}
let sequence = Math.max(0, ...state.events.map((event) => Number(event.id) || 0));
function persist() {
  localStorage.setItem(key, JSON.stringify(state));
  localStorage.setItem(recognitionKey, JSON.stringify(recognition));
  localStorage.setItem(toolKey, JSON.stringify(toolData));
}
function collectRecognition(
  run: Pick<Run, 'id' | 'deviceId'>,
  task: Plan['tasks'][number],
  tasks: Plan['tasks'],
) {
  const clientType = String(
    task.params.client_type ||
      tasks.find((item) => item.type === 'StartUp')?.params.client_type ||
      'Official',
  );
  const kinds: Recognition['kind'][] =
    task.type === 'Depot'
      ? ['depot']
      : task.type === 'OperBox'
        ? ['operators']
        : task.type === 'UserDataUpdate'
          ? [
              ...(task.params.depot !== false ? ['depot' as const] : []),
              ...(task.params.operators !== false ? ['operators' as const] : []),
            ]
          : [];
  for (const kind of kinds) {
    const result: Recognition = {
      deviceId: run.deviceId,
      kind,
      clientType,
      collectedAt: now(),
      runId: run.id,
      items:
        kind === 'depot'
          ? [
              { id: '30012', name: '固源岩', quantity: 42 },
              { id: '30013', name: '固源岩组', quantity: 7 },
              { id: 'fixture-no-icon', name: '合成无图材料', quantity: 3 },
            ]
          : [],
      operators:
        kind === 'operators'
          ? [
              {
                id: 'char_002_amiya',
                name: '阿米娅',
                own: true,
                elite: 2,
                level: 80,
                potential: 6,
                rarity: 5,
              },
              {
                id: 'char_103_angel',
                name: '能天使',
                own: true,
                elite: 2,
                level: 90,
                potential: 1,
                rarity: 6,
              },
            ]
          : [],
    };
    recognition = recognition.filter(
      (item) =>
        item.deviceId !== result.deviceId || item.kind !== kind || item.clientType !== clientType,
    );
    recognition.push(result);
    const device = state.devices.find((item) => item.id === run.deviceId);
    if (device)
      device.dataSync = {
        operatorsAt: device.dataSync?.operatorsAt ?? null,
        depotAt: device.dataSync?.depotAt ?? null,
        [kind === 'depot' ? 'depotAt' : 'operatorsAt']: result.collectedAt,
      };
  }
}
function emit(type: string, message: string, data: Record<string, unknown> = {}) {
  if (data.run && typeof data.run === 'object') {
    const { tasks: _tasks, ...summary } = data.run as Run;
    data = { ...data, run: summary };
  }
  const event: Event = { id: ++sequence, type, message, createdAt: now(), data };
  state.events = [...state.events.slice(-99), event];
  persist();
  listeners.forEach((listener) => listener(clone(event)));
}

function channelFor(id: unknown): UpdateChannel {
  const channel = state.updates.find((item) => item.id === id);
  if (!channel) throw new Error('未知更新通道');
  return channel;
}

function activate(channel: UpdateChannel) {
  if (!['staged', 'waiting_idle'].includes(channel.status)) throw new Error('请先准备更新');
  if (
    channel.id === 'app' &&
    (channel.appCanInstall !== true || state.runs.some((run) => run.status === 'running'))
  )
    throw new Error('当前不能安装应用更新');
  if (state.runs.some((run) => run.status === 'running')) {
    channel.status = 'waiting_idle';
    channel.message = '模拟：当前任务完成后自动切换，应用保持运行';
  } else {
    channel.currentVersion = channel.latestVersion || channel.currentVersion;
    channel.status = 'active';
    channel.progress = 100;
    channel.message = '模拟版本已切换，未修改真实组件';
    state.devices.forEach((device) => {
      if (channel.id === 'core') device.coreVersion = channel.currentVersion;
      if (channel.id === 'resource') device.resourceVersion = channel.currentVersion;
    });
  }
  emit('update.changed', channel.message, { channel: channel.id, update: clone(channel) });
}

const copilotFixture = createCopilotFixture({
  key,
  snapshot: () => state,
  emit,
  availability: fixtureAvailability,
  requests: requestRuns,
  register: (run, tasks) => {
    executionTasks.set(run.id, clone(tasks));
    invalidatePreview(run.deviceId);
  },
});

const timer = globalThis.setInterval(() => {
  let changed = false;
  for (const job of toolData.jobs) {
    if (job.status !== 'running') continue;
    job.progress = Math.min(100, job.progress + 6);
    if (job.progress === 100) {
      const tasks: Plan['tasks'] =
        job.kind === 'operators'
          ? [{ type: 'OperBox', params: { client_type: job.clientType } }]
          : job.kind === 'depot'
            ? [{ type: 'Depot', params: { client_type: job.clientType } }]
            : [];
      for (const task of tasks) collectRecognition(job, task, tasks);
      job.status = 'completed';
      job.finishedAt = now();
      job.message = '合成工具完成';
      const device = state.devices.find((item) => item.id === job.deviceId);
      if (device) device.state = 'idle';
    }
    changed = true;
  }
  for (const run of state.runs) {
    if (run.status !== 'running') continue;
    run.progress = Math.min(100, run.progress + 6);
    const tasks =
      executionTasks.get(run.id) ||
      state.plans.find((item) => item.id === run.planId)?.tasks.filter(taskEnabled) ||
      [];
    const currentIndex = Math.min(
      tasks.length - 1,
      Math.floor((run.progress / 100) * tasks.length),
    );
    run.message = '模拟执行 · ' + (taskLabels[tasks[currentIndex]?.type] || '任务收尾');
    for (const [index, task] of (run.tasks || []).entries()) {
      if (index < currentIndex || run.progress === 100) {
        if (task.status !== 'completed') {
          task.status = 'completed';
          task.startedAt ||= now();
          task.finishedAt = now();
          task.message = `${taskLabels[task.type]}已完成`;
          collectRecognition(run, tasks[index], tasks);
          if (task.type === 'Fight') {
            task.drops.push({
              itemId: '30012',
              name: '固源岩',
              quantity: 2,
              stage: String(tasks[index].params.stage || '1-7'),
              at: now(),
            });
            (task.artifacts as RunArtifact[]).push({
              id: `fixture-${run.id}-${index}`,
              kind: 'screenshot',
              label: '自动作战反馈画面',
              capturedAt: now(),
              width: mockPreviewImage.width,
              height: mockPreviewImage.height,
            });
          }
          if (task.type === 'Infrast') {
            task.infrastructure.push({
              facility: '制造站',
              room: 1,
              operators: [
                '合成三星干员',
                '合成四星干员',
                '合成五星干员',
                '合成六星干员',
                '合成未知干员',
              ],
              staffingStatus: 'confirmed',
              product: '赤金',
              message: '核心已确认换班',
              at: now(),
            });
            (task.artifacts as RunArtifact[]).push({
              id: `fixture-${run.id}-${index}`,
              kind: 'screenshot',
              label: '基建反馈画面',
              capturedAt: now(),
              width: mockPreviewImage.width,
              height: mockPreviewImage.height,
            });
          }
        }
      } else if (index === currentIndex) {
        task.status = 'running';
        task.startedAt ||= now();
        task.message = `正在执行${taskLabels[task.type]}`;
      }
    }
    for (const [index, entry] of (run.copilotEntries || []).entries()) {
      const position = Math.min(
        (run.copilotEntries?.length || 1) - 1,
        Math.floor((run.progress / 100) * (run.copilotEntries?.length || 1)),
      );
      entry.status =
        run.progress === 100 || index < position
          ? 'completed'
          : index === position
            ? 'running'
            : 'waiting';
      entry.message =
        entry.status === 'completed'
          ? '核心流程完成；通关未确认'
          : entry.status === 'running'
            ? '正在执行；通关未确认'
            : '等待执行';
    }
    if (run.progress === 100) {
      executionTasks.delete(run.id);
      run.status = 'completed';
      run.finishedAt = now();
      run.message = '模拟任务完成，未操作真实游戏';
      const device = state.devices.find((item) => item.id === run.deviceId);
      if (device) device.state = 'idle';
    }
    changed = true;
  }
  if (changed) emit('run.progress', '模拟执行进度已更新');
  if (!state.runs.some((run) => run.status === 'running')) {
    for (const channel of state.updates) if (channel.status === 'waiting_idle') activate(channel);
  }
}, 700);
// Browser timers are intentionally owned for the lifetime of this page.
void timer;

export function onFixtureEvent(callback: (event: Event) => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

const delay = (ms: number) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

function mockAddress(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:\[\]-]{1,128}$/.test(value))
    throw new Error('ADB 设备地址无效');
  if (value.startsWith('-')) throw new Error('ADB 设备地址不得以选项开头');
  const emulator = value.match(/^emulator-(\d{1,5})$/);
  if (emulator) return '127.0.0.1:' + (Number(emulator[1]) + 1);
  const local = value.match(/^(?:127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})$/);
  if (local && Number(local[1]) > 0 && Number(local[1]) <= 65535)
    return '127.0.0.1:' + Number(local[1]);
  return value;
}

export async function fixtureRpc(
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  if (method.startsWith('copilot.')) return copilotFixture(method, params);
  switch (method) {
    case 'app.snapshot':
      return clone({
        ...state,
        toolJobs: toolData.jobs.map(({ result: _result, ...summary }) => summary),
        runs: state.runs.map(({ tasks: _tasks, ...summary }) => summary),
      });
    case 'device.availability':
      return fixtureAvailability(String(params.deviceId));
    case 'tool.config.get':
      return clone(
        toolData.configs[
          JSON.stringify([params.deviceId, params.clientType ?? 'Official', params.kind])
        ] ?? {},
      );
    case 'tool.config.save': {
      toolData.configs[
        JSON.stringify([params.deviceId, params.clientType ?? 'Official', params.kind])
      ] = clone(params.config as ToolConfig);
      persist();
      return clone(params.config);
    }
    case 'tool.start': {
      if (toolRequests.has(String(params.requestId)))
        return clone(toolRequests.get(String(params.requestId)));
      const available = fixtureAvailability(String(params.deviceId));
      if (!available.available) throw new Error(available.reason);
      const job: ToolJob = {
        id: 'tool-' + crypto.randomUUID(),
        kind: params.kind as ToolJob['kind'],
        deviceId: String(params.deviceId),
        clientType: (params.clientType ?? 'Official') as ToolJob['clientType'],
        status: 'running',
        progress: 0,
        message: '合成工具准备中',
        startedAt: now(),
        finishedAt: null,
        result: {},
      };
      toolData.jobs.unshift(job);
      toolRequests.set(String(params.requestId), job);
      state.devices.find((item) => item.id === job.deviceId)!.state = 'running';
      emit('tool.started', job.message, { job });
      return clone(job);
    }
    case 'tool.get':
    case 'tool.stop': {
      const job = toolData.jobs.find((item) => item.id === params.id);
      if (!job) throw new Error('工具不存在');
      if (method === 'tool.stop' && job.status === 'running') {
        job.status = 'stopped';
        job.finishedAt = now();
        state.devices.find((item) => item.id === job.deviceId)!.state = 'idle';
        emit('tool.stopped', '工具已停止', { job });
      }
      return clone(job);
    }
    case 'tool.catalog':
      return {
        tags: ['治疗', '医疗干员'],
        operators: [],
        games: ['pixelpaint', 'secretfront'],
        resourceVersion: 'synthetic-resource',
        diagnostics: [],
      };
    case 'schedule.list':
      return {
        schedules: toolData.schedules.map((item) => ({
          ...item,
          override: overrides.get(item.id) ?? null,
          nextAt: new Date(Date.now() + 86400000).toISOString(),
        })),
        occurrences: [],
        timezone: 'Asia/Shanghai',
        wake: { supported: true, status: 'disabled', message: '合成唤醒状态：未注册系统任务' },
      };
    case 'schedule.save': {
      const item = clone(params.schedule as Schedule);
      item.id ||= 'schedule-' + crypto.randomUUID();
      const index = toolData.schedules.findIndex((value) => value.id === item.id);
      if (index >= 0) toolData.schedules[index] = item;
      else toolData.schedules.push(item);
      emit('schedule.changed', '合成定时已保存');
      return clone(item);
    }
    case 'schedule.delete': {
      toolData.schedules = toolData.schedules.filter((item) => item.id !== params.id);
      emit('schedule.changed', '合成定时已删除');
      return { deleted: true };
    }
    case 'schedule.override': {
      if (params.mode === 'clear') overrides.delete(String(params.id));
      else overrides.set(String(params.id), String(params.mode));
      emit('schedule.changed', '合成临时启停已修改');
      return clone(toolData.schedules.find((item) => item.id === params.id));
    }
    case 'schedule.cancel':
      return { cancelled: true };
    case 'recognition.get': {
      const deviceId = String(params.deviceId),
        kind = params.kind as Recognition['kind'],
        clientType = String(params.clientType || 'Official');
      if (!state.devices.some((device) => device.id === deviceId)) throw new Error('设备不存在');
      if (kind !== 'depot' && kind !== 'operators') throw new Error('识别类型无效');
      return clone(
        recognition.find(
          (item) =>
            item.deviceId === deviceId && item.kind === kind && item.clientType === clientType,
        ) || {
          deviceId,
          kind,
          clientType,
          collectedAt: null,
          runId: null,
          items: [],
          operators: [],
        },
      );
    }
    case 'resources.item': {
      const itemId = String(params.itemId);
      const name = ({ '30012': '固源岩', '30013': '固源岩组' } as Record<string, string>)[itemId];
      return {
        itemId,
        name: name ?? null,
        mimeType: name ? 'image/png' : null,
        data: name ? mockPreviewImage.data : null,
        resourceVersion: name ? 'synthetic-resource' : null,
      };
    }
    case 'resources.operator': {
      const name = String(params.name);
      const rarity =
        (
          {
            合成三星干员: 3,
            合成四星干员: 4,
            合成五星干员: 5,
            合成六星干员: 6,
            阿米娅: 5,
            能天使: 6,
          } as Record<string, number>
        )[name] ?? null;
      return {
        name,
        id: rarity ? `char_fixture_${rarity}` : null,
        rarity,
        mimeType: rarity ? 'image/png' : null,
        data: rarity ? mockPreviewImage.data : null,
        resourceVersion: 'synthetic-resource',
      };
    }
    case 'logs.info':
      return {
        directory: navigator.platform.startsWith('Mac')
          ? '/Users/synthetic/Library/Logs/MAAVerge'
          : navigator.platform.startsWith('Win')
            ? 'C:\\Maa Verge\\log'
            : '/home/synthetic/.local/state/MAAVerge/log',
        retentionDays: state.settings.logRetentionDays ?? 7,
      };
    case 'logs.export': {
      const { directory } = (await fixtureRpc('logs.info', {})) as { directory: string };
      return {
        directory,
        path:
          directory +
          (directory.startsWith('C:') ? '\\' : '/') +
          'maaverge-' +
          crypto.randomUUID() +
          '.log',
        bytes: 2048,
        warnings: [],
      };
    }
    case 'logs.clean':
      return { removedFiles: 2, removedBytes: 2048, skippedFiles: 1, warnings: [] };
    case 'stages.list': {
      const clientType = String(params.clientType || 'Official');
      const jp = clientType === 'YoStarJP';
      const activity = {
        id: 'synthetic-activity',
        name: jp ? '日服合成活动' : '合成限时活动',
        clientType,
        startAt: new Date(Date.now() - 3_600_000).toISOString(),
        endAt: new Date(Date.now() + 86_400_000).toISOString(),
        status: 'active',
        source: 'activity-metadata',
      };
      return {
        clientType,
        resourceVersion: 'synthetic-resource',
        generatedAt: now(),
        source: 'installed',
        activities: [activity],
        message: '已读取合成资源活动日历',
        diagnostics: [],
        calendar: {
          source: 'official-cache',
          url: 'https://api.maa.plus/MaaAssistantArknights/api/gui/StageActivityV2.json',
          fetchedAt: now(),
          checkedAt: now(),
          nextRefreshAt: new Date(Date.now() + 3_600_000).toISOString(),
          stale: false,
          refreshing: false,
          error: null,
        },
        stages: [
          ...stagePresets.map((stage) => ({
            value: stage.value,
            label: stage.label,
            category: stage.value ? 'permanent' : 'default',
            available: true,
          })),
          {
            value: jp ? 'JP-1' : 'TEST-1',
            label: jp ? 'JP-1 · 日服活动关卡' : 'TEST-1 · 活动关卡',
            category: 'activity',
            available: true,
            activityId: activity.id,
          },
        ],
      };
    }
    case 'home.info': {
      const info = homeInfo(
        state.settings,
        params.deviceId as string | undefined,
        params.clientType as string | undefined,
      );
      return {
        ...info,
        activityCatalog: await fixtureRpc('stages.list', { clientType: info.clientType }),
      };
    }
    case 'device.frame': {
      if (!validateDeviceFrameParams(params)) throw new Error('画面请求参数无效');
      const device = state.devices.find((item) => item.id === params.deviceId);
      if (!device || device.state === 'offline') throw new Error('设备尚未连接，请先连接设备');
      const captured = Date.now(),
        frameId = crypto.randomUUID();
      for (const [id, frame] of previewFrames)
        if (captured - frame.captured > 2000) previewFrames.delete(id);
      const recent = [...previewFrames.entries()].filter(
        ([, frame]) => frame.deviceId === device.id,
      );
      for (const [id] of recent.slice(0, Math.max(0, recent.length - 31))) previewFrames.delete(id);
      const canControl =
        device.state === 'idle' &&
        !state.runs.some((run) => run.deviceId === device.id && run.status === 'running');
      previewFrames.set(frameId, { deviceId: device.id, captured, canControl });
      return {
        ...mockPreviewImage,
        deviceId: device.id,
        frameId,
        capturedAt: new Date(captured).toISOString(),
        canControl,
        latencyMs: 0,
      };
    }
    case 'device.click': {
      if (!validateDeviceClickParams(params)) throw new Error('点击参数无效');
      const signature = JSON.stringify([params.deviceId, params.frameId, params.x, params.y]);
      const previous = previewClicks.get(params.requestId);
      if (previous) {
        if (previous.signature !== signature) throw new Error('同一点击标识不能用于不同操作');
        return previous.promise;
      }
      for (const [id, click] of previewClicks)
        if (Date.now() - click.time > 300_000) previewClicks.delete(id);
      if (previewClicks.size >= 2048) throw new Error('点击请求过于频繁，请稍后重试');
      const promise = (async (): Promise<{ accepted: true }> => {
        const device = state.devices.find((item) => item.id === params.deviceId),
          frame = previewFrames.get(params.frameId);
        if (
          !device ||
          device.state !== 'idle' ||
          state.runs.some((run) => run.deviceId === device.id && run.status === 'running')
        )
          throw new Error('设备正在执行任务或尚未连接');
        if (
          !frame ||
          frame.deviceId !== device.id ||
          !frame.canControl ||
          Date.now() - frame.captured > 2000
        )
          throw new Error('画面已失效，请刷新后再点击');
        if (params.x >= mockPreviewImage.width || params.y >= mockPreviewImage.height)
          throw new Error('点击位置超出画面范围');
        invalidatePreview(device.id);
        emit('device.clicked', '模拟点击已接收，未操作真实设备', { ...params });
        return { accepted: true };
      })();
      previewClicks.set(params.requestId, { signature, time: Date.now(), promise });
      return promise;
    }
    case 'device.discover':
      return state.devices.map((device) => ({
        address: device.address,
        name: device.name,
        adbState: 'device',
      }));
    case 'device.connect': {
      const address = mockAddress(params.address);
      let device = state.devices.find((item) => mockAddress(item.address) === address);
      if (!device) {
        device = {
          id: 'mock-device-' + encodeURIComponent(address),
          name:
            typeof params.name === 'string' && params.name.trim()
              ? params.name.slice(0, 80)
              : '模拟设备 · ' + address,
          address,
          state: 'idle',
          coreVersion: channelFor('core').currentVersion,
          resourceVersion: channelFor('resource').currentVersion,
        } satisfies Device;
        state.devices.push(device);
      } else if (device.state === 'offline') device.state = 'idle';
      const profile = matchingDeviceProfile(state.settings, address);
      if (profile) {
        device.connectionProfileId = profile.id;
        device.name = profile.name;
      }
      emit('device.connected', '模拟设备已连接，未访问真实 ADB', { deviceId: device.id });
      return clone(device);
    }
    case 'device.disconnect': {
      const device = state.devices.find((item) => item.id === params.id);
      if (!device) throw new Error('设备不存在');
      if (
        device.state === 'running' ||
        state.runs.some((run) => run.deviceId === device.id && run.status === 'running')
      )
        throw new Error('请先停止该设备的执行');
      device.state = 'offline';
      invalidatePreview(device.id);
      emit('device.disconnected', '模拟设备控制权已释放', { deviceId: device.id });
      return { disconnected: true };
    }
    case 'device.auto_connect': {
      const discovered = state.devices.map((device) => ({
        address: device.address,
        name: device.name,
        adbState: 'device',
      }));
      state.devices.forEach((device) => {
        if (device.state === 'offline') device.state = 'idle';
      });
      emit('device.discovery', '模拟：已发现本地演示设备，未访问真实 ADB');
      return clone({
        devices: state.devices,
        discovered,
        diagnostics: ['模拟模式：已连接演示设备；未访问真实模拟器，也未启动游戏任务。'],
      });
    }
    case 'plan.save': {
      const plan = normalizePlan(clone(params.plan) as Plan);
      validatePlan(plan, state.settings);
      plan.id ||= crypto.randomUUID();
      const index = state.plans.findIndex((item) => item.id === plan.id);
      if (index >= 0) state.plans[index] = plan;
      else state.plans.push(plan);
      emit('plan.saved', '已保存计划：' + plan.name);
      return clone(plan);
    }
    case 'plan.delete': {
      if (state.runs.some((run) => run.planId === params.id && run.status === 'running'))
        throw new Error('请先停止执行中的计划');
      state.plans = state.plans.filter((plan) => plan.id !== params.id);
      emit('plan.deleted', '计划已删除');
      return { deleted: true };
    }
    case 'run.start': {
      if (
        typeof params.requestId !== 'string' ||
        !params.requestId ||
        params.requestId.length > 200
      )
        throw new Error('执行请求标识无效');
      const existing = requestRuns.get(String(params.requestId));
      if (existing) {
        const run = state.runs.find((item) => item.id === existing)!;
        if (
          run.source === 'copilot' ||
          run.planId !== params.planId ||
          run.deviceId !== params.deviceId
        )
          throw new Error('同一请求标识不能用于不同执行');
        return clone(run);
      }
      const plan = state.plans.find((item) => item.id === params.planId);
      const device = state.devices.find((item) => item.id === params.deviceId);
      if (!plan?.enabled) throw new Error('计划不存在或尚未启用');
      validatePlan(plan, state.settings);
      if (plan.deviceId !== null && plan.deviceId !== params.deviceId)
        throw new Error('任务表已绑定其他设备，请使用绑定设备执行');
      if (!plan.tasks.some(taskEnabled)) throw new Error('任务表至少需要启用一条任务才能执行');
      if (!device || device.state !== 'idle') throw new Error('设备不可用或正在执行任务');
      const run: Run = {
        id: crypto.randomUUID(),
        planId: plan.id,
        planName: plan.name,
        tasks: plan.tasks.filter(taskEnabled).map((task, index) => ({
          index,
          type: task.type,
          status: index === 0 ? 'running' : 'waiting',
          message: index === 0 ? `正在执行${taskLabels[task.type]}` : '等待执行',
          startedAt: index === 0 ? now() : null,
          finishedAt: null,
          drops: [],
          infrastructure: [],
          artifacts: [],
        })),
        deviceId: device.id,
        status: 'running',
        progress: 0,
        message: '模拟执行开始',
        startedAt: now(),
        finishedAt: null,
      };
      invalidatePreview(device.id);
      executionTasks.set(run.id, clone(plan.tasks.filter(taskEnabled)) as Plan['tasks']);
      device.state = 'running';
      state.runs.unshift(run);
      requestRuns.set(String(params.requestId), run.id);
      emit('run.started', '模拟执行：' + plan.name, { run: clone(run) });
      return clone(run);
    }
    case 'run.detail': {
      const run = state.runs.find((item) => item.id === params.id);
      if (!run) throw new Error('执行记录不存在');
      return clone(run);
    }
    case 'run.artifact': {
      const run = state.runs.find((item) => item.id === params.runId);
      if (!run?.tasks?.some((task) => task.artifacts.some((item) => item.id === params.artifactId)))
        throw new Error('结果截图不存在');
      return { mimeType: 'image/png', data: mockPreviewImage.data };
    }
    case 'run.stop': {
      const run = state.runs.find((item) => item.id === params.id);
      if (!run || run.status !== 'running') throw new Error('任务当前未运行');
      executionTasks.delete(run.id);
      for (const task of run.tasks || [])
        if (task.status === 'running') {
          task.status = 'stopped';
          task.finishedAt = now();
          task.message = '执行已停止';
        }
      for (const entry of run.copilotEntries || [])
        if (entry.status === 'running' || entry.status === 'waiting') {
          entry.status = entry.status === 'running' ? 'stopped' : 'skipped';
          entry.message = '执行已停止；通关未确认';
        }
      run.status = 'stopped';
      run.message = '模拟执行已停止';
      run.finishedAt = now();
      const device = state.devices.find((item) => item.id === run.deviceId);
      if (device) device.state = 'idle';
      emit('run.stopped', run.message, { run: clone(run) });
      return clone(run);
    }
    case 'updates.check': {
      const channel = channelFor(params.channel);
      if (['downloading', 'staged', 'waiting_idle'].includes(channel.status)) return clone(channel);
      const generation = updateGenerations[channel.id];
      channel.status = 'checking';
      emit('update.changed', '模拟检查更新', { channel: channel.id, update: clone(channel) });
      await delay(350);
      if (generation !== updateGenerations[channel.id]) return clone(channel);
      if (channel.id === 'app') {
        channel.latestVersion =
          state.settings.appUpdateChannel === 'stable' ? '0.1.1' : '0.2.0-beta.1';
        channel.appRelease = {
          url: 'https://example.invalid/synthetic-release',
          notes: '合成发布说明，仅用于界面测试。',
          publishedAt: now(),
          prerelease: state.settings.appUpdateChannel !== 'stable',
        };
      } else {
        channel.latestVersion =
          channel.id === 'core'
            ? state.settings.coreUpdateChannel === 'preview'
              ? 'v6.21.0-beta.1'
              : 'v6.20.0'
            : '2026-10-20';
      }
      channel.checkedAt = now();
      channel.status = channel.currentVersion === channel.latestVersion ? 'idle' : 'available';
      channel.message =
        channel.status === 'available' ? '模拟发现新版本，不访问下载源' : '模拟检查完成，已是最新';
      emit('update.changed', channel.message, { channel: channel.id, update: clone(channel) });
      return clone(channel);
    }
    case 'updates.prepare': {
      const channel = channelFor(params.channel);
      if (channel.id === 'app' && channel.appCanInstall !== true)
        throw new Error('当前安装方式不支持自动安装');
      if (channel.status !== 'available') throw new Error('请先检查可用更新');
      const generation = updateGenerations[channel.id];
      channel.status = 'downloading';
      channel.progress = 0;
      for (let progress = 20; progress <= 100; progress += 20) {
        await delay(120);
        if (generation !== updateGenerations[channel.id])
          throw new Error('更新频道已切换，旧频道准备已取消');
        channel.progress = progress;
        emit('update.changed', '模拟准备候选版本', { channel: channel.id, update: clone(channel) });
      }
      channel.status = 'staged';
      channel.message =
        channel.id === 'app' ? '合成签名验证成功，未安装真实应用' : '模拟候选版本已验证，等待启用';
      emit('update.changed', channel.message, { channel: channel.id, update: clone(channel) });
      return clone(channel);
    }
    case 'updates.activate': {
      const channel = channelFor(params.channel);
      activate(channel);
      return clone(channel);
    }
    case 'updates.rollback': {
      const channel = channelFor(params.channel);
      if (channel.id === 'app') throw new Error('应用回滚尚未配置');
      if (state.runs.some((run) => run.status === 'running'))
        throw new Error('请等待设备空闲再回滚');
      channel.currentVersion = channel.id === 'core' ? 'v6.19.0' : '2026-10-18';
      channel.status = 'active';
      channel.message = '已模拟回滚到上一版本';
      channel.progress = 100;
      emit('update.changed', channel.message, { channel: channel.id, update: clone(channel) });
      return clone(channel);
    }
    case 'agent.message': {
      const message = String(params.message || '').trim();
      if (!message) throw new Error('请输入目标');
      await delay(250);
      const stage = message.match(/\b\d{1,2}-\d{1,2}\b/)?.[0];
      const plan: Plan = {
        id: crypto.randomUUID(),
        name: stage ? 'Agent 刷图计划 · ' + stage : 'Agent 日常计划',
        description: '',
        deviceId: null,
        group: 'daily',
        budgets: null,
        enabled: true,
        schedule: null,
        tasks: stage
          ? [{ enabled: true, type: 'Fight', params: { stage, times: 6, medicine: 0, stone: 0 } }]
          : clone(
              state.plans.find((item) => item.id === 'daily')?.tasks || defaults().plans[0].tasks,
            ),
      };
      emit('agent.proposed', '模拟 Agent 提出待确认计划');
      return {
        reply:
          '这是本地规则生成的演示计划，尚未调用云模型。已保持零碎石、零理智药预算。你可以检查和编辑计划，再决定是否执行。',
        plan,
        requiresConfirmation: true,
        mode: 'mock',
      };
    }
    case 'settings.save': {
      const settings = clone(params.settings) as Settings;
      if (settings.downloadProxy) {
        const proxy = settings.downloadProxy;
        if (proxy.mode === 'manual') {
          const value = proxy.url.trim();
          try {
            const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : 'http://' + value);
            if (
              /[\x00-\x20\x7f?#]/.test(value) ||
              !['http:', 'https:'].includes(url.protocol) ||
              url.pathname !== '/' ||
              url.search ||
              url.hash ||
              url.port === '0'
            )
              throw new Error();
            proxy.url = url.href;
          } catch {
            throw new Error('手动下载代理地址无效，请检查代理地址和端口');
          }
        } else proxy.url = '';
      }
      if (
        !settings?.budgets ||
        Object.values(settings.budgets).some(
          (value) => !Number.isInteger(value) || value < 0 || value > 100,
        )
      )
        throw new Error('预算必须为 0–100 的整数');
      if (
        settings.logRetentionDays !== undefined &&
        ![0, 7, 14, 30].includes(settings.logRetentionDays)
      )
        throw new Error('日志保留天数无效');
      for (const id of ['app', 'core'] as const) {
        const field = id === 'app' ? 'appUpdateChannel' : 'coreUpdateChannel';
        const fallback = id === 'app' ? 'preview' : 'stable';
        if ((settings[field] ?? fallback) === (state.settings[field] ?? fallback)) continue;
        updateGenerations[id]++;
        const channel = channelFor(id);
        channel.status = 'idle';
        channel.latestVersion = null;
        channel.progress = 0;
        channel.message = '更新频道已切换，请重新检查';
        delete channel.appRelease;
        delete channel.checkedAt;
      }
      state.settings = settings;
      emit('settings.saved', '本地演示设置已保存');
      return clone(settings);
    }
    default:
      throw new Error('尚未实现的方法：' + method);
  }
}
