import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

test('account settings exposes MFA setup flow', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/settings?tab=account');
  await expect(page.getByRole('heading', { name: 'تأیید دو مرحله‌ای (MFA)' })).toBeVisible({ timeout: 15_000 });

  const setupButton = page.getByRole('button', { name: 'شروع راه‌اندازی MFA' });
  if (await setupButton.isVisible()) {
    await setupButton.click();
    await expect(page.getByText('کلید دستی:')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('کد ۶ رقمی اپ Authenticator')).toBeVisible();
  } else {
    await expect(page.getByText('تأیید دو مرحله‌ای فعال است').or(page.getByRole('button', { name: 'غیرفعال‌سازی MFA' }))).toBeVisible();
  }
});
