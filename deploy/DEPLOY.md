# استقرار DESKA News

## انتشار (تنها کاری که لازم است)

```bat
deploy.cmd
```

(یا دوبار کلیک روی `deploy\deploy.bat`؛ پیام commit دلخواه: `deploy.cmd -Message "توضیح تغییر"`)

| مرحله | کار |
|---|---|
| 1/5 GitHub access | بررسی توکن ذخیره‌شده (فقط بار اول پرسیده می‌شود) |
| 2/5 Local check | `pnpm typecheck` — بدون نیاز به روشن بودن سرور لوکال یا دیتابیس |
| 3/5 Version and push | commit همه تغییرات، تعیین نسخه، ساخت tag `vX.Y.Z`، push اتمیک |
| 4/5 GitHub Actions | ساخت ایمیج‌ها از **همان tag** و استقرار روی سرور با backup و rollback خودکار |
| 5/5 Production check | `https://app.deska.ir` باید دقیقاً همان نسخه را گزارش کند |

## قواعد نسخه (خودکار)

- هر انتشار یک tag گیت `vX.Y.Z` دارد و GitHub Actions از همان tag می‌سازد؛ نسخه روی سرور = `VERSION` = tag.
- اگر تغییری هست و نسخهٔ فعلی قبلاً منتشر شده، patch یکی بالا می‌رود.
- اگر `VERSION` را خودتان (یا Agent) بالا برده‌اید و هنوز tag ندارد، همان استفاده می‌شود (دوبار بالا نمی‌رود).
- هیچ شماره‌ای دوبار برای دو کد متفاوت استفاده نمی‌شود.
- بدون تغییر، `deploy.cmd` همان نسخه را دوباره مستقر می‌کند.

## اگر خطا داد

**اجرای دوباره همیشه امن است**: از همان جایی که مانده ادامه می‌دهد و نسخه را دوباره بالا نمی‌برد.

- قطعی موقت اینترنت/GitHub خودکار تا حدود ۲ دقیقه retry می‌شود.
- اگر مشکل روی GitHub Actions یا سرور باشد، علت (آخرین خطوط لاگ و `DESKA_DEPLOY_ERROR`) همان‌جا چاپ می‌شود.
- اگر مرحلهٔ ۴ روی سرور شکست بخورد، نسخهٔ قبلی خودکار برمی‌گردد و سایت بالا می‌ماند.

| پیام | راه‌حل |
|---|---|
| `TypeScript errors found` | خطای واقعی کد؛ چیزی commit/منتشر نشده |
| `Deploys are made from 'main' only` | `git switch main` |
| `conflict with newer commits on GitHub` | `git pull --rebase origin main` و دوباره deploy |
| `token is not allowed to start workflows` | `deploy\deploy.bat token` با توکن دارای scope های `repo` و `workflow` |
| `Stopped waiting ...` | deploy روی GitHub ادامه دارد: `deploy\deploy.bat status` |

## دستورهای دیگر

```bat
deploy\deploy.bat status   :: آخرین اجرای deploy و علت خطا (اگر بود)
deploy\deploy.bat smoke    :: سلامت https://app.deska.ir
deploy\deploy.bat token    :: جایگزینی توکن GitHub
```

گزینه‌ها: `-SkipCheck` (رد کردن typecheck)، `-NoWait` (برگشت بلافاصله بعد از شروع deploy).

## راه‌اندازی یک‌باره

### توکن GitHub

در اولین اجرا پرسیده می‌شود و با DPAPI ویندوز (فقط برای همین کاربر ویندوز) در
`%LOCALAPPDATA%\Deska\github-deploy-token.xml` ذخیره می‌شود. ساخت:
https://github.com/settings/tokens → classic → scope های `repo` و `workflow`.
(متغیر محیطی `DEPLOY_GITHUB_TOKEN` هم پشتیبانی می‌شود.)

### GitHub Secrets

`roshan-norouzi/deskanews` → Settings → Secrets and variables → Actions

| Secret | مقدار |
|---|---|
| `SERVER_HOST` | `94.101.184.39` |
| `SERVER_USER` | `root` |
| `SERVER_PORT` | `2435` (پورت SSH؛ نه 22 و نه 32168 پنل) |
| `SERVER_SSH_KEY` | کلید خصوصی SSH |
| `DEPLOY_PATH` | `/www/wwwroot/deska.ir/app` |
| `SERVER_SSH_KNOWN_HOSTS` | اختیاری (توصیه‌شده): خروجی `ssh-keyscan -p 2435 94.101.184.39` یا fingerprint کلید سرور |

### سرور

- `.env` در `DEPLOY_PATH` (نمونه: `production.env.example`؛ نصب اولیه: `bootstrap-server.sh`).
- Docker project: `deska-news`. Redis و MinIO از GHCR کشیده می‌شوند (سرور به Docker Hub دسترسی ندارد).

## داده‌های سرور در deploy

| مورد | رفتار |
|---|---|
| `.env` سرور | فقط `APP_VERSION`، `IMAGE_PREFIX`، `COMPOSE_PROJECT_NAME` و آدرس ایمیج Redis/MinIO به‌روز می‌شوند |
| PostgreSQL | volume حفظ می‌شود؛ فقط migrationهای جدید اجرا می‌شوند |
| کاربران و تنظیمات | حفظ؛ seed فقط در اولین نصب |
| فایل‌های آپلود | volume حفظ می‌شود |
| بکاپ | قبل از هر deploy در `backups/deployments/` (پنج مورد آخر) |
| ایمیج‌های قدیمی | فقط نسخهٔ جاری و قبلی (برای rollback) نگه داشته می‌شوند |

## فایل‌ها

```
deploy.cmd                 میانبر ریشه → deploy\deploy.bat
deploy/deploy.bat          اجرای ویندوز (ExecutionPolicy Bypass)
deploy/deploy.ps1          نقطهٔ ورود
deploy/lib/                منطق داخلی (common, config, github, release)
deploy/server-deploy.sh    اجرا روی سرور: backup → pull → migrate → switch → verify → rollback
deploy/prepare-known-hosts.sh
deploy/bootstrap-server.sh نصب اولیهٔ .env
deploy/postgres/           فقط برای پروفایل read-replica
.github/workflows/deploy.yml
```

توکن و کلید SSH را هرگز در چت یا ریپو قرار ندهید.
