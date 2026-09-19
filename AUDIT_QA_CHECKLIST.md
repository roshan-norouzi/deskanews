# چک‌لیست QA دستی — Deska News

> برای regression بعد از deploy یا تغییرات بزرگ  
> پیش‌نیاز: `pnpm start` → Web **3100**، API **3101**، Postgres **5434**

---

## راه‌اندازی

```powershell
cd "D:\My Software Projects - NEW\Deska News"
pnpm start
# یا اگر dev از قبل روشن است:
pnpm verify:live
```

**ورود:** credentials در `.env` (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`)

**تست خودکار سریع:**

```powershell
node scripts/audit-e2e-check.cjs
pnpm --filter @deska/api test
pnpm verify:live   # فقط وقتی dev روشن است
pnpm verify        # typecheck + build + test + runtime
```

---

## چک‌لیست عملکردی

| ✓ | # | مرحله | مسیر / اقدام | انتظار |
|---|--|--------|--------------|--------|
| ☐ | 1 | Login | `/login` | ورود موفق، redirect داشبورد |
| ☐ | 2 | Logout | منوی کاربر | session پاک، برگشت login |
| ☐ | 3 | سازمان | `/organizations` | لیست/ساخت/سوئیچ |
| ☐ | 4 | داشبورد | `/dashboard` | آمار بدون 500 |
| ☐ | 5 | Worker | `/platform/source-fetch` | URL=`https://deska.roshan-norouzi.workers.dev` + تست OK |
| ☐ | 6 | RSS | `/publishing/feeds` → probe | irna.ir/rss — ≥۱ مطلب |
| ☐ | 7 | Website | probe | isna.ir — بدون crash |
| ☐ | 8 | Telegram | probe `t.me/s/telegram` | مطلب بدون bot token |
| ☐ | 9 | X | probe `x.com/nasa` | مطلب (یا 429 موقت — retry) |
| ☐ | 10 | اتاق خبر | `/publishing/news` | تغییر وضعیت / آماده‌سازی |
| ☐ | 11 | استودیو | `/publishing/social` | لیست + prepare (بدون publish واقعی OK) |
| ☐ | 12 | منابع پیش‌فرض | `/publishing/feeds` بخش پلتفرم | فعال/غیرفعال tenant |
| ☐ | 13 | کاتالوگ admin | `/platform/feeds` | CRUD super admin |
| ☐ | 14 | تنظیمات انتشار | `/publishing/settings` | ذخیره؛ secrets mask در GET |
| ☐ | 15 | AI سراسری | `/platform/ai-settings` | فقط super admin |
| ☐ | 16 | مرکز عملیات | `/publishing/operations` | jobs/خطا خوانا |
| ☐ | 17 | نقش محدود | viewer/editor | `/platform/*` → 403 یا مخفی |
| ☐ | 18 | Regression Worker | خالی کردن URL Worker | telegram/X → پیام راهنما نه crash |

---

## چک‌لیست امنیت سریع

| ✓ | مورد | روش |
|---|------|-----|
| ☐ | Tenant isolation | دو سازمان؛ ID مقاله سازمان دیگر → 404 |
| ☐ | Platform guard | non-super → `GET /api/platform/overview` → 403 |
| ☐ | Secret leak | `GET /api/publishing/settings` — keys خالی یا `***` |
| ☐ | SSRF | probe `http://127.0.0.1` → رد |
| ☐ | Worker only | telegram بدون Worker config → BadRequest راهنما |

---

## چک‌لیست یکپارچگی جریان

```
منبع → ingest (job/news article)
اتاق خبر → ارسال به استودیو
استودیو → prepare (GapGPT)
Worker config → فقط همان URL برای t.me/x.com
حذف منبع → بدون orphan FK (Prisma onDelete)
```

---

## عیب‌یابی رایج

| علامت | اقدام |
|--------|--------|
| Web 500 | `pnpm restart:web` |
| API ECONNREFUSED | `pnpm start` یا rebuild api |
| schema drift | migrate: `pnpm --filter @deska/api exec prisma migrate deploy` |
| verify + dev conflict | `pnpm verify:live` نه verify کامل |

---

*مرجع: AUDIT_MAP.md، AUDIT_FIX_REPORT.md*
