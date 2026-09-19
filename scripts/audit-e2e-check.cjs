#!/usr/bin/env node
/**
 * Manual audit checklist runner — hits local web proxy (3100) like the UI.
 * Usage: node scripts/audit-e2e-check.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const base = 'http://localhost:3100';

function readEnv() {
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/u)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/u);
    if (m) out[m[1].trim()] = m[2].trim().replace(/^["']|["']$/gu, '');
  }
  return out;
}

const env = readEnv();
const email = env.SEED_ADMIN_EMAIL || env.ADMIN_EMAIL;
const password = env.SEED_ADMIN_PASSWORD || env.ADMIN_PASSWORD;

const results = [];

function record(id, name, status, detail = '') {
  results.push({ id, name, status, detail });
  const mark = status === 'OK' ? '✔' : status === 'SKIP' ? '○' : '✖';
  console.log(`${mark} ${id}. ${name}${detail ? ` — ${detail}` : ''}`);
}

async function json(method, urlPath, { body, headers = {}, cookie = '' } = {}) {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const setCookie = res.headers.get('set-cookie') || '';
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, setCookie, text };
}

function mergeCookies(existing, setCookie) {
  const jar = new Map();
  for (const part of `${existing}; ${setCookie}`.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k) jar.set(k, rest.join('='));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function main() {
  if (!email || !password) {
    console.error('Missing SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env');
    process.exit(1);
  }

  let cookie = '';
  let tenantId = '';

  // 1. Login
  try {
    const login = await json('POST', '/api/auth/login', { body: { email, password } });
    if (login.status !== 200 && login.status !== 201) throw new Error(`HTTP ${login.status}`);
    cookie = mergeCookies(cookie, login.setCookie);
    const me = await json('GET', '/api/auth/me', { cookie });
    if (me.status !== 200) throw new Error(`/me HTTP ${me.status}`);
    tenantId = me.data?.tenants?.[0]?.id;
    if (!tenantId) throw new Error('no tenant');
    record(1, 'Login / session', 'OK', me.data.email);
  } catch (e) {
    record(1, 'Login / session', 'FAIL', e.message);
    printTable();
    process.exit(1);
  }

  const tenantHeaders = { 'X-Tenant-Id': tenantId };

  // 2. Organization
  try {
    const orgs = await json('GET', '/api/tenants', { cookie });
    if (orgs.status !== 200 || !Array.isArray(orgs.data)) throw new Error(`HTTP ${orgs.status}`);
    record(2, 'سازمان‌ها', 'OK', `${orgs.data.length} سازمان`);
  } catch (e) {
    record(2, 'سازمان‌ها', 'FAIL', e.message);
  }

  // 3. Dashboard
  try {
    const dash = await json('GET', '/api/dashboard/stats', { cookie, headers: tenantHeaders });
    if (dash.status !== 200) throw new Error(`HTTP ${dash.status}`);
    record(3, 'داشبورد', 'OK');
  } catch (e) {
    record(3, 'داشبورد', 'FAIL', e.message);
  }

  // 4. Worker source-fetch settings
  try {
    const sf = await json('GET', '/api/platform/source-fetch-settings', { cookie });
    if (sf.status !== 200) throw new Error(`HTTP ${sf.status}`);
    const url = sf.data?.source_fetch_bridge_url || '';
    if (!url) {
      record(4, 'Worker دریافت منبع', 'SKIP', 'URL خالی — تست اتصال رد شد');
    } else {
      const test = await json('POST', '/api/platform/source-fetch-settings/test', {
        cookie,
        body: { source_fetch_bridge_url: url, source_fetch_bridge_secret: sf.data?.source_fetch_bridge_secret || '' },
      });
      if (test.status !== 200 && test.status !== 201) throw new Error(`test HTTP ${test.status}`);
      if (!test.data?.ok) throw new Error(test.data?.message || 'test failed');
      record(4, 'Worker دریافت منبع', 'OK', test.data.message);
    }
  } catch (e) {
    record(4, 'Worker دریافت منبع', 'FAIL', e.message);
  }

  async function probe(label, id, body) {
    try {
      const res = await json('POST', '/api/publishing/feeds/probe', { cookie, headers: tenantHeaders, body });
      if (res.status >= 400) {
        const msg = res.data?.message || res.text?.slice(0, 120) || `HTTP ${res.status}`;
        if ((body.sourceType === 'telegram' || body.sourceType === 'twitter') && /Worker|source-fetch|source_fetch|ثبت نشده/u.test(msg)) {
          const sf = await json('GET', '/api/platform/source-fetch-settings', { cookie });
          const bridgeUrl = sf.data?.source_fetch_bridge_url || '';
          if (!bridgeUrl) {
            record(id, label, 'OK', 'خطای راهنما (Worker خالی)');
            return;
          }
        }
        throw new Error(msg);
      }
      const count = Array.isArray(res.data?.items) ? res.data.items.length : (Array.isArray(res.data?.entries) ? res.data.entries.length : 0);
      record(id, label, 'OK', `${count} مورد`);
    } catch (e) {
      record(id, label, 'FAIL', e.message);
    }
  }

  // 5–8. Source probes
  await probe('منبع RSS', 5, { url: 'https://www.irna.ir/rss', sourceType: 'rss' });
  await probe('منبع website', 6, { url: 'https://www.isna.ir', sourceType: 'website' });
  await probe('منبع تلگرام', 7, { url: 'https://t.me/s/telegram', sourceType: 'telegram' });
  await probe('منبع X', 8, { url: 'https://x.com/nasa', sourceType: 'twitter' });

  // 9. Newsroom list
  try {
    const news = await json('GET', '/api/publishing/news/articles', { cookie, headers: tenantHeaders });
    if (news.status !== 200) throw new Error(`HTTP ${news.status}`);
    record(9, 'اتاق خبر (لیست)', 'OK', `${Array.isArray(news.data) ? news.data.length : 0} مطلب`);
  } catch (e) {
    record(9, 'اتاق خبر (لیست)', 'FAIL', e.message);
  }

  // 10. Social studio
  try {
    const social = await json('GET', '/api/publishing/social/articles', { cookie, headers: tenantHeaders });
    if (social.status !== 200) throw new Error(`HTTP ${social.status}`);
    record(10, 'استودیوی اجتماعی', 'OK');
  } catch (e) {
    record(10, 'استودیوی اجتماعی', 'FAIL', e.message);
  }

  // 11. Platform feeds (tenant view)
  try {
    const pf = await json('GET', '/api/publishing/platform-feeds', { cookie, headers: tenantHeaders });
    if (pf.status !== 200) throw new Error(`HTTP ${pf.status}`);
    record(11, 'منابع پیش‌فرض (سازمان)', 'OK', `${Array.isArray(pf.data) ? pf.data.length : 0} مورد`);
  } catch (e) {
    record(11, 'منابع پیش‌فرض (سازمان)', 'FAIL', e.message);
  }

  // 12. Settings — no secret leak
  try {
    const settings = await json('GET', '/api/publishing/settings', { cookie, headers: tenantHeaders });
    if (settings.status !== 200) throw new Error(`HTTP ${settings.status}`);
    const leaked = ['gapgpt_api_key', 'wp_app_password', 'telegram_bot_token'].filter(
      (k) => settings.data?.[k] && !String(settings.data[k]).includes('***'),
    );
    if (leaked.length) throw new Error(`secret visible: ${leaked.join(', ')}`);
    record(12, 'تنظیمات انتشار (بدون نشت secret)', 'OK');
  } catch (e) {
    record(12, 'تنظیمات انتشار (بدون نشت secret)', 'FAIL', e.message);
  }

  // 13. Operations
  try {
    const ops = await json('GET', '/api/publishing/operations', { cookie, headers: tenantHeaders });
    if (ops.status !== 200) throw new Error(`HTTP ${ops.status}`);
    record(13, 'مرکز عملیات', 'OK');
  } catch (e) {
    record(13, 'مرکز عملیات', 'FAIL', e.message);
  }

  // 14. Platform overview (super admin should pass)
  try {
    const overview = await json('GET', '/api/platform/overview', { cookie });
    if (overview.status !== 200) throw new Error(`HTTP ${overview.status}`);
    record(14, 'دسترسی platform admin', 'OK', 'super admin');
  } catch (e) {
    record(14, 'دسترسی platform admin', 'FAIL', e.message);
  }

  // 15. AI settings super admin
  try {
    const ai = await json('GET', '/api/platform/ai-settings', { cookie });
    if (ai.status !== 200) throw new Error(`HTTP ${ai.status}`);
    record(15, 'تنظیمات AI سراسری', 'OK');
  } catch (e) {
    record(15, 'تنظیمات AI سراسری', 'FAIL', e.message);
  }

  // Logout
  try {
    const logout = await json('POST', '/api/auth/logout', { cookie });
    if (logout.status !== 200 && logout.status !== 201) throw new Error(`HTTP ${logout.status}`);
    record('—', 'Logout', 'OK');
  } catch (e) {
    record('—', 'Logout', 'FAIL', e.message);
  }

  printTable();
  const failed = results.filter((r) => r.status === 'FAIL');
  process.exit(failed.length ? 1 : 0);
}

function printTable() {
  console.log('\n=== E2E Summary ===');
  for (const r of results) {
    console.log(`| ${r.id} | ${r.name} | ${r.status} | ${r.detail || ''} |`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
