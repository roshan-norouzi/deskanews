const fs = require('node:fs');
const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/u)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/u);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/gu, '');
}

(async () => {
  const login = await fetch('http://localhost:3100/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }),
  });
  const cookie = login.headers.get('set-cookie');
  const me = await fetch('http://localhost:3100/api/auth/me', { headers: { Cookie: cookie } }).then((r) => r.json());
  const h = { Cookie: cookie, 'Content-Type': 'application/json', 'X-Tenant-Id': me.tenants[0].id };
  for (const body of [
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', sourceType: 'rss' },
    { url: 'https://www.irna.ir/rss', sourceType: 'rss' },
    { url: 'https://t.me/s/telegram', sourceType: 'telegram' },
    { url: 'https://x.com/nasa', sourceType: 'twitter' },
  ]) {
    const r = await fetch('http://localhost:3100/api/publishing/feeds/probe', { method: 'POST', headers: h, body: JSON.stringify(body) });
    const t = await r.text();
    console.log('\n---', body.sourceType, body.url);
    console.log('status', r.status);
    console.log(t.slice(0, 400));
  }
})();
