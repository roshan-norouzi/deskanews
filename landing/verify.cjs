/* Run from the repository root: node landing/verify.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(require.resolve('@playwright/test', { paths: [path.join(__dirname, '../apps/web')] }));

(async () => {
  assert.ok(fs.existsSync(path.join(__dirname, 'index.html')), 'The standalone landing page must exist');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const output = path.join(__dirname, '../test-results/landing');
  fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    assert.equal(await page.locator('h1').count(), 1);
    await page.getByRole('tab', { name: /آماده‌سازی/ }).click();
    assert.match(await page.locator('#workflow-panel').innerText(), /ترجمه/);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.getByRole('tab', { name: /استودیوی اجتماعی/ }).getAttribute('aria-selected'), 'true');
    await page.getByRole('tab', { name: /انتشار/ }).click();
    assert.match(await page.locator('#workflow-panel').innerText(), /وردپرس/);
    await page.getByRole('tab', { name: 'روابط عمومی و شرکت‌ها', exact: true }).click();
    assert.match(await page.locator('#audience-panel').innerText(), /برند/);
    await page.locator('#faq summary').first().click();
    assert.equal(await page.locator('#faq details').first().getAttribute('open'), '');
    const missingTargets = await page.locator('a[href^="#"]').evaluateAll(links => links.filter(link => !document.getElementById(link.hash.slice(1))).map(link => link.hash));
    assert.deepEqual(missingTargets, []);
    for (const width of [1440, 1024, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      for (const tab of await page.locator('.workflow-tabs [role="tab"]').all()) {
        await tab.click();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`);
      }
    }
    await page.getByRole('button', { name: 'باز کردن فهرست' }).click();
    assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'false');
    await page.locator('#motion-toggle').click();
    assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'), 'true');
    await page.reload();
    assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'), 'true');
    await page.locator('#motion-toggle').click();
    assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'), 'false');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
    await page.screenshot({ path: path.join(output, 'mobile-hero.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
    await page.screenshot({ path: path.join(output, 'desktop-hero.png') });
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
    const plain = await browser.newPage({ javaScriptEnabled: false });
    await plain.goto(pathToFileURL(path.join(__dirname, 'index.html')).href);
    assert.ok(await plain.locator('h1').isVisible());
    assert.ok(await plain.locator('#features').isVisible());
    assert.ok(await plain.locator('#workflow-panel').isVisible());
    console.log('PASS: RTL, tabs, keyboard, FAQs, links, mobile menu, 5 viewport widths, reduced motion, no-JS content, zero browser errors.');
    console.log(`Screenshots: ${output}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
