import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

test('social studio page renders status filters', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/publishing/social');
  await expect(page.getByRole('heading', { name: 'استودیوی اجتماعی' })).toBeVisible();
  await expect(page.getByText('فید فعال')).toBeVisible();
  await expect(page.getByText('مطالب اجتماعی').or(page.getByText('مطالب آرشیوشده'))).toBeVisible();
  await expect(page.getByText('مطلبی در این وضعیت وجود ندارد').or(page.getByText(/\d+ مورد/u))).toBeVisible({ timeout: 15_000 });
});
