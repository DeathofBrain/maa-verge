import { expect, test } from './fixtures/desktop';
import { installAgentScenario } from './fixtures/agent-workspace';
import { navigate } from './fixtures/navigation';

test('search and multiline inputs preserve casing through blur and message submission', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installAgentScenario(page);
  await navigate(page, '作业中心');
  const search = page.getByRole('searchbox', { name: '搜索本地作业', exact: true });
  await expect(search).toHaveAttribute('autocapitalize', 'none');
  await expect(search).toHaveAttribute('autocorrect', 'off');
  await search.fill('r8-11 AbC');
  await search.press('Tab');
  await expect(search).toHaveValue('r8-11 AbC');

  await navigate(page, 'Agent 助手');
  const message = 'r8-11 AbC\npR-a-1 xYz';
  const composer = page.getByLabel('给 Agent 的消息', { exact: true });
  await expect(composer).toHaveAttribute('autocapitalize', 'none');
  await expect(composer).toHaveAttribute('autocorrect', 'off');
  await composer.fill(message);
  await composer.press('Tab');
  await expect(composer).toHaveValue(message);
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await navigate(page, '主页');
  await navigate(page, 'Agent 助手');
  await expect(page.getByText(message, { exact: true })).toBeVisible();
});
