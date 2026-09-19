# منسوخ — حذف شود

این پوشه جایگزین شده است با **`workers/deska`**.

- Deploy: `pnpm worker:deploy`
- تنظیمات: `/platform/source-fetch`

پوشه `workers/source-fetch` را پس از توقف `wrangler dev` محلی حذف کنید.

Workerهای Cloudflare قدیمی برای حذف دستی:
- `source-fetch`
- `telegram-bridge`

فقط Worker **`deska`** باید باقی بماند.
