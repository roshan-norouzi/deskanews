# Deska Worker

Cloudflare Worker واحد برای **دریافت** صفحات تلگرام و X/Twitter.

> Workerهای قدیمی (`source-fetch`, `telegram-bridge`, …) را از داشبورد Cloudflare حذف کنید و فقط **`deska`** نگه دارید.

## استقرار

```bash
cd workers/deska
npm install
npx wrangler login
pnpm worker:deploy
```

URL نهایی: `https://deska.<account>.workers.dev` — در **پنل مدیر کل → Worker Deska** (`/platform/source-fetch`) ثبت کنید.

رمز مشترک (اختیاری): `npx wrangler secret put BRIDGE_SECRET`

## API

`POST /` — قرارداد با `SourceReaderService.safeFetchTextViaBridge` (فیلد `body` در پاسخ).
