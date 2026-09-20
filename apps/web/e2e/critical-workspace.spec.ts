import { expect, test } from '@playwright/test';

test('critical workspace, notification, and publishing operations journey', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL || 'e2e-admin@deska.local';
  const password = process.env.E2E_ADMIN_PASSWORD || 'DESKA-e2e-only-password-2026';

  await page.goto('/login');
  await page.getByLabel('ایمیل').fill(email);
  await page.getByLabel('رمز عبور').fill(password);
  await page.getByRole('button', { name: 'ورود' }).click();

  await expect(page).toHaveURL(/\/(dashboard|organizations)$/u, { timeout: 30_000 });
  if (new URL(page.url()).pathname === '/organizations') {
    const enterWorkspace = page.getByRole('button', { name: /ورود به میزکار/u }).first();
    await expect(enterWorkspace).toBeVisible({ timeout: 15_000 });
    await enterWorkspace.click();
    await expect(page).toHaveURL(/\/dashboard$/u, { timeout: 30_000 });
  }
  await expect(page.getByRole('heading', { name: 'داشبورد' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'اعلان‌ها' })).toBeVisible();
  await expect(page.getByText('سازمان‌های من')).toBeVisible();

  await page.goto('/publishing/operations');
  await expect(page.getByRole('heading', { name: 'مرکز عملیات' })).toBeVisible({ timeout: 30_000 });
  await page.waitForResponse(
    (response) => response.url().includes('/publishing/operations') && response.ok(),
    { timeout: 30_000 },
  );
  await expect(page.getByRole('heading', { name: 'سلامت اتصال‌ها' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'فرایندهای نیازمند رسیدگی' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ثبت رویدادهای مدیریتی' })).toBeVisible();
});
