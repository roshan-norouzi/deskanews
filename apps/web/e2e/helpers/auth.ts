import { expect, type Page } from '@playwright/test';

export const E2E_EMAIL = process.env.E2E_ADMIN_EMAIL || 'e2e-admin@deska.local';
export const E2E_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'DESKA-e2e-only-password-2026';

export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('ایمیل').fill(E2E_EMAIL);
  await page.getByLabel('رمز عبور').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'ورود' }).click();
  await expect(page).toHaveURL(/\/(dashboard|organizations|settings)$/u);
  if (new URL(page.url()).pathname === '/organizations') {
    await page.getByRole('button', { name: /ورود به میزکار/u }).first().click();
    await expect(page).toHaveURL(/\/dashboard$/u);
  }
}
