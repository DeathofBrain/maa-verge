import { expect, type Page } from '@playwright/test';

export const devicePicker = (page: Page) =>
  page.getByRole('combobox', { name: '选择设备', exact: true });

export const deviceOptions = (page: Page) =>
  page.getByRole('listbox', { name: '设备列表', exact: true });

export const deviceOption = (page: Page, id: string) =>
  deviceOptions(page).locator(`[role="option"][data-value=${JSON.stringify(id)}]`);

export async function selectDevice(page: Page, id: string) {
  const picker = devicePicker(page);
  if ((await picker.getAttribute('aria-expanded')) !== 'true') await picker.click();
  await deviceOption(page, id).click();
  await expect(picker).toHaveAttribute('data-value', id);
}
