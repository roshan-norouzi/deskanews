const path = require('node:path');
const { chromium } = require(require.resolve('@playwright/test', { paths: [path.join(__dirname, '../../apps/web')] }));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:4173/?logo=updated', { waitUntil: 'networkidle' });
  const logo = page.locator('.brand-logo').first();
  console.log(await logo.evaluate(node => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return { src: node.currentSrc, naturalWidth: node.naturalWidth, naturalHeight: node.naturalHeight, display: style.display, opacity: style.opacity, visibility: style.visibility, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  }));
  await logo.screenshot({ path: 'test-results/landing/header-logo-only.png' });
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
