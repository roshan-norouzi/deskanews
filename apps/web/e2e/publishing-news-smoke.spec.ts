import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

test('news room page renders filters and empty state', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/publishing/news');
  await expect(page.getByRole('heading', { name: 'اتاق خبر' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'دریافت خبرهای جدید' })).toBeVisible();
  await expect(page.getByText('خبری در این بخش نیست').or(page.getByText(/\d+ خبر/u))).toBeVisible({ timeout: 15_000 });
});
