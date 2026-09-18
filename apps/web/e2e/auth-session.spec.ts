import { expect, test } from '@playwright/test';

test('login and logout clear the authenticated session', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL || 'e2e-admin@deska.local';
  const password = process.env.E2E_ADMIN_PASSWORD || 'DESKA-e2e-only-password-2026';

  await page.goto('/login');
  await page.getByLabel('ایمیل').fill(email);
  await page.getByLabel('رمز عبور').fill(password);
  await page.getByRole('button', { name: 'ورود' }).click();
  await expect(page).toHaveURL(/\/(dashboard|organizations|settings)$/u);

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'میز کار امروز' })).toBeVisible();

  await page.evaluate(async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: '{}',
    });
  });

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/u);
});
