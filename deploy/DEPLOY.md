# راهنمای استقرار DESKA News

**منبع واحد:** هر بار که می‌خواهید نسخهٔ production را منتشر کنید، فقط از این پوشه و این دستورها استفاده کنید.

## یک دستور برای انتشار

```bat
deploy\deploy.bat
```

یا در PowerShell:

```powershell
.\deploy\deploy.ps1 release
```

این دستور به‌ترتیب انجام می‌دهد:

1. **verify** — بررسی لوکال (`pnpm verify`)
2. **commit + push** — افزایش `VERSION`، commit، push به `main`
3. **dispatch** — اجرای GitHub Actions (`deploy.yml`)
4. **smoke** — تست سلامت `https://app.deska.ir` پس از موفقیت workflow

> مرحلهٔ «export مناسبت‌های سیستمی» مربوط به ERP قدیمی بود و در Deska News اجرا نمی‌شود.

## زیردستورها

| دستور | کاربرد |
|--------|--------|
| `.\deploy\deploy.ps1 help` | راهنما |
| `.\deploy\deploy.ps1 verify` | فقط بررسی لوکال |
| `.\deploy\deploy.ps1 release` | انتشار کامل |
| `.\deploy\deploy.ps1 push` | فقط push شاخه |
| `.\deploy\deploy.ps1 dispatch` | فقط اجرای workflow |
| `.\deploy\deploy.ps1 status` | وضعیت آخرین deploy |
| `.\deploy\deploy.ps1 smoke` | تست production |

## گزینه‌های رایج

```bat
deploy\deploy.bat -NoWait
deploy\deploy.bat -SkipSystemExport
deploy\deploy.bat -NoVersionBump
deploy\deploy.bat -SkipVerify
```

معادل PowerShell:

```powershell
.\deploy\deploy.ps1 release -NoWait
.\deploy\deploy.ps1 release -SkipSystemExport
.\deploy\deploy.ps1 release -NoVersionBump
.\deploy\deploy.ps1 release -SkipVerify
```

- **`-NoWait`**: بعد از dispatch برگردد؛ پیگیری از لینک GitHub Actions
- **`-SkipSystemExport`**: (اختیاری) برای سازگاری با نسخه‌های قدیمی؛ در Deska News معمولاً لازم نیست
- **`-NoVersionBump`**: بدون افزایش `VERSION`
- **`-SkipVerify`**: بدون `pnpm verify` (فقط وقتی عجله دارید)

## مراحل دستی (اگر بخواهید گام‌به‌گام)

```powershell
pnpm verify
# در صورت نیاز: VERSION و CHANGELOG.md را به‌روز کنید
.\deploy\deploy.ps1 release -SkipVerify
# یا جداگانه:
.\deploy\deploy.ps1 push
.\deploy\deploy.ps1 dispatch
.\deploy\deploy.ps1 status
.\deploy\deploy.ps1 smoke
```

## پیکربندی یک‌باره

### ۱. فایل لوکال (غیرحساس)

```powershell
Copy-Item deploy\config.example.json deploy\config.local.json
```

مقادیر SSH، مسیر deploy و URL عمومی را در `config.local.json` تنظیم کنید. این فایل commit نمی‌شود.

### ۲. GitHub Secrets

جزئیات در [`GITHUB-SECRETS.md`](./GITHUB-SECRETS.md). حداقل:

- `SERVER_HOST`, `SERVER_USER`, `SERVER_PORT`, `SERVER_SSH_KEY`
- `DEPLOY_PATH` = `/www/wwwroot/deska.ir/app`
- `SERVER_SSH_KNOWN_HOSTS` (توصیه‌شده)

### ۳. توکن GitHub برای dispatch از لوکال

یکی از این‌ها:

```powershell
$env:DEPLOY_GITHUB_TOKEN = 'ghp_...'   # PAT با دسترسی Actions روی repo
gh auth login
```

اگر هیچ‌کدام نباشد، هنگام `dispatch` یا `release` یک‌بار از شما پرسیده می‌شود (ورودی مخفی).

### ۴. `.env` سرور

نمونه: [`production.env.example`](./production.env.example)  
مسیر روی سرور: `/www/wwwroot/deska.ir/app/.env`

## ساختار پوشه deploy

```
deploy/
  deploy.ps1          ← نقطه ورود (زیردستورها)
  deploy.bat          ← میانبر Windows برای release
  DEPLOY.md           ← این راهنما
  lib/                ← منطق داخلی (نیازی به اجرای مستقیم نیست)
  server-deploy.sh    ← اسکریپت روی سرور (از GitHub Actions)
  GITHUB-SECRETS.md
  config.example.json
  production.env.example
```

## نکات مهم

- فایل `.env` لوکال **هرگز** commit نمی‌شود.
- Token و کلید SSH را در چت یا ریپو ذخیره نکنید.
- پس از bump نسخه، یک بند در `CHANGELOG.md` برای همان نسخه اضافه کنید.
- جزئیات فنی workflow و rollback: [`README.md`](./README.md)
