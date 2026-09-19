# نقشهٔ ممیزی — Deska News

> تاریخ: ۱۴۰۴/۰۶/۲۸ — فاز ۰ (بدون تغییر رفتار)  
> مسیر پروژه: `D:\My Software Projects - NEW\Deska News`

## ۱. ساختار مونوریپو

```
Deska News/
├── apps/
│   ├── api/          NestJS — REST `/api/*`, Prisma, job queue
│   └── web/          Next.js 15 App Router — RTL فارسی
├── packages/
│   └── shared/       @deska/shared — types, permissions, default feeds, glossary helpers
├── workers/
│   ├── deska/        Worker فعال — دریافت t.me / X (Cloudflare)
│   └── source-fetch/ DEPRECATED — فقط DEPRECATED.md
├── scripts/          start-dev, verify, restart-web, audit-db-integrity
├── prisma/           apps/api/prisma — schema + migrations
└── docker-compose    PostgreSQL (پورت لوکال معمول 5434)
```

**پورت‌های لوکال پیش‌فرض:** Web `3100`، API `3101`، Postgres `5434`.

---

## ۲. مسیرهای Web (Next.js)

| مسیر | وضعیت | توضیح |
|------|--------|--------|
| `/login` | زنده | ورود |
| `/register` | ریدایرکت | → `/login` |
| `/dashboard` | زنده | داشبورد سازمان |
| `/organizations` | زنده | انتخاب/ساخت سازمان |
| `/invitations/accept` | زنده | پذیرش دعوت |
| `/settings` | زنده | حساب / سازمان / کاربران |
| `/publishing/feeds` | زنده | منابع خبری (پیش‌فرض + اختصاصی اتاق خبر) |
| `/publishing/news` | زنده | اتاق خبر |
| `/publishing/social` | زنده | استودیوی اجتماعی |
| `/publishing/social/feeds` | زنده | منابع اختصاصی استودیو |
| `/publishing/settings` | زنده | تنظیمات انتشار سازمان |
| `/publishing/operations` | زنده | مرکز عملیات |
| `/publishing/media` | **نیمه‌کاره** | فقط empty-state |
| `/publishing` | **یتیم** | هاب؛ در منو نیست |
| `/publishing/channels` | ریدایرکت | → `/publishing/settings` |
| `/publishing/platform-feeds` | ریدایرکت | → `/publishing/feeds` |
| `/publishing/news/feeds` | ریدایرکت | → `/publishing/feeds` |
| `/platform` | زنده | مدیریت پلتفرم (super admin) |
| `/platform/feeds` | زنده | کاتالوگ منابع پیش‌فرض |
| `/platform/ai-settings` | زنده | تنظیمات هوش مصنوعی سراسری |
| `/platform/source-fetch` | زنده | Worker دریافت منبع |
| `/admin`, `/users` | ریدایرکت | سازگاری قدیمی |

**منوی کناری** (`apps/web/src/lib/navigation.ts`): خانه → محتوا → انتشار → پیکربندی → پلتفرم (فقط super admin).

---

## ۳. Endpointهای API (خلاصه)

پیشوند سراسری: **`/api`**

### Platform — سلامت و احراز هویت
| پایه | نمونه |
|------|--------|
| `health` | GET `/live`, `/ready` (@Public) |
| `auth` | POST `/login`, `/refresh`, `/logout`; GET `/me` |
| `tenants` | CRUD سازمان، اعضا، دعوت، usage |
| `notifications` | inbox سازمان |

### Platform — مدیریت (`/platform/*`)
| مسیر | دسترسی | کار |
|------|---------|-----|
| `GET /overview` | platform admin* | آمار |
| `GET/POST/PATCH/DELETE /users` | platform admin* | کاربران |
| `GET/PATCH/DELETE /organizations` | platform admin* | سازمان‌ها |
| `POST /organizations/:id/transfer-ownership` | super admin | انتقال مالکیت |
| `GET/PATCH /usage-metrics` | super admin | تعرفه |
| `GET/POST/PATCH/DELETE /feeds` | super admin | کاتالوگ منابع پیش‌فرض |
| `GET/PUT /ai-settings` | super admin | GapGPT سراسری |
| `GET/PUT /source-fetch-settings` | super admin | Worker Deska |
| `POST /source-fetch-settings/test` | super admin | تست Worker |

\* *API `/platform/*` فقط super admin — `assertAdmin` در سرویس به `assertSuperAdmin` تفویض شده (اصلاح P1).*

### Smart Publishing (`/publishing/*`) — tenant-scoped
| گروه | Guard | نمونه |
|------|-------|--------|
| Operations | JWT + Tenant + Permission | `/operations`, jobs, workflow |
| Settings | + `publishing.settings` (owner) | `/settings`, fonts, images |
| Feeds | + `publishing.manage` | `/feeds`, `/news/feeds`, `/social/feeds` |
| Platform feeds (tenant) | view/manage | `/platform-feeds` — اشتراک سازمان |
| News room | manage | `/news/articles`, summarize, publish, send-to-social |
| Social studio | manage | `/social/articles`, prepare, publish/:network |
| Public assets | @Public | fonts/images/media files (tenant-scoped path) |

### Dashboard
| `GET /dashboard/stats` | `dashboard.view` |

---

## ۴. مدل دامنه (Prisma)

| مدل | نقش |
|-----|-----|
| **User** | هویت، session، فیلدهای HR باقی‌مانده از ERP |
| **Tenant** | سازمان (multi-tenant) |
| **TenantMember** | نقش: owner/admin/editor/viewer + permissions |
| **TenantInvitation** | دعوت ایمیل |
| **NewsFeed** | منبع سازمانی (rss/website/telegram/twitter) + purpose |
| **PlatformFeed** | منبع پیش‌فرض سراسری + catalogGroup |
| **TenantPlatformFeed** | اشتراک/اتوماسیون سازمان به منبع پیش‌فرض |
| **PlatformFeedArticle** | ingest مرکزی منابع پیش‌فرض |
| **NewsArticle** | اتاق خبر — چرخه summarize → publish/social |
| **SocialArticle** | استودیو — prepare → cover → publish شبکه |
| **PlatformConfig** | singleton: `settings.ai`, `settings.source_fetch` |
| **AutomationJob** | صف durable (بدون Bull) |
| **IntegrationHealth** | سلامت WordPress/GapGPT/Worker/شبکه |
| **ContentWorkflowEvent** | تاریخچه وضعیت محتوا |
| **AuditLog / Activity / Notification** | ممیزی و اعلان |
| **UsageMetricDefinition / TenantUsageCounter** | مصرف سازمان |

---

## ۵. وابستگی منطقی (متنی)

```
[Platform Admin UI /platform/*]
    → GET/PUT /api/platform/{ai-settings|source-fetch-settings|feeds}
    → PlatformConfig (DB) + PlatformFeed (DB)

[Tenant UI /publishing/feeds]
    → GET /api/publishing/platform-feeds  (اشتراک)
    → GET/POST /api/publishing/news/feeds (منابع اختصاصی اتاق خبر)

[Ingest منبع t.me / x.com]
    → SourceReaderService.safeFetchTextViaBridge
    → POST {PlatformConfig.source_fetch.url}/  (Worker deska)
    → پارس HTML → NewsArticle / SocialArticle / PlatformFeedArticle

[Ingest RSS/website]
    → SourceReaderService (SSRF-safe fetch مستقیم)
    → NewsFeed poll (AutomationJob: news.feed.fetch)

[اتاق خبر]
    → GapGPT (PlatformConfig.ai) → summarize
    → WordPress (tenant settings) → publish
    → یا SocialStudio → send-to-social

[استودیو]
    → GapGPT → prepare/caption
    → Cover renderer → publish (telegram_bot_token/chat_id tenant — جدا از ingest)

[Maintenance @Interval 60s]
    → newsroom / social-studio / platform-feed poll
[Worker jobs @Interval 2s]
    → AutomationJob processor
```

---

## ۶. Worker دریافت منبع

| مورد | مقدار |
|------|--------|
| Worker زنده (production) | `https://deska.roshan-norouzi.workers.dev` |
| کد | `workers/deska/` |
| تنظیم | فقط `/platform/source-fetch` → `source_fetch_bridge_url` + `source_fetch_bridge_secret` |
| hardcode در runtime | **خیر** — env فقط bootstrap یک‌بار |
| Worker موازی | `workers/source-fetch/` deprecated |

---

## ۷. طبقه‌بندی بخش‌ها

| وضعیت | بخش |
|--------|-----|
| **زنده** | Auth, Tenancy, Newsroom, Social Studio, Platform feeds, Operations, Dashboard, Platform admin (AI, Worker, catalog) |
| **نیمه‌کاره** | `/publishing/media` (بدون API لیست رسانه) |
| **ریدایرکت/سازگاری** | channels, platform-feeds, news/feeds, admin, users, register |
| **مرده (کد)** | `calendar-events.ts`, `useMutation` در use-api, `masked-input.tsx`, `RequireModule` decorator |
| **ERP leftover** | User HR fields در schema, `DESKA ERP` در log/User-Agent, migration history, `UpdateEmployeeCodeSettingsDto` |
| **تکراری** | هاب `/publishing` vs منوی section-based |

---

## ۸. صف و زمان‌بندی

| نام | فاصله | سرویس |
|-----|--------|--------|
| `publishing-durable-job-worker` | 2s | پردازش AutomationJob |
| `publishing-durable-job-maintenance` | 60s | بازیابی lock، prune |
| `smart-publishing-newsroom-maintenance` | 60s | poll خبر، automation |
| `smart-publishing-social-maintenance` | 60s | poll استودیو |
| `platform-feed-maintenance` | 60s | poll منابع پیش‌فرض |

**Job types:** `news.feed.fetch`, `news.prepare`, `news.publish`, `news.send-social`, `social.feed.fetch`, `social.prepare`, `social.cover`, `social.publish`

---

## ۹. بستهٔ shared (@deska/shared)

- `APP_PERMISSIONS` — publishing.view/manage/publish/settings
- `DEFAULT_PLATFORM_FEEDS` — 40 منبع catalog v3
- `SOURCE_LANGUAGES`, `shouldUsePersianRewrite`
- `FEED_SOURCE_TYPES`, `FEED_CATALOG_GROUPS`

---

*پایان فاز ۰ — مرجع برای فازهای ۱–۵.*
