import type { Device, Event, Plan, Run, Settings, Snapshot, UpdateChannel } from './types';
import { taskEnabled, validatePlan } from './task-policy';

const workspace = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_WORKSPACE_ID || 'browser';
const key = 'maaverge:mock:v1:' + workspace;
const listeners = new Set<(event: Event) => void>();
const executionTasks = new Map<string, Plan['tasks']>();
const requestRuns = new Map<string, string>();
const now = () => new Date().toISOString();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const defaults = (): Snapshot => ({
  mode: 'mock',
  devices: [{ id: 'mock-device-1', name: '本地模拟设备', address: '127.0.0.1:5555', state: 'idle', coreVersion: 'v6.19.0', resourceVersion: '2026-10-18' }],
  plans: [
    { id: 'daily', name: '每日长草计划', description: '', deviceId: null, group: 'daily', budgets: null, enabled: true, schedule: null, tasks: [
      { enabled: true, type: 'StartUp', params: { client_type: 'Official' } },
      { enabled: true, type: 'Recruit', params: {} }, { enabled: true, type: 'Infrast', params: {} },
      { enabled: true, type: 'Mall', params: {} }, { enabled: true, type: 'Award', params: {} },
    ] },
    { id: 'farm-1-7', name: '固源岩补给', description: '', deviceId: null, group: 'daily', budgets: null, enabled: true, schedule: null, tasks: [{ enabled: true, type: 'Fight', params: { stage: '1-7', times: 6, medicine: 0, stone: 0 } }] },
  ],
  runs: [],
  updates: [
    { id: 'app', currentVersion: '0.1.0', latestVersion: null, status: 'idle', progress: 0, message: '开发预览 · 发行更新源尚未配置' },
    { id: 'core', currentVersion: 'v6.19.0', latestVersion: null, status: 'idle', progress: 0, message: '演示核心版本，未加载原生库' },
    { id: 'resource', currentVersion: '2026-10-18', latestVersion: null, status: 'idle', progress: 0, message: '演示资源快照，不访问网络' },
  ],
  settings: { autoConnect: true, autoUpdateCore: true, autoUpdateResource: true, minimizeToTray: true, theme: 'system', budgets: { originium: 0, medicine: 0, expedited: 0 }, model: { provider: 'none', baseUrl: '', model: '' }, capture: { method: 'adb', emulatorPath: '', instanceIndex: 0 } },
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
    if (state.mode !== 'mock' || !state.settings?.budgets || !Array.isArray(state.updates)) return defaults();
    state.settings = { ...defaults().settings, ...state.settings };
    state.plans.forEach(normalizePlan);
    for (const run of state.runs) {
      if (run.status === 'running') { run.status = 'failed'; run.message = '页面重启，模拟执行已中断，未自动重放'; run.finishedAt = now(); }
    }
    state.devices.forEach((device) => { if (device.state === 'running') device.state = 'idle'; });
    return state;
  } catch { return defaults(); }
}

let state = restore();
let sequence = Math.max(0, ...state.events.map((event) => Number(event.id) || 0));
function persist() { localStorage.setItem(key, JSON.stringify(state)); }
function emit(type: string, message: string, data: Record<string, unknown> = {}) {
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
  emit('update.changed', channel.message);
}

const timer = globalThis.setInterval(() => {
  let changed = false;
  for (const run of state.runs) {
    if (run.status !== 'running') continue;
    run.progress = Math.min(100, run.progress + 6);
    const tasks = executionTasks.get(run.id) || state.plans.find((item) => item.id === run.planId)?.tasks.filter(taskEnabled) || [];
    run.message = '模拟执行 · ' + (tasks[Math.min(tasks.length - 1, Math.floor(run.progress / 100 * tasks.length))]?.type || '任务收尾');
    if (run.progress === 100) {
      executionTasks.delete(run.id);
      run.status = 'completed'; run.finishedAt = now(); run.message = '模拟任务完成，未操作真实游戏';
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

export function onMockEvent(callback: (event: Event) => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

const delay = (ms: number) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

function mockAddress(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:\[\]-]{1,128}$/.test(value)) throw new Error('ADB 设备地址无效');
  if (value.startsWith('-')) throw new Error('ADB 设备地址不得以选项开头');
  const emulator = value.match(/^emulator-(\d{1,5})$/);
  if (emulator) return '127.0.0.1:' + (Number(emulator[1]) + 1);
  const local = value.match(/^(?:127\.0\.0\.1|localhost|\[::1\]):(\d{1,5})$/);
  if (local && Number(local[1]) > 0 && Number(local[1]) <= 65535) return '127.0.0.1:' + Number(local[1]);
  return value;
}

export async function mockRpc(method: string, params: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    case 'app.snapshot': return clone(state);
    case 'device.discover': return state.devices.map((device) => ({ address: device.address, name: device.name, adbState: 'device' }));
    case 'device.connect': {
      const address = mockAddress(params.address);
      let device = state.devices.find((item) => mockAddress(item.address) === address);
      if (!device) {
        device = {
          id: 'mock-device-' + encodeURIComponent(address),
          name: typeof params.name === 'string' && params.name.trim() ? params.name.slice(0, 80) : '模拟设备 · ' + address,
          address, state: 'idle',
          coreVersion: channelFor('core').currentVersion,
          resourceVersion: channelFor('resource').currentVersion,
        } satisfies Device;
        state.devices.push(device);
      } else if (device.state === 'offline') device.state = 'idle';
      emit('device.connected', '模拟设备已连接，未访问真实 ADB', { deviceId: device.id });
      return clone(device);
    }
    case 'device.disconnect': {
      const device = state.devices.find((item) => item.id === params.id);
      if (!device) throw new Error('设备不存在');
      if (device.state === 'running' || state.runs.some((run) => run.deviceId === device.id && run.status === 'running')) throw new Error('请先停止该设备的执行');
      device.state = 'offline';
      emit('device.disconnected', '模拟设备控制权已释放', { deviceId: device.id });
      return { disconnected: true };
    }
    case 'device.auto_connect': {
      const discovered = state.devices.map((device) => ({ address: device.address, name: device.name, adbState: 'device' }));
      state.devices.forEach((device) => { if (device.state === 'offline') device.state = 'idle'; });
      emit('device.discovery', '模拟：已发现本地演示设备，未访问真实 ADB');
      return clone({ devices: state.devices, discovered, diagnostics: ['模拟模式：已连接演示设备；未访问真实模拟器，也未启动游戏任务。'] });
    }
    case 'plan.save': {
      const plan = normalizePlan(clone(params.plan) as Plan);
      validatePlan(plan, state.settings);
      plan.id ||= crypto.randomUUID();
      const index = state.plans.findIndex((item) => item.id === plan.id);
      if (index >= 0) state.plans[index] = plan; else state.plans.push(plan);
      emit('plan.saved', '已保存计划：' + plan.name);
      return clone(plan);
    }
    case 'plan.delete': {
      if (state.runs.some((run) => run.planId === params.id && run.status === 'running')) throw new Error('请先停止执行中的计划');
      state.plans = state.plans.filter((plan) => plan.id !== params.id);
      emit('plan.deleted', '计划已删除');
      return { deleted: true };
    }
    case 'run.start': {
      if (typeof params.requestId !== 'string' || !params.requestId || params.requestId.length > 200) throw new Error('执行请求标识无效');
      const existing = requestRuns.get(String(params.requestId));
      if (existing) {
        const run = state.runs.find((item) => item.id === existing)!;
        if (run.planId !== params.planId || run.deviceId !== params.deviceId) throw new Error('同一请求标识不能用于不同执行');
        return clone(run);
      }
      const plan = state.plans.find((item) => item.id === params.planId);
      const device = state.devices.find((item) => item.id === params.deviceId);
      if (!plan?.enabled) throw new Error('计划不存在或尚未启用');
      validatePlan(plan, state.settings);
      if (plan.deviceId !== null && plan.deviceId !== params.deviceId) throw new Error('任务表已绑定其他设备，请使用绑定设备执行');
      if (!plan.tasks.some(taskEnabled)) throw new Error('任务表至少需要启用一条任务才能执行');
      if (!device || device.state !== 'idle') throw new Error('设备不可用或正在执行任务');
      const run: Run = { id: crypto.randomUUID(), planId: plan.id, deviceId: device.id, status: 'running', progress: 0, message: '模拟执行开始', startedAt: now(), finishedAt: null };
      executionTasks.set(run.id, clone(plan.tasks.filter(taskEnabled)) as Plan['tasks']);
      device.state = 'running'; state.runs.unshift(run);
      requestRuns.set(String(params.requestId), run.id);
      emit('run.started', '模拟执行：' + plan.name);
      return clone(run);
    }
    case 'run.stop': {
      const run = state.runs.find((item) => item.id === params.id);
      if (!run || run.status !== 'running') throw new Error('任务当前未运行');
      executionTasks.delete(run.id);
      run.status = 'stopped'; run.message = '模拟执行已停止'; run.finishedAt = now();
      const device = state.devices.find((item) => item.id === run.deviceId);
      if (device) device.state = 'idle';
      emit('run.stopped', run.message);
      return clone(run);
    }
    case 'updates.check': {
      const channel = channelFor(params.channel);
      if (['downloading','staged','waiting_idle'].includes(channel.status)) return clone(channel);
      channel.status = 'checking'; emit('update.changed', '模拟检查更新');
      await delay(350);
      if (channel.id === 'app') { channel.status = 'idle'; channel.message = '发行更新源尚未配置'; }
      else {
        channel.latestVersion = channel.id === 'core' ? 'v6.20.0' : '2026-10-20';
        channel.status = channel.currentVersion === channel.latestVersion ? 'idle' : 'available';
        channel.message = channel.status === 'available' ? '模拟发现新版本，不访问下载源' : '模拟检查完成，已是最新';
      }
      emit('update.changed', channel.message);
      return clone(channel);
    }
    case 'updates.prepare': {
      const channel = channelFor(params.channel);
      if (channel.id === 'app') throw new Error('发行更新源尚未配置');
      if (channel.status !== 'available') throw new Error('请先检查可用更新');
      channel.status = 'downloading'; channel.progress = 0;
      for (let progress = 20; progress <= 100; progress += 20) {
        await delay(120); channel.progress = progress; emit('update.changed', '模拟准备候选版本');
      }
      channel.status = 'staged'; channel.message = '模拟候选版本已验证，等待启用';
      emit('update.changed', channel.message);
      return clone(channel);
    }
    case 'updates.activate': { const channel = channelFor(params.channel); activate(channel); return clone(channel); }
    case 'updates.rollback': {
      const channel = channelFor(params.channel);
      if (channel.id === 'app') throw new Error('应用回滚尚未配置');
      if (state.runs.some((run) => run.status === 'running')) throw new Error('请等待设备空闲再回滚');
      channel.currentVersion = channel.id === 'core' ? 'v6.19.0' : '2026-10-18';
      channel.status = 'idle'; channel.message = '已模拟回滚到上一版本'; channel.progress = 0;
      emit('update.changed', channel.message); return clone(channel);
    }
    case 'agent.message': {
      const message = String(params.message || '').trim();
      if (!message) throw new Error('请输入目标');
      await delay(250);
      const stage = message.match(/\b\d{1,2}-\d{1,2}\b/)?.[0];
      const plan: Plan = { id: crypto.randomUUID(), name: stage ? 'Agent 刷图计划 · ' + stage : 'Agent 日常计划', description: '', deviceId: null, group: 'daily', budgets: null, enabled: true, schedule: null, tasks: stage
        ? [{ enabled: true, type: 'Fight', params: { stage, times: 6, medicine: 0, stone: 0 } }]
        : clone(state.plans.find((item) => item.id === 'daily')?.tasks || defaults().plans[0].tasks) };
      emit('agent.proposed', '模拟 Agent 提出待确认计划');
      return { reply: '这是本地规则生成的演示计划，尚未调用云模型。已保持零碎石、零理智药预算。你可以检查和编辑计划，再决定是否执行。', plan, requiresConfirmation: true, mode: 'mock' };
    }
    case 'settings.save': {
      const settings = clone(params.settings) as Settings;
      if (!settings?.budgets || Object.values(settings.budgets).some((value) => !Number.isInteger(value) || value < 0 || value > 100)) throw new Error('预算必须为 0–100 的整数');
      state.settings = settings; emit('settings.saved', '本地演示设置已保存'); return clone(settings);
    }
    default: throw new Error('尚未实现的方法：' + method);
  }
}
