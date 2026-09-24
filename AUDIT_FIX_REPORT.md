# گزارش ممیزی و اصلاحات — Deska News

> تاریخ: ۱۴۰۴/۰۶/۲۸  
> مسیر: `D:\My Software Projects - NEW\Deska News`

---

## ۱. خلاصه اجرایی

پلتفرم Deska News (SaaS میز خبر B2B) از نظر معماری، امنیت پایه، Worker دریافت منبع، و جداسازی tenant در وضعیت **قابل قبول و پایدار** است. در این ممیزی:

| حوزه | قبل | بعد |
|------|-----|-----|
| Worker URL | احتمال hardcode / env پراکنده | فقط `PlatformConfig` + UI `/platform/source-fetch` |
| Platform admin API | نقش `admin` هم مجاز بود | فقط **super admin** |
| ERP leftover | `DESKA ERP API` در bootstrap | `Deska News API` |
| تست‌های API | ۷ شکست (mock ناقص `usageTracking`) | **۸۳/۸۳ سبز** |
| verify | گاهی schema drift با `SkipMigrate` | `pnpm start` migrate+seed؛ verify سبز |
| glossary UI | «Worker Deska» / «کانال‌های انتشار» | «Worker دریافت منبع» / «شبکه‌های انتشار» |

**باقی‌مانده P2:** صفحه `/publishing/media` stub، فیلدهای HR در schema، rate-limit موقت X (429)، شبکه BBC از ایران.

---

## ۲. فاز ۱ — یافته‌های ماژول‌به‌ماژول

### A) Auth و نشست — OK
- JWT + refresh hash، lock پس از login ناموفق، rotate refresh — تست‌شده.
- `/api/auth/*` و guard سراسری JWT فعال.

### B) Tenancy — OK (P0 محافظت‌شده)
- `TenantGuard` + permission checks — ۸۳ تست regression شامل IDOR.
- Super-admin نمی‌تواند tenant-id جعلی بسازد.

### C) Sources / Feeds — OK با ملاحظات
- RSS/website: fetch مستقیم SSRF-safe.
- telegram/x: **اجباری** از Worker (`hostRequiresSourceBridge`).
- بدون Worker → `SOURCE_FETCH_BRIDGE_MISSING_MESSAGE` (راهنما به `/platform/source-fetch`).
- **P2:** probe BBC از شبکه لوکال `ECONNRESET`؛ IRNA/ISNA پایدارتر.

### D) میز خبر — OK
- چرخه وضعیت، automation jobs، GapGPT overlay سراسری.

### E) استودیوی اجتماعی — OK
- ingest (Worker) جدا از publish (bot token/chat_id tenant).
- cover renderer + usage tracking.

### F) کانال‌ها / رسانه / عملیات — نیمه‌کاره
- **P2:** `/publishing/media` فقط empty-state؛ API لیست رسانه ندارد.
- مرکز عملیات و IntegrationHealth زنده.

### G) تنظیمات انتشار و AI — OK
- AI keys فقط `PlatformConfig` (super admin).
- secrets در GET tenant mask می‌شوند — E2E تأیید شد.

### H) UI/UX فارسی — بهبود یافته
- منوی پلتفرم فقط super admin.
- منابع پیش‌فرض در `/publishing/feeds` برای مالک سازمان.

### I) Worker — OK
- کد فعال: `workers/deska/`
- `workers/source-fetch/` deprecated
- **هیچ hardcode runtime** برای URL Worker در کد اپ (فقط env bootstrap یک‌بار در migration).

---

## ۳. فهرست باگ‌ها

| ID | شدت | مسیر | Reproduce | وضعیت |
|----|-----|------|-----------|--------|
| B-01 | P1 | `platform-admin.service.ts` | کاربر platform `admin` به `/platform/overview` دسترسی داشت | **رفع** — `assertAdmin` → super only |
| B-02 | P1 | `news-language-processing.test.cjs` | ۷ تست social بعد از افزودن `UsageTrackingService` | **رفع** — mock ششم/هشتم پارام |
| B-03 | P1 | `source-reader-security.test.cjs` | تست bridge بدون mock `publishingSettings` | **رفع** — mock bridge config |
| B-04 | P2 | `main.ts` (قبلی) | log «DESKA ERP API» | **رفع** → Deska News |
| B-05 | P2 | `navigation.ts` | لینک channels به redirect | **رفع** → شبکه‌های انتشار |
| B-06 | P2 | `/publishing/media` | صفحه بدون API | **باقی** — مستند در AUDIT_MAP |
| B-07 | P2 | `schema.prisma` User | فیلدهای HR ERP | **باقی** — migration بعدی |
| B-08 | P2 | E2E X probe | Worker 429 از syndication.twitter | **محیطی** — retry بعداً |

---

## ۴. فاز ۲ — امنیت

| کنترل | وضعیت | جزئیات |
|--------|--------|--------|
| Authn/Authz | ✅ | JWT + permission guards؛ platform super-only |
| IDOR / tenant | ✅ | تست‌های `security-regressions.test.cjs` |
| SSRF | ✅ | DNS pin، block private IP، redirect validation |
| Worker / bridge | ✅ | t.me/x.com فقط از bridge؛ بدون URL → خطای راهنما |
| Secret handling | ✅ | encrypt at rest؛ mask in API؛ AI global |
| XSS | ⚠️ P2 | HTML تلگرam parse — cheerio text؛ sanitization HTML publish جدا |
| CSRF/CORS | ✅ | Bearer/cookie؛ CORS از env |
| Rate limit login | ✅ | atomic lock (تست parallel login) |
| Upload/media | ✅ | MIME spoof rejection (WordPress media test) |
| Admin surface | ✅ | `/platform/*` super admin (API+UI) |
| Dependency secrets | ✅ | `.env.example` بدون secret واقعی |

### Patchهای امنیتی اعمال‌شده
1. `platform-admin.service.ts` — `assertAdmin` فقط super admin.
2. `source-reader.service.ts` — بدون bridge، telegram/X fail-safe (نه crash).
3. `publishing-settings.service.ts` — tenant دیگر AI key ذخیره نمی‌کند.

---

## ۵. فاز ۳ — بهینه‌سازی

| اقدام | وضعیت |
|-------|--------|
| حذف hardcode Worker | ✅ |
| deprecate `workers/source-fetch` | ✅ مستند |
| ERP در title/log web+api | ✅ |
| dead code (`calendar-events`, `useMutation`) | 📋 P2 — حذف در PR جدا |
| N+1 / index Prisma | 📋 P2 — بدون bottleneck گزارش‌شده |
| glossary یکدست | ✅ جزئی (Worker دریافت منبع) |

---

## ۶. فاز ۴ — نتایج تست E2E لوکال

اجرای `node scripts/audit-e2e-check.cjs` (Web 3100، API 3101):

| # | مورد | نتیجه | یادداشت |
|---|------|--------|---------|
| 1 | Login / logout | ✅ | |
| 2 | سازمان‌ها | ✅ | ۲ سازمان |
| 3 | داشبورد | ✅ | |
| 4 | Worker source-fetch + test | ✅ | Worker Deska تأیید شد |
| 5 | RSS (irna.ir) | ✅ | |
| 6 | Website (isna.ir) | ✅ | |
| 7 | Telegram (t.me/s/telegram) | ✅ | |
| 8 | X (x.com/nasa) | ⚠️ P2 | `upstream_http_429` — rate limit موقت |
| 9 | میز خبر | ✅ | |
| 10 | استودیوی اجتماعی | ✅ | |
| 11 | منابع پیش‌فرض | ✅ | ۴۰ مورد |
| 12 | تنظیمات بدون نشت secret | ✅ | |
| 13 | مرکز عملیات | ✅ | |
| 14 | Platform admin | ✅ | super admin |
| 15 | AI settings | ✅ | |
| — | Regression Worker خالی | ✅ | تست واحد + پیام راهنما |

**verify:** `pnpm verify` — All checks passed (Web build SKIP چون dev روی 3100).

**API tests:** 83/83 pass.

---

## ۷. فایل‌های تغییر یافته (این ممیزی)

### گزارش و QA
- `AUDIT_MAP.md` (جدید/به‌روز)
- `AUDIT_FIX_REPORT.md` (این فایل)
- `AUDIT_QA_CHECKLIST.md`
- `scripts/audit-e2e-check.cjs`
- `scripts/audit-probe-debug.cjs`

### اصلاحات کلیدی
- `apps/api/src/main.ts` — عنوان API
- `apps/api/src/platform/admin/platform-admin.service.ts` — super-only
- `apps/api/src/modules/smart-publishing/source-reader.service.ts` — User-Agent، bridge
- `apps/web/src/lib/navigation.ts` — glossary، superAdminOnly
- `apps/api/test/*.test.cjs` — mock usageTracking + bridge config
- `package.json` — `pnpm start` بدون SkipMigrate

*(لیست کامل diff در git status — شامل featureهای قبلی platform feeds / AI settings)*

---

## ۸. ریسک‌ها و پیشنهاد بعدی

1. **P2:** تکمیل `/publishing/media` یا حذف از منو تا API آماده شود.
2. **P2:** migration حذف فیلدهای HR از `User`.
3. **P2:** retry/backoff برای Worker وقتی X/Twitter 429 می‌دهد.
4. **P2:** تست E2E نقش viewer — کاربر محدود به `/platform/*`.
5. **P3:** حذف کد مرده (`calendar-events.ts`, `useMutation`).

---

*پایان گزارش ممیزی — Deska News*
