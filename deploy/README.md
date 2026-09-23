# ابزار استقرار DESKA

**راهنمای اصلی:** [`DEPLOY.md`](./DEPLOY.md) — هر بار deploy از همانجا شروع کنید.

## خلاصه

```bat
deploy\deploy.bat
```

```powershell
.\deploy\deploy.ps1 release
```

## فایل‌های این پوشه

| فایل | نقش |
|------|-----|
| `deploy.ps1` | نقطه ورود با زیردستورها |
| `deploy.bat` | میانبر Windows |
| `DEPLOY.md` | راهنمای گام‌به‌گام (فارسی) |
| `lib/` | اسکریپت‌های داخلی |
| `server-deploy.sh` | اجرا روی سرور توسط GitHub Actions |
| `prepare-known-hosts.sh` | پین SSH host key در CI |
| `bootstrap-server.sh` | نصب اولیه `.env` روی سرور |
| `GITHUB-SECRETS.md` | Secrets مورد نیاز |
| `config.example.json` | پیکربندی غیرحساس لوکال |
| `production.env.example` | نمونه `.env` سرور |
| `publish-local.ps1` | سازگاری با نسخهٔ قبلی (wrapper) |

## انتشار خودکار از لوکال

Workflow `deploy.yml` روی شاخهٔ `main` با `workflow_dispatch` اجرا می‌شود. ایمیج‌های API و Web به‌صورت موازی در GHCR ساخته می‌شوند؛ manifest کوچک (compose، اسکریپت deploy، و فایل‌های `deploy/postgres/`) از SSH به سرور می‌رود.

سرویس Docker: **`deska-news`** (`COMPOSE_PROJECT_NAME=deska-news`).

## تضمین‌های پایداری استقرار

پیش از جابه‌جایی نسخه، اسکریپت سرور فضای آزاد، checksum و backup را بررسی می‌کند، migrationها را اجرا می‌کند و در صورت خطا rollback خودکار انجام می‌دهد. ده پشتیبان آخر در `backups/deployments` نگهداری می‌شود.

### داده‌هایی که deploy حفظ می‌کند

| مورد | رفتار |
|------|--------|
| `.env` سرور | فقط `APP_VERSION`، `IMAGE_PREFIX` و `COMPOSE_PROJECT_NAME` به‌روز می‌شوند |
| PostgreSQL | volume باقی می‌ماند؛ فقط migrationهای جدید |
| کاربران و تنظیمات | حفظ؛ seed فقط در اولین نصب |
| فایل‌های آپلود | volume `api_uploads` حفظ می‌شود |
| بکاپ | قبل از هر deploy در `backups/deployments/` |

## SSH host key

برای بالاترین امنیت، `SERVER_SSH_KNOWN_HOSTS` را با کلید یا fingerprint تأییدشدهٔ سرور تنظیم کنید. اگر خالی باشد، workflow برای سازگاری کلید جاری را دریافت می‌کند (جزئیات در نسخه‌های قبلی README).

Token و کلید SSH را در Repository یا چت ذخیره نکنید.
