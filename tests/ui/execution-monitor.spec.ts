import { deviceOptions, devicePicker, selectDevice } from './fixtures/device-picker';
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { Run, Snapshot } from '../../packages/contracts/src/types';
import { expect, test, type HarnessWindow } from './fixtures/desktop';

type MonitorState = {
  runs: Run[];
  toolJobs: NonNullable<Snapshot['toolJobs']>;
  devices: Snapshot['devices'];
  calls: { method: string; params: Record<string, unknown> }[];
  releaseDetails: Record<string, () => void>;
  holdStart?: boolean;
  releaseStart?: () => void;
};
type MonitorWindow = HarnessWindow & { monitorState: MonitorState };

const monitor = (page: Page) => page.getByRole('region', { name: '任务表执行监控', exact: true });
const detail = (page: Page) => page.getByRole('region', { name: '任务表执行页面', exact: true });
const inspected = (page: Page) =>
  page.getByRole('region', { name: '所选设备执行情况', exact: true });
const logDrawer = (page: Page) => page.getByRole('dialog', { name: '设备日志', exact: true });
const row = (page: Page, name: string) =>
  monitor(page).getByRole('article', { name: `设备执行${name}`, exact: true });
const detailButton = (page: Page, name: string) =>
  row(page, name).getByRole('button', { name: `查看设备执行${name}`, exact: true });
const logButton = (page: Page, name: string) =>
  row(page, name).getByRole('button', { name: `查看设备日志${name}`, exact: true });

async function openMonitor(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('tab', { name: '执行监控', exact: true }).click();
  await expect(monitor(page)).toBeVisible();
}

async function openRunFromHistory(page: Page, runId: string) {
  await page.locator('.sidebar').getByRole('button', { name: '执行记录', exact: true }).click();
  await page.getByRole('button', { name: `查看执行${runId}`, exact: true }).click();
  await expect(detail(page)).toBeVisible();
}

// Keep runs outside the fixture's automatic completion timer. This bridge still
// exercises the real typed transport and snapshot refreshes, without real devices.
async function seedMonitor(page: Page, heldDetails: string[] = []) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate(async (heldDetails) => {
    const target = window as unknown as MonitorWindow;
    const api = target.runtimeHarness;
    const call = api.call;
    const base = (await call('app.snapshot', {})) as Snapshot;
    const names = ['一号模拟器', '二号模拟器', '三号模拟器', '四号模拟器', '五号模拟器'];
    const devices = names.map((name, index) => ({
      ...base.devices[0],
      id: `monitor-device-${index + 1}`,
      name,
      address: `127.0.0.1:${5555 + index * 2}`,
      state:
        index < 3 ? ('running' as const) : index === 3 ? ('idle' as const) : ('offline' as const),
    }));
    const plans = [
      {
        ...base.plans[0],
        id: 'monitor-daily',
        name: '共同日常',
        deviceId: null,
        tasks: [
          {
            enabled: true,
            type: 'Fight' as const,
            params: { stage: '1-7', times: 6, medicine: 0, stone: 0 },
          },
          { enabled: true, type: 'StartUp' as const, params: { client_type: 'Official' } },
        ],
      },
      {
        ...base.plans[0],
        id: 'monitor-other',
        name: '剿灭检查',
        deviceId: null,
        tasks: [{ enabled: true, type: 'Award' as const, params: {} }],
      },
    ];
    const stamp = (offsetMinutes: number) =>
      new Date(Date.now() + offsetMinutes * 60_000).toISOString();
    const makeRun = (
      id: string,
      planIndex: number,
      deviceIndex: number,
      status: Run['status'] = 'running',
      planName = plans[planIndex].name,
      startedAt = stamp(-5),
    ): Run => ({
      id,
      planId: plans[planIndex].id,
      planName,
      deviceId: devices[deviceIndex].id,
      status,
      progress: status === 'completed' ? 100 : 36,
      message: `${names[deviceIndex]} · ${status === 'running' ? '执行中' : status === 'failed' ? '识别失败，请检查设备' : status === 'stopped' ? '此实例已停止' : '执行已完成'}`,
      startedAt,
      finishedAt: status === 'running' ? null : stamp(-4),
      tasks: [
        {
          index: 0,
          type: plans[planIndex].tasks[0].type,
          status,
          message: `${names[deviceIndex]}的独立任务结果`,
          startedAt,
          finishedAt: status === 'running' ? null : stamp(-4),
          drops: [],
          artifacts: [],
          infrastructure: [],
        },
      ],
    });
    const state: MonitorState = {
      runs: [
        makeRun('monitor-a', 0, 0, 'running', '共同日常', stamp(-5)),
        makeRun('monitor-b', 0, 1, 'running', '共同日常', stamp(-4)),
        makeRun('monitor-c', 1, 2, 'running', '剿灭检查', stamp(-3)),
        makeRun('monitor-failed', 1, 0, 'failed', '历史识别', stamp(-90)),
        makeRun('monitor-completed', 0, 1, 'completed', '已完成领奖', stamp(-60)),
      ],
      devices,
      toolJobs: [],
      calls: [],
      releaseDetails: {},
    };
    const logEvents: Snapshot['events'] = [
      {
        id: 101,
        type: 'run.started',
        message: '一号模拟器开始执行',
        createdAt: stamp(-9),
        data: { runId: 'monitor-a' },
      },
      {
        id: 102,
        type: 'run.started',
        message: '二号模拟器开始执行',
        createdAt: stamp(-8),
        data: { runId: 'monitor-b' },
      },
      {
        id: 103,
        type: 'run.task',
        message: '一号模拟器进入作战',
        createdAt: stamp(-7),
        data: { runId: 'monitor-a' },
      },
      {
        id: 104,
        type: 'run.failed',
        message: '历史识别失败原因',
        createdAt: stamp(-6),
        data: { runId: 'monitor-failed' },
      },
      {
        id: 105,
        type: 'run.task',
        message: '三号模拟器进入领奖',
        createdAt: stamp(-2),
        data: { run: { id: 'monitor-c', deviceId: 'monitor-device-3' } },
      },
    ];
    target.monitorState = state;
    api.call = async (method, params) => {
      state.calls.push({ method, params: structuredClone(params) });
      if (method === 'app.snapshot')
        return {
          ...base,
          devices: structuredClone(state.devices),
          plans: structuredClone(plans),
          runs: state.runs.map(({ tasks: _tasks, ...summary }) => structuredClone(summary)),
          toolJobs: structuredClone(state.toolJobs),
          events: [...base.events, ...structuredClone(logEvents)],
        };
      if (method === 'run.detail') {
        const run = state.runs.find((item) => item.id === params.id);
        if (!run) throw new Error('合成执行不存在');
        const result = structuredClone(run);
        if (heldDetails.includes(run.id))
          await new Promise<void>((resolve) => {
            state.releaseDetails[run.id] = resolve;
          });
        return result;
      }
      if (method === 'plan.save') {
        const plan = structuredClone(params.plan) as Snapshot['plans'][number];
        const index = plans.findIndex((item) => item.id === plan.id);
        if (index >= 0) plans[index] = plan as (typeof plans)[number];
        return plan;
      }
      if (method === 'tool.stop') {
        const job = state.toolJobs.find((item) => item.id === params.id)!;
        job.status = 'stopped';
        job.message = '工具已停止';
        job.finishedAt = new Date().toISOString();
        state.devices.find((device) => device.id === job.deviceId)!.state = 'idle';
        api.emitEvent('tool.stopped', { jobId: job.id });
        return structuredClone(job);
      }
      if (method === 'logs.delete') {
        const ids = params.ids as number[];
        let deleted = 0;
        for (let index = logEvents.length - 1; index >= 0; index--)
          if (ids.includes(logEvents[index].id)) {
            logEvents.splice(index, 1);
            deleted++;
          }
        return { deleted };
      }
      if (method === 'run.stop') {
        const run = state.runs.find((item) => item.id === params.id)!;
        run.status = 'stopped';
        run.message = '此实例已停止';
        run.finishedAt = new Date().toISOString();
        run.tasks = run.tasks?.map((task) => ({
          ...task,
          status: 'stopped',
          finishedAt: run.finishedAt,
        }));
        state.devices.find((device) => device.id === run.deviceId)!.state = 'idle';
        api.emitEvent('run.stopped', { runId: run.id });
        return structuredClone(run);
      }
      if (method === 'run.start') {
        const run = makeRun(
          'monitor-new',
          plans.findIndex((plan) => plan.id === params.planId),
          state.devices.findIndex((device) => device.id === params.deviceId),
        );
        state.runs.unshift(run);
        state.devices.find((device) => device.id === run.deviceId)!.state = 'running';
        api.emitEvent('run.started', { runId: run.id });
        if (state.holdStart)
          await new Promise<void>((resolve) => {
            state.releaseStart = resolve;
          });
        return structuredClone(run);
      }
      return call(method, params);
    };
    api.emitEvent('run.started');
  }, heldDetails);
  await devicePicker(page).click();
  await expect(deviceOptions(page).getByRole('option', { name: /五号模拟器/ })).toHaveCount(1);
  await devicePicker(page).press('Escape');
}

test('monitor lists one row per device, stops only that device and bulk-stops selected devices', async ({
  page,
}) => {
  await seedMonitor(page);
  await openMonitor(page);
  await expect(monitor(page).getByRole('article')).toHaveCount(5);
  await expect(row(page, '一号模拟器')).toContainText('共同日常');
  await expect(row(page, '一号模拟器')).toContainText('执行中');
  await expect(
    row(page, '一号模拟器').getByRole('progressbar', { name: '一号模拟器执行进度', exact: true }),
  ).toBeVisible();
  await expect(row(page, '四号模拟器')).toContainText('空闲');
  await expect(row(page, '四号模拟器')).toContainText('尚未执行任务');
  await expect(row(page, '五号模拟器')).toContainText('离线');
  await expect(detail(page)).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as MonitorWindow).runtimeHarness.emitEvent('run.progress');
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as MonitorWindow).monitorState.calls.filter(
            (item) => item.method === 'app.snapshot',
          ).length,
      ),
    )
    .toBeGreaterThan(1);
  expect(
    await page.evaluate(() =>
      (window as unknown as MonitorWindow).monitorState.calls.filter((item) =>
        ['run.detail', 'run.artifact', 'device.frame'].includes(item.method),
      ),
    ),
  ).toEqual([]);

  await row(page, '一号模拟器')
    .getByRole('button', { name: '停止设备任务一号模拟器', exact: true })
    .click();
  await expect(row(page, '一号模拟器')).toContainText('已停止');
  await expect(row(page, '一号模拟器')).toContainText('最近执行：共同日常');
  await expect(row(page, '一号模拟器')).toContainText('当前没有任务');
  await expect(row(page, '二号模拟器')).toContainText('执行中');
  await expect(row(page, '三号模拟器')).toContainText('执行中');
  expect(
    await page.evaluate(() =>
      (window as unknown as MonitorWindow).monitorState.runs
        .filter((run) => run.status === 'running')
        .map((run) => run.id),
    ),
  ).toEqual(['monitor-b', 'monitor-c']);
  expect(
    await page.evaluate(() =>
      (window as unknown as MonitorWindow).monitorState.calls
        .filter((item) => item.method === 'run.stop')
        .map((item) => item.params.id),
    ),
  ).toEqual(['monitor-a']);

  await page.getByRole('checkbox', { name: '选择设备二号模拟器', exact: true }).check();
  await page.getByRole('checkbox', { name: '选择设备三号模拟器', exact: true }).check();
  const bulk = page.getByRole('region', { name: '设备批量操作', exact: true });
  await expect(bulk.getByRole('status')).toHaveText('已选 2 台设备');
  await bulk.getByRole('button', { name: '停止所选', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('已停止 2 台设备。');
  await expect(bulk).toHaveCount(0);
  await expect(row(page, '二号模拟器')).toContainText('已停止');
  await expect(row(page, '三号模拟器')).toContainText('已停止');
  expect(
    await page.evaluate(() =>
      (window as unknown as MonitorWindow).monitorState.calls
        .filter((item) => item.method === 'run.stop')
        .map((item) => item.params.id),
    ),
  ).toEqual(['monitor-a', 'monitor-b', 'monitor-c']);
});

test('monitor filters and searches devices and preserves selection across filters', async ({
  page,
}) => {
  await seedMonitor(page);
  await openMonitor(page);
  const filters = monitor(page).getByRole('group', { name: '筛选监控设备', exact: true });
  await filters.getByRole('button', { name: '执行中', exact: true }).click();
  await expect(monitor(page).getByRole('article')).toHaveCount(3);
  await filters.getByRole('button', { name: '空闲', exact: true }).click();
  await expect(monitor(page).getByRole('article')).toHaveCount(1);
  await filters.getByRole('button', { name: '离线', exact: true }).click();
  await expect(monitor(page).getByRole('article')).toHaveCount(1);
  await expect(monitor(page).getByRole('article')).toContainText('五号模拟器');
  await filters.getByRole('button', { name: '全部', exact: true }).click();
  const search = monitor(page).getByRole('textbox', { name: '搜索监控设备', exact: true });
  await search.fill('二号模拟器');
  await expect(monitor(page).getByRole('article')).toHaveCount(1);
  await search.fill('共同日常');
  await expect(monitor(page).getByRole('article')).toHaveCount(2);
  await search.fill('剿灭检查');
  await expect(monitor(page).getByRole('article')).toHaveCount(1);
  await search.fill('没有匹配的任务表');
  await expect(monitor(page).getByRole('article')).toHaveCount(0);
  await expect(
    monitor(page).getByRole('heading', { name: '没有匹配的设备', exact: true }),
  ).toBeVisible();
  await monitor(page).getByRole('button', { name: '清除筛选', exact: true }).click();
  await expect(monitor(page).getByRole('article')).toHaveCount(5);
  await monitor(page).getByRole('checkbox', { name: '全选监控设备', exact: true }).check();
  await expect(
    page.getByRole('region', { name: '设备批量操作', exact: true }).getByRole('status'),
  ).toHaveText('已选 5 台设备');
  await page
    .getByRole('region', { name: '设备批量操作', exact: true })
    .getByRole('button', { name: '清除', exact: true })
    .click();
  await expect(page.getByRole('region', { name: '设备批量操作', exact: true })).toHaveCount(0);
});

test('selecting a device toggles its details, switches devices and follows live state', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedMonitor(page);
  await openMonitor(page);
  const online = monitor(page).getByRole('region', { name: '已连接监控设备', exact: true });
  const offline = monitor(page).getByRole('region', { name: '历史离线监控设备', exact: true });
  await expect(online.getByRole('article')).toHaveCount(4);
  await expect(offline.getByRole('article')).toHaveCount(1);
  await detailButton(page, '一号模拟器').click();
  await expect(detailButton(page, '一号模拟器')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog', { name: /^设备详情/ })).toHaveCount(0);
  const info = inspected(page).getByRole('region', { name: '设备信息', exact: true });
  await expect(info).toContainText('127.0.0.1:5555');
  await expect(detail(page)).toContainText('一号模拟器的独立任务结果');

  await detailButton(page, '一号模拟器').click();
  await expect(detailButton(page, '一号模拟器')).toHaveAttribute('aria-pressed', 'false');
  await expect(inspected(page)).toHaveCount(0);
  await expect(detail(page)).toHaveCount(0);
  await expect(devicePicker(page)).toHaveAttribute('data-value', 'monitor-device-1');
  await page.evaluate(() => {
    const target = window as unknown as MonitorWindow;
    target.monitorState.runs.find((item) => item.id === 'monitor-a')!.message =
      '取消查看后任务继续执行';
    target.runtimeHarness.emitEvent('run.progress', { runId: 'monitor-a' });
  });
  await expect(row(page, '一号模拟器')).toContainText('取消查看后任务继续执行');
  await expect(inspected(page)).toHaveCount(0);
  await expect(detailButton(page, '一号模拟器')).toHaveAttribute('aria-pressed', 'false');

  await detailButton(page, '二号模拟器').click();
  await expect(detailButton(page, '二号模拟器')).toHaveAttribute('aria-pressed', 'true');
  await expect(detail(page)).toContainText('二号模拟器的独立任务结果');
  await expect(detail(page)).not.toContainText('一号模拟器的独立任务结果');
  await detailButton(page, '一号模拟器').click();
  await expect(detailButton(page, '二号模拟器')).toHaveAttribute('aria-pressed', 'false');
  await expect(detailButton(page, '一号模拟器')).toHaveAttribute('aria-pressed', 'true');
  await expect(detail(page)).toContainText('一号模拟器的独立任务结果');
  await expect(detail(page)).toContainText('取消查看后任务继续执行');

  await page.evaluate(() => {
    const target = window as unknown as MonitorWindow;
    const run = target.monitorState.runs.find((item) => item.id === 'monitor-a')!;
    run.status = 'completed';
    run.progress = 100;
    run.finishedAt = new Date().toISOString();
    run.tasks = run.tasks?.map((task) => ({
      ...task,
      status: 'completed',
      finishedAt: run.finishedAt,
    }));
    target.monitorState.devices.find((device) => device.id === run.deviceId)!.state = 'idle';
    target.runtimeHarness.emitEvent('run.completed', { runId: run.id });
  });
  await expect(
    inspected(page).getByRole('heading', { name: '当前没有任务', exact: true }),
  ).toBeVisible();
  await expect(detail(page)).toHaveCount(0);
  await expect(row(page, '一号模拟器')).toContainText('已完成');

  await page.setViewportSize({ width: 390, height: 844 });
  await detailButton(page, '四号模拟器').click();
  await expect(
    inspected(page).getByRole('heading', { name: '当前没有任务', exact: true }),
  ).toBeVisible();
  await detailButton(page, '五号模拟器').click();
  await expect(
    inspected(page).getByRole('heading', { name: '设备已离线', exact: true }),
  ).toBeVisible();
  await expect(detail(page)).toHaveCount(0);
});

test('offline state takes precedence over a stale running summary', async ({ page }) => {
  await seedMonitor(page);
  await openMonitor(page);
  await detailButton(page, '一号模拟器').click();
  await expect(detail(page)).toContainText('一号模拟器的独立任务结果');
  await page.evaluate(() => {
    const target = window as unknown as MonitorWindow;
    target.monitorState.devices[0].state = 'offline';
    target.runtimeHarness.emitEvent('device.disconnected', {
      deviceId: target.monitorState.devices[0].id,
    });
  });
  await expect(
    inspected(page).getByRole('heading', { name: '设备已离线', exact: true }),
  ).toBeVisible();
  await expect(detail(page)).toHaveCount(0);
  await expect(
    monitor(page).getByRole('region', { name: '历史离线监控设备', exact: true }),
  ).toContainText('一号模拟器');
  await expect(
    row(page, '一号模拟器').getByRole('button', { name: '停止设备任务一号模拟器', exact: true }),
  ).toHaveCount(0);
});

test('the same device monitor shows copilot execution and independently stops tools', async ({
  page,
}) => {
  await seedMonitor(page);
  await page.evaluate(() => {
    const target = window as unknown as MonitorWindow;
    const run = target.monitorState.runs.find((item) => item.id === 'monitor-a')!;
    run.source = 'copilot';
    run.sourceName = '自动作战专项';
    run.planId = null;
    run.copilotEntries = [
      {
        id: 'entry-complete',
        versionId: 'version-1',
        title: '启动时的第一份作业',
        nativeId: 1,
        status: 'completed',
        verdict: 'unknown',
        message: '流程已结束，等待战斗证据',
      },
      {
        id: 'entry-running',
        versionId: 'version-2',
        title: '正在执行的第二份作业',
        nativeId: 2,
        status: 'running',
        verdict: 'unknown',
        message: '执行中',
      },
    ];
    run.tasks = run.tasks?.map((task) => ({
      ...task,
      type: 'Copilot',
      message: '自动作战正在执行第一份作业',
    }));
    target.monitorState.devices[3].state = 'running';
    target.monitorState.toolJobs.push({
      id: 'monitor-tool',
      kind: 'depot',
      deviceId: 'monitor-device-4',
      clientType: 'Official',
      status: 'running',
      progress: 48,
      message: '正在识别仓库物品',
      startedAt: new Date().toISOString(),
      finishedAt: null,
    });
    target.runtimeHarness.emitEvent('run.progress');
  });
  await openMonitor(page);
  await expect(row(page, '一号模拟器')).toContainText('自动作战专项');
  await detailButton(page, '一号模拟器').click();
  await expect(detail(page)).toContainText('自动作战专项');
  await expect(detail(page)).toContainText('自动作战正在执行第一份作业');
  const queue = detail(page).getByRole('region', { name: '本次作业队列', exact: true });
  await expect(queue).toContainText('启动时的第一份作业');
  await expect(queue).toContainText('正在执行的第二份作业');
  await expect(queue).toContainText('核心流程结束');
  await expect(queue.getByText('通关未确认', { exact: true })).toHaveCount(2);
  await expect(queue.getByText('通关已确认', { exact: true })).toHaveCount(0);
  await expect(page.locator('.primary-nav .nav-item[aria-current="page"]')).toHaveText('任务');
  await detailButton(page, '四号模拟器').click();
  const tool = inspected(page).getByRole('region', { name: '工具执行状态', exact: true });
  await expect(tool).toContainText('仓库识别');
  await expect(tool).toContainText('正在识别仓库物品');
  await expect(detail(page)).toHaveCount(0);
  await tool.getByRole('button', { name: '停止工具', exact: true }).click();
  await expect(
    inspected(page).getByRole('heading', { name: '当前没有任务', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as MonitorWindow).monitorState.calls
        .filter((item) => ['tool.stop', 'run.stop'].includes(item.method))
        .map((item) => ({ method: item.method, id: item.params.id })),
    ),
  ).toEqual([{ method: 'tool.stop', id: 'monitor-tool' }]);
  expect(
    await page.evaluate(() =>
      (window as unknown as MonitorWindow).monitorState.calls.filter(
        (item) => item.method === 'run.detail' && item.params.id === 'monitor-tool',
      ),
    ),
  ).toEqual([]);
});

test('history stays exact until returning to current execution or clearing the device selection', async ({
  page,
}) => {
  await seedMonitor(page);
  await openRunFromHistory(page, 'monitor-failed');
  await expect(detailButton(page, '一号模拟器')).toHaveAttribute('aria-pressed', 'true');
  await expect(inspected(page)).toContainText('正在查看历史执行');
  await expect(detail(page)).toContainText('历史识别');
  await expect(
    detail(page).getByRole('region', { name: '本次执行总览', exact: true }),
  ).toContainText('执行失败');
  await page.evaluate(() => {
    const target = window as unknown as MonitorWindow;
    target.monitorState.runs.find((item) => item.id === 'monitor-a')!.message = '当前任务继续运行';
    target.runtimeHarness.emitEvent('run.progress');
  });
  await expect(detail(page)).toContainText('历史识别');
  await expect(detail(page)).not.toContainText('当前任务继续运行');
  await inspected(page).getByRole('button', { name: '查看当前执行', exact: true }).click();
  await expect(detail(page)).toContainText('共同日常');
  await expect(detail(page)).toContainText('当前任务继续运行');

  await openRunFromHistory(page, 'monitor-failed');
  await expect(inspected(page)).toContainText('正在查看历史执行');
  await expect(detail(page)).toContainText('历史识别');
  await detailButton(page, '一号模拟器').click();
  await expect(detailButton(page, '一号模拟器')).toHaveAttribute('aria-pressed', 'false');
  await expect(inspected(page)).toHaveCount(0);
  await expect(detail(page)).toHaveCount(0);
  await expect(devicePicker(page)).toHaveAttribute('data-value', 'monitor-device-1');
  await detailButton(page, '一号模拟器').click();
  await expect(detail(page)).toContainText('共同日常');
  await expect(detail(page)).toContainText('当前任务继续运行');
  await expect(detail(page)).not.toContainText('历史识别');
  await expect(inspected(page)).not.toContainText('正在查看历史执行');
});

test('connection settings return to the task draft and viewing execution selects its device', async ({
  page,
}) => {
  await seedMonitor(page);
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page
    .getByRole('region', { name: '任务表列表', exact: true })
    .getByRole('button', { name: '查看任务表详情共同日常', exact: true })
    .click();
  const task = page.getByRole('dialog', { name: '任务表详情', exact: true });
  const workbench = page.getByRole('region', { name: '任务表工作台', exact: true });
  await workbench.getByRole('tab', { name: '任务表设置', exact: true }).click();
  await workbench.getByLabel('任务表说明', { exact: true }).fill('设备设置关闭后保留此任务表草稿');
  await workbench.getByRole('tab', { name: '任务编排', exact: true }).click();
  await workbench.getByRole('button', { name: /^设置第 2 条/ }).click();
  await workbench.getByRole('button', { name: '管理设备连接', exact: true }).click();
  const connection = page.getByRole('dialog', { name: '设备连接设置', exact: true });
  await expect(connection.getByLabel('ADB 路径', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(connection).toHaveCount(0);
  await expect(task).toBeVisible();
  await workbench.getByRole('tab', { name: '任务表设置', exact: true }).click();
  await expect(workbench.getByLabel('任务表说明', { exact: true })).toHaveValue(
    '设备设置关闭后保留此任务表草稿',
  );
  await workbench
    .getByRole('status', { name: '任务表运行状态', exact: true })
    .getByRole('button', { name: '查看执行', exact: true })
    .click();
  await expect(task).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '执行监控', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(detailButton(page, '一号模拟器')).toHaveAttribute('aria-pressed', 'true');
  await expect(detail(page)).toContainText('一号模拟器的独立任务结果');
  await logButton(page, '一号模拟器').click();
  await expect(logDrawer(page)).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  expect(
    await logDrawer(page).evaluate((element) => element.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(logDrawer(page)).toHaveCount(0);
  await detailButton(page, '二号模拟器').click();
  await expect(detail(page)).toContainText('二号模拟器的独立任务结果');
  await page.locator('.sidebar').getByRole('button', { name: '设备', exact: true }).click();
  await expect(page.getByRole('tab', { name: /^当前设备/ })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: '主页', exact: true }).click();
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
});

test('single-device log drawer hides the device list and only enables selection on demand', async ({
  page,
}) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await seedMonitor(page);
  await openMonitor(page);
  const trigger = logButton(page, '一号模拟器');
  await trigger.click();
  const drawer = logDrawer(page);
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('region', { name: '选择日志设备', exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('checkbox', { name: /^查看设备日志/ })).toHaveCount(0);
  await expect(drawer.getByText('一号模拟器 · 3 条日志', { exact: true })).toBeVisible();
  const list = drawer.getByRole('list', { name: '设备日志列表', exact: true });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(drawer).toContainText('历史识别失败原因');
  await expect(drawer).not.toContainText('二号模拟器开始执行');
  await expect(drawer.getByRole('checkbox', { name: /^选择日志/ })).toHaveCount(0);
  await expect(drawer.locator('.monitor-log-toolbar').getByRole('status')).toHaveText('共 3 条');

  await drawer.getByRole('button', { name: '选择日志', exact: true }).click();
  await expect(drawer.getByRole('checkbox', { name: '选择日志101', exact: true })).toBeVisible();
  await drawer.getByRole('checkbox', { name: '全选日志', exact: true }).check();
  await expect(drawer.locator('.monitor-log-toolbar').getByRole('status')).toHaveText('已选 3 条');
  await drawer.getByRole('checkbox', { name: '选择日志101', exact: true }).uncheck();
  await expect(drawer.locator('.monitor-log-toolbar').getByRole('status')).toHaveText('已选 2 条');
  await drawer.getByRole('checkbox', { name: '选择日志101', exact: true }).check();

  await drawer.getByRole('button', { name: '复制所选', exact: true }).click();
  await expect(drawer.getByText('已复制 3 条日志', { exact: true })).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('历史识别失败原因');
  expect(clipboard.split('\n')).toHaveLength(3);
  const downloadEvent = page.waitForEvent('download');
  await drawer.getByRole('button', { name: '导出所选', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^maa-verge-logs-.*\.txt$/);
  expect((await readFile(await download.path(), 'utf8')).split('\n')).toHaveLength(3);

  await drawer.getByRole('button', { name: '完成选择', exact: true }).click();
  await expect(drawer.getByRole('checkbox', { name: /^选择日志/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('multi-device log drawer only offers the selected devices and no device-level select-all', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedMonitor(page);
  await openMonitor(page);
  await page.getByRole('checkbox', { name: '选择设备二号模拟器', exact: true }).check();
  await page.getByRole('checkbox', { name: '选择设备三号模拟器', exact: true }).check();
  await page
    .getByRole('region', { name: '设备批量操作', exact: true })
    .getByRole('button', { name: '查看日志', exact: true })
    .click();
  const drawer = logDrawer(page);
  const scope = drawer.getByRole('region', { name: '选择日志设备', exact: true });
  await expect(scope).toBeVisible();
  await expect(scope.getByRole('checkbox')).toHaveCount(2);
  await expect(
    scope.getByRole('checkbox', { name: '查看设备日志二号模拟器', exact: true }),
  ).toBeChecked();
  await expect(
    scope.getByRole('checkbox', { name: '查看设备日志三号模拟器', exact: true }),
  ).toBeChecked();
  await expect(drawer).not.toContainText('一号模拟器');
  await expect(drawer).not.toContainText('五号模拟器');
  await expect(drawer.getByText('2 台设备 · 2 条日志', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('checkbox', { name: '全选日志设备', exact: true })).toHaveCount(0);
  await drawer.getByRole('checkbox', { name: '查看设备日志三号模拟器', exact: true }).uncheck();
  await expect(drawer.getByText('1 台设备 · 1 条日志', { exact: true })).toBeVisible();
  await expect(drawer).toContainText('二号模拟器开始执行');
  await expect(drawer).not.toContainText('三号模拟器进入领奖');
  await drawer.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await drawer.getByRole('button', { name: '关闭设备日志', exact: true }).click();
  await expect(drawer).toBeHidden();
});

test('selected log entries are deleted only after confirmation and stay deleted when reopened', async ({
  page,
}) => {
  await seedMonitor(page);
  await openMonitor(page);
  await logButton(page, '一号模拟器').click();
  const drawer = logDrawer(page);
  await drawer.getByRole('button', { name: '选择日志', exact: true }).click();
  await drawer.getByRole('checkbox', { name: '选择日志101', exact: true }).check();
  await drawer.getByRole('checkbox', { name: '选择日志104', exact: true }).check();
  await expect(drawer.locator('.monitor-log-toolbar').getByRole('status')).toHaveText('已选 2 条');
  await drawer.getByRole('button', { name: '删除所选', exact: true }).click();
  const confirm = drawer.getByRole('region', { name: '确认删除日志', exact: true });
  await expect(confirm).toContainText('删除所选 2 条日志？删除后无法恢复。');
  await confirm.getByRole('button', { name: '取消', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(
    drawer.getByRole('list', { name: '设备日志列表' }).getByRole('listitem'),
  ).toHaveCount(3);

  await drawer.getByRole('button', { name: '删除所选', exact: true }).click();
  await confirm.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(drawer.getByText('已删除 2 条日志', { exact: true })).toBeVisible();
  await expect(
    drawer.getByRole('list', { name: '设备日志列表' }).getByRole('listitem'),
  ).toHaveCount(1);
  await expect(drawer).not.toContainText('历史识别失败原因');
  expect(
    await page.evaluate(() =>
      (window as unknown as MonitorWindow).monitorState.calls
        .filter((item) => item.method === 'logs.delete')
        .map((item) => item.params),
    ),
  ).toEqual([{ ids: [104, 101] }]);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  await logButton(page, '一号模拟器').click();
  const reopened = logDrawer(page);
  await expect(
    reopened.getByRole('list', { name: '设备日志列表' }).getByRole('listitem'),
  ).toHaveCount(1);
  await expect(reopened).not.toContainText('历史识别失败原因');
  await expect(reopened).toContainText('一号模拟器进入作战');
});

test('late run details cannot overwrite a different inspected execution', async ({ page }) => {
  await seedMonitor(page, ['monitor-a']);
  await openMonitor(page);
  await openRunFromHistory(page, 'monitor-a');
  await expect
    .poll(() =>
      page.evaluate(
        () => !!(window as unknown as MonitorWindow).monitorState.releaseDetails['monitor-a'],
      ),
    )
    .toBe(true);
  await detailButton(page, '二号模拟器').click();
  await expect(detail(page)).toContainText('二号模拟器的独立任务结果');
  await page.evaluate(() => {
    (window as unknown as MonitorWindow).monitorState.releaseDetails['monitor-a']();
  });
  await expect(detail(page)).toContainText('二号模拟器的独立任务结果');
  await expect(detail(page)).not.toContainText('一号模拟器的独立任务结果');
  await detailButton(page, '四号模拟器').click();
  await expect(monitor(page)).toBeVisible();
  await expect(detail(page)).toHaveCount(0);
});

test('a delayed background start does not replace execution selected while it was pending', async ({
  page,
}) => {
  await seedMonitor(page);
  await openMonitor(page);
  await openRunFromHistory(page, 'monitor-a');
  await expect(detail(page)).toContainText('一号模拟器的独立任务结果');
  await page.evaluate(() => {
    (window as unknown as MonitorWindow).monitorState.holdStart = true;
  });
  await page
    .getByRole('contentinfo', { name: '执行状态栏', exact: true })
    .getByRole('button', { name: '多开执行', exact: true })
    .click();
  await page
    .getByRole('region', { name: '多开执行面板', exact: true })
    .getByRole('button', { name: '启动实例 四号模拟器', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => !!(window as unknown as MonitorWindow).monitorState.releaseStart),
    )
    .toBe(true);
  await page.evaluate(() => {
    (window as unknown as MonitorWindow).monitorState.releaseStart!();
  });
  await expect(page.locator('.toast')).toContainText('任务表已开始执行');
  await page.keyboard.press('Escape');
  await expect(detailButton(page, '一号模拟器')).toHaveAttribute('aria-pressed', 'true');
  await expect(detail(page)).toContainText('一号模拟器的独立任务结果');
});

test('a late editor start preserves a historical execution selected on another device', async ({
  page,
}) => {
  await seedMonitor(page);
  await page.evaluate(() => {
    const target = window as unknown as MonitorWindow;
    const run = target.monitorState.runs.find((item) => item.id === 'monitor-c')!;
    run.status = 'completed';
    run.progress = 100;
    run.finishedAt = new Date().toISOString();
    run.tasks = run.tasks?.map((task) => ({
      ...task,
      status: 'completed',
      finishedAt: run.finishedAt,
    }));
    target.monitorState.devices[2].state = 'idle';
    target.monitorState.holdStart = true;
    target.runtimeHarness.emitEvent('run.completed', { runId: run.id });
  });
  await selectDevice(page, 'monitor-device-4');
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  await page
    .getByRole('region', { name: '任务表列表', exact: true })
    .getByRole('button', { name: '查看任务表详情剿灭检查', exact: true })
    .click();
  await page
    .getByRole('region', { name: '任务表工作台', exact: true })
    .getByRole('button', { name: '开始执行', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => !!(window as unknown as MonitorWindow).monitorState.releaseStart),
    )
    .toBe(true);
  await page.getByRole('button', { name: '关闭任务表详情', exact: true }).click();
  await openRunFromHistory(page, 'monitor-failed');
  await expect(detail(page)).toContainText('历史识别');
  await expect(devicePicker(page)).toHaveAttribute('data-value', 'monitor-device-1');
  await page.evaluate(() => {
    (window as unknown as MonitorWindow).monitorState.releaseStart!();
  });
  await expect(page.locator('.toast')).toContainText('任务表已开始执行');
  await expect(page.getByRole('dialog', { name: '任务表详情', exact: true })).toHaveCount(0);
  await expect(page.locator('.primary-nav .nav-item[aria-current="page"]')).toHaveText('任务');
  await expect(page.getByRole('tab', { name: '执行监控', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(devicePicker(page)).toHaveAttribute('data-value', 'monitor-device-1');
  await expect(detailButton(page, '一号模拟器')).toHaveAttribute('aria-pressed', 'true');
  await expect(inspected(page)).toContainText('正在查看历史执行');
  await expect(detail(page)).toContainText('历史识别');
  await expect(
    detail(page).getByRole('region', { name: '本次执行总览', exact: true }),
  ).toContainText('执行失败');
  expect(
    await page.evaluate(() =>
      (window as unknown as MonitorWindow).monitorState.calls
        .filter((item) => item.method === 'run.start')
        .map((item) => item.params.deviceId),
    ),
  ).toEqual(['monitor-device-4']);
});

test('a selected run omitted from summaries still receives its final detail status', async ({
  page,
}) => {
  await seedMonitor(page);
  await openMonitor(page);
  await openRunFromHistory(page, 'monitor-a');
  await expect(detail(page)).toContainText('一号模拟器的独立任务结果');
  await page.evaluate(() => {
    const target = window as unknown as MonitorWindow;
    const run = target.monitorState.runs.find((item) => item.id === 'monitor-a')!;
    run.status = 'completed';
    run.progress = 100;
    run.finishedAt = new Date().toISOString();
    run.tasks = run.tasks?.map((task) => ({
      ...task,
      status: 'completed',
      finishedAt: run.finishedAt,
    }));
    target.monitorState.devices.find((device) => device.id === run.deviceId)!.state = 'idle';
    const call = target.runtimeHarness.call;
    target.runtimeHarness.call = async (method, params) => {
      const result = await call(method, params);
      if (method !== 'app.snapshot') return result;
      const snapshot = result as Snapshot;
      return { ...snapshot, runs: snapshot.runs.filter((item) => item.id !== run.id) };
    };
    target.runtimeHarness.emitEvent('run.completed', { runId: run.id });
  });
  await expect(
    detail(page).getByRole('region', { name: '本次执行总览', exact: true }),
  ).toContainText('已完成');
  await expect(inspected(page)).toContainText('正在查看历史执行');
  await expect(detail(page).getByRole('button', { name: '停止执行', exact: true })).toHaveCount(0);
});

test('task view tabs support arrow keys and keep only the selected tab in the tab order', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: '任务', exact: true }).click();
  const plans = page.getByRole('tab', { name: '任务表', exact: true });
  const execution = page.getByRole('tab', { name: '执行监控', exact: true });
  await plans.focus();
  await page.keyboard.press('ArrowRight');
  await expect(execution).toBeFocused();
  await expect(execution).toHaveAttribute('aria-selected', 'true');
  await expect(plans).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('Home');
  await expect(plans).toBeFocused();
  await expect(plans).toHaveAttribute('aria-selected', 'true');
  await expect(execution).toHaveAttribute('tabindex', '-1');
});
