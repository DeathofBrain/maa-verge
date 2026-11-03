/** 显式历史夹具只恢复已有记录；历史兼容测试不借未迁移任务制造新执行。 */
import type { Page } from '@playwright/test';
import type { Run, Snapshot } from '../../../packages/contracts/src/types';
import type { RpcResult } from '../../../packages/contracts/src/index';
import type { HarnessWindow } from './desktop';

export function historicalCopilotRun(
  title: string,
  versionId: string,
  id = crypto.randomUUID(),
): Run {
  const at = '2026-10-24T08:00:00.000Z';
  return {
    id,
    planId: null,
    planName: title,
    sourceName: title,
    source: 'copilot',
    copilotKind: 'Copilot',
    deviceId: 'mock-device-1',
    status: 'stopped',
    progress: 30,
    message: '已停止；通关未确认',
    startedAt: at,
    finishedAt: at,
    copilotEntries: [
      {
        id: `${id}-entry`,
        versionId,
        title,
        nativeId: 1,
        status: 'stopped',
        verdict: 'unknown',
        message: '已停止；通关未确认',
      },
    ],
    tasks: [
      {
        index: 0,
        type: 'Copilot',
        status: 'stopped',
        message: '历史作业已停止',
        startedAt: at,
        finishedAt: at,
        drops: [],
        artifacts: [],
        infrastructure: [],
      },
    ],
  };
}

/** 直接恢复测试专属持久数据，再重新装载；不调用 run.start、copilot.start 或设备输入。 */
export async function restoreHistoricalRuns(page: Page, runs: Run[]) {
  await page.evaluate(async (runs) => {
    const api = (window as HarnessWindow).runtimeHarness;
    const snapshot = (await api.call('app.snapshot', {})) as Snapshot;
    // 写入原设置使合成 runtime 建立其标准存储键；不创建额外产品入口。
    await api.call('settings.save', { settings: snapshot.settings });
    const key = Object.keys(localStorage).find(
      (key) => key.startsWith('maaverge:test-runtime:v1:') && !key.endsWith(':copilot'),
    );
    if (!key) throw new Error('缺少隔离浏览器 runtime 存储键');
    localStorage.setItem(
      key,
      JSON.stringify({
        ...snapshot,
        runs: [...runs, ...snapshot.runs.filter((run) => !runs.some((next) => next.id === run.id))],
      }),
    );
  }, runs);
  await page.reload();
}

/** 已有结构化识别缓存直接从隔离存储恢复；不让未迁移的全量识别工具制造结果。 */
export async function restoreHistoricalRecognition(
  page: Page,
  results: RpcResult<'recognition.get'>[],
) {
  await page.evaluate(async (results) => {
    const api = (window as HarnessWindow).runtimeHarness;
    const snapshot = (await api.call('app.snapshot', {})) as Snapshot;
    await api.call('settings.save', { settings: snapshot.settings });
    const key = Object.keys(localStorage).find((key) =>
      key.startsWith('maaverge:test-recognition:v1:'),
    );
    if (!key) throw new Error('缺少隔离浏览器识别缓存存储键');
    localStorage.setItem(key, JSON.stringify(results));
  }, results);
  await page.reload();
}
