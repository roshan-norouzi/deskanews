# Deska Worker

Cloudflare Worker واحد برای **دریافت** صفحات تلگرام، X/Twitter، و رسانه‌های بین‌المللی که از ایران در دسترس نیستند، و **relaying** تست/انتشار تلگرام برای API سرور.

> Workerهای قدیمی (`source-fetch`, `telegram-bridge`, …) را از داشبورد Cloudflare حذف کنید و فقط **`deska`** نگه دارید.

پس از تغییر این پوشه:

```bash
pnpm worker:deploy
```

URL نهایی: `https://deska.<account>.workers.dev` — در **تنظیمات پلتفرم → Worker دریافت منبع** ثبت کنید.

رمز مشترک (اختیاری): `npx wrangler secret put BRIDGE_SECRET`

## API

`POST /` — قرارداد با `SourceReaderService.safeFetchTextViaBridge` (فیلد `body` در پاسخ).

- تلگرام و X مثل قبل از همین Worker می‌آیند.
- اگر سرور ایران به RSS یا صفحه یک رسانه بین‌المللی نرسد (مسدود، ۴۰۳، قطع ارتباط)، API همان آدرس را از Worker دوباره می‌گیرد.
- سایت‌های بدون RSS همچنان به‌صورت صفحه فهرست مطالب پایش می‌شوند؛ فقط دریافت HTML از Worker انجام می‌شود.
- آدرس‌های خصوصی و localhost پذیرفته نمی‌شوند.
