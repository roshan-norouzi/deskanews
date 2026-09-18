import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

test('publishing settings tabs load and AI settings save', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/publishing/settings');
  await expect(page.getByRole('tab', { name: 'هوش مصنوعی' })).toBeVisible();

  await page.getByRole('tab', { name: 'استودیوی اجتماعی' }).click();
  await page.getByRole('tab', { name: 'کتابخانه فونت' }).click();
  await expect(page.getByRole('heading', { name: 'ایجاد خانواده فونت' })).toBeVisible();

  await page.getByRole('tab', { name: 'پایش خبر' }).click();
  await page.getByRole('tab', { name: 'زمان‌بندی پایش' }).click();
  await expect(page.getByText('بازه پایش خودکار')).toBeVisible();

  await page.getByRole('tab', { name: 'هوش مصنوعی' }).click();
  await page.getByRole('button', { name: 'ذخیره' }).click();
  await expect(page.getByText('تنظیمات این بخش با موفقیت ذخیره شد')).toBeVisible({ timeout: 15_000 });
});
