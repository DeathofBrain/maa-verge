import { expect, test, type HarnessWindow } from './fixtures/desktop';
import { installAgentScenario } from './fixtures/agent-workspace';
import type { Snapshot } from '../../packages/contracts/src/types';

test('Agent stores ordinary answers separately from execution approval and reloads service sessions across navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installAgentScenario(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Agent 助手', exact: true }).click();
  await expect(page.getByLabel('会话标题')).toHaveValue('合成持久会话');
  await page.getByLabel('给 Agent 的消息').fill('为我准备一项任务');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  const question = page.getByRole('region', { name: '补充问题：选择关卡' });
  await expect(question).toBeVisible();
  await expect(page.getByRole('button', { name: '确认执行', exact: true })).toHaveCount(0);
  await question.getByLabel('回答：选择关卡').selectOption('stage-17');
  await question.getByRole('button', { name: '提交回答' }).click();
  const approval = page.getByRole('region', { name: '执行审批：执行任务表' });
  await expect(approval).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('agent-approval.png') });
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { agentScenarioCalls: { method: string; params: unknown }[] }
      ).agentScenarioCalls.filter((call) => call.method === 'agent.interaction.respond'),
    ),
  ).toEqual([
    {
      method: 'agent.interaction.respond',
      params: { interactionId: 'question-one', answer: { choices: ['stage-17'] } },
    },
  ]);
  await approval.getByRole('button', { name: '确认执行', exact: true }).click();
  await expect(page.getByText('已记录本次明确审批。', { exact: true })).toBeVisible();
  await page.locator('.sidebar').getByRole('button', { name: '主页', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Agent 助手', exact: true }).click();
  await expect(page.getByText('为我准备一项任务', { exact: true })).toBeVisible();
  await expect(page.getByText('已记录本次明确审批。', { exact: true })).toBeVisible();
});

test('MCP elicitation is an ordinary structured answer without an execution decision', async ({
  page,
}) => {
  await installAgentScenario(page, { mcpQuestion: true });
  await page.locator('.sidebar').getByRole('button', { name: 'Agent 助手', exact: true }).click();
  await page.getByLabel('给 Agent 的消息').fill('使用已选 MCP 工具');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  const question = page.getByRole('region', { name: '补充问题：补充 MCP 参数' });
  await expect(question).toBeVisible();
  await expect(page.getByRole('button', { name: '确认执行', exact: true })).toHaveCount(0);
  await question
    .getByLabel('回答：补充 MCP 参数')
    .fill('{"inputResponses":{"request-one":{"name":"合成值"}}}');
  await question.getByRole('button', { name: '提交回答', exact: true }).click();
  await expect(page.getByRole('region', { name: '执行审批：执行任务表' })).toBeVisible();
  const answers = await page.evaluate(() =>
    (
      window as unknown as { agentScenarioCalls: { method: string; params: unknown }[] }
    ).agentScenarioCalls.filter((call) => call.method === 'agent.interaction.respond'),
  );
  expect(answers).toEqual([
    {
      method: 'agent.interaction.respond',
      params: {
        interactionId: 'question-one',
        answer: { text: '{"inputResponses":{"request-one":{"name":"合成值"}}}' },
      },
    },
  ]);
});

test('interrupted Agent turns require explicit resume and can be cancelled', async ({ page }) => {
  await installAgentScenario(page, { interrupted: true });
  await page.locator('.sidebar').getByRole('button', { name: 'Agent 助手', exact: true }).click();
  await expect(page.getByText('已中断，可恢复：合成重启中断', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '恢复当前轮次', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消当前轮次', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消当前轮次', exact: true }).click();
  await expect(page.getByText('已取消', { exact: true })).toBeVisible();
  const methods = await page.evaluate(() =>
    (window as unknown as { agentScenarioCalls: { method: string }[] }).agentScenarioCalls.map(
      (call) => call.method,
    ),
  );
  expect(methods.filter((method) => method === 'agent.turn.resume')).toHaveLength(1);
  expect(methods.filter((method) => method === 'agent.turn.cancel')).toHaveLength(1);
});

test('account memory can be created, revised and deleted from the current service session', async ({
  page,
}) => {
  await installAgentScenario(page);
  await page.locator('.sidebar').getByRole('button', { name: 'Agent 助手', exact: true }).click();
  await expect(page.getByLabel('会话标题')).toHaveValue('合成持久会话');
  await page.getByRole('tab', { name: '长期记忆', exact: true }).click();
  const panel = page.getByRole('region', { name: '长期记忆管理', exact: true });
  await panel.getByLabel('记忆名称', { exact: true }).fill('合成偏好');
  await panel.getByLabel('记忆内容', { exact: true }).fill('消耗额度默认是零');
  await panel.getByRole('button', { name: '添加记忆', exact: true }).click();
  await expect(panel.getByText('消耗额度默认是零', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '编辑记忆', exact: true }).click();
  await panel.getByLabel('记忆内容', { exact: true }).fill('使用任务表前先确认');
  await panel.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(panel.getByText('使用任务表前先确认', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '删除记忆', exact: true }).click();
  await expect(panel.getByText('暂无长期记忆。', { exact: true })).toBeVisible();
  const writes = await page.evaluate(() =>
    (
      window as unknown as { agentScenarioCalls: { method: string; params: unknown }[] }
    ).agentScenarioCalls.filter((call) =>
      ['agent.memory.save', 'agent.memory.delete'].includes(call.method),
    ),
  );
  expect(writes).toEqual([
    {
      method: 'agent.memory.save',
      params: {
        sessionId: 'session-one',
        key: '合成偏好',
        content: '消耗额度默认是零',
        scope: 'account',
      },
    },
    {
      method: 'agent.memory.save',
      params: {
        id: 'memory-one',
        revision: 1,
        sessionId: 'session-one',
        key: '合成偏好',
        content: '使用任务表前先确认',
        scope: 'account',
      },
    },
    { method: 'agent.memory.delete', params: { id: 'memory-one', revision: 2 } },
  ]);
});

test('bounded mission prepares plan, saved tool config and existing Copilot queue for separate approval', async ({
  page,
}) => {
  await installAgentScenario(page, { missionTargets: true });
  await page.locator('.sidebar').getByRole('button', { name: 'Agent 助手', exact: true }).click();
  await expect(page.getByLabel('会话标题')).toHaveValue('合成持久会话');
  await page.getByLabel('Agent 模式', { exact: true }).selectOption('goal');
  await page.getByRole('tab', { name: '托管授权', exact: true }).click();
  const panel = page.getByRole('region', { name: '托管授权管理', exact: true });
  await panel.getByLabel('每日长草计划', { exact: true }).check();
  await panel.getByLabel('仓库', { exact: true }).check();
  await panel.getByLabel('普通作业（1 项）', { exact: true }).check();
  await panel.getByRole('button', { name: '准备托管授权', exact: true }).click();
  await expect(
    page.getByRole('region', { name: '执行审批：有限托管审批', exact: true }),
  ).toBeVisible();
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          agentScenarioCalls: { method: string; params: Record<string, unknown> }[];
        }
      ).agentScenarioCalls,
  );
  expect(calls.find((call) => call.method === 'tool.config.get')?.params).toEqual({
    deviceId: 'mock-device-1',
    clientType: 'Official',
    kind: 'depot',
  });
  expect(calls.find((call) => call.method === 'agent.mission.create')?.params).toMatchObject({
    sessionId: 'session-one',
    maxExecutions: 1,
    medicine: 0,
    stone: 0,
    targets: [
      { kind: 'plan', planId: 'daily' },
      { kind: 'tool', toolKind: 'depot', config: { mode: 'device', updateDepot: false } },
      { kind: 'copilot', copilotKind: 'Copilot' },
    ],
  });
  expect(
    calls.some((call) => ['run.start', 'tool.start', 'copilot.start'].includes(call.method)),
  ).toBe(false);
});

test('model credential input uses explicit session storage, clears after save, and stays out of ordinary settings', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const api = (window as HarnessWindow).runtimeHarness;
    const snapshot = (await api.call('app.snapshot', {})) as Snapshot;
    await api.call('settings.save', {
      settings: {
        ...snapshot.settings,
        model: {
          provider: 'openai-compatible',
          baseUrl: 'https://synthetic.example/v1',
          model: 'synthetic-model',
        },
      },
    });
    const original = api.call;
    let configured = false;
    api.call = async (method, params) => {
      if (method === 'model.credential.set') {
        if (params.storage !== 'session') throw new Error('Expected explicit session choice');
        configured = true;
        return { configured: true, available: true, storage: 'session' };
      }
      if (method === 'model.credential.status')
        return { configured, available: true, storage: configured ? 'session' : 'none' };
      if (method === 'model.credential.delete') {
        configured = false;
        return { configured: false, available: true, storage: 'none' };
      }
      return original(method, params);
    };
    api.emitEvent('settings.saved');
  });
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '设置分类' })
    .getByRole('button', { name: '模型与 Agent', exact: true })
    .click();
  await page.getByLabel('模型 API 密钥', { exact: true }).fill('synthetic-secret-sentinel');
  await page.getByLabel('密钥保存方式', { exact: true }).selectOption('session');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(page.getByLabel('模型 API 密钥', { exact: true })).toHaveValue('');
  await expect(page.getByText('已配置凭据', { exact: true })).toBeVisible();
  const persisted = await page.evaluate(async () => ({
    snapshot: await (window as HarnessWindow).runtimeHarness.call('app.snapshot', {}),
    browser: JSON.stringify(localStorage),
  }));
  expect(JSON.stringify(persisted)).not.toContain('synthetic-secret-sentinel');
  await page.getByRole('button', { name: '删除密钥', exact: true }).click();
  await expect(page.getByText('待配置凭据', { exact: true })).toBeVisible();
});
