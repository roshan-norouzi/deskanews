const path = require('node:path');
const { chromium } = require(require.resolve('@playwright/test', { paths: [path.join(__dirname, '../../apps/web')] }));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [width, name] of [[1440, 'workflow-prepare-desktop'], [390, 'workflow-prepare-mobile']]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto('http://127.0.0.1:4173/?workflow=updated', { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: /آماده‌سازی/ }).click();
    await page.locator('#workflow-panel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/landing/${name}.png`, fullPage: false });
    console.log(JSON.stringify({ width, sources: await page.locator('.source-language-item').count(), languageChips: await page.locator('.language-chips span').count(), overflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) }));
    await page.close();
  }
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
