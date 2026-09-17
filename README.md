# دسکا ERP — DESKA ERP

سیستم یکپارچه مدیریت سازمان (Enterprise Resource Planning) با معماری Modular Monolith، چندمستاجری (SaaS) و قابل استقرار On-premise.

## Tech Stack

| لایه | تکنولوژی |
|------|----------|
| Backend | NestJS 11, Prisma 6, PostgreSQL 16 |
| Frontend | Next.js 15, React 19, Tailwind CSS |
| Auth | JWT + Refresh Token |
| Monorepo | pnpm workspaces |

## ماژول‌ها

### پلتفرم
- احراز هویت و RBAC
- Multi-tenancy
- Module Registry
- Studio (فیلدهای سفارشی)
- مخاطبین، اسناد و تقویم

### قابلیت‌های اصلی
- **هستهٔ همیشه‌فعال:** مخاطبین، اسناد، تقویم و کارمندان/دپارتمان‌ها
- **ماژول‌های اختیاری:** پروژه‌ها، تسک‌ها و نشر هوشمند (بر اساس پلن و تنظیم سازمان)

## راه‌اندازی سریع

### پیش‌نیاز
- Node.js >= 20
- pnpm >= 9
- **Docker Desktop** (برای PostgreSQL)

### نصب

**Windows:** Docker Desktop را باز کنید، سپس **`Run.bat`** را اجرا کنید.

```bash
# Clone و نصب
pnpm install

# کپی env و جایگزینی همهٔ مقادیر replace-with-...
cp .env.example .env

# یا دستی:
# راه‌اندازی PostgreSQL با Docker
docker compose up postgres -d

# Migration و seed
pnpm db:migrate
pnpm db:seed
pnpm --filter @deska/api seed:demo  # داده دمو (اختیاری)

# اجرای dev
pnpm dev
```

- **Web:** http://localhost:3000
- **API:** http://localhost:3001/api
- **ورود مدیر:** از `SEED_ADMIN_EMAIL` و `SEED_ADMIN_PASSWORD` تنظیم‌شده در فایل محلی `.env` استفاده کنید. رمز پیش‌فرض عمومی وجود ندارد.

### Docker (Production)

```bash
docker compose up -d
```

## ساختار پروژه

```
DESKA ERP/
├── apps/
│   ├── api/          # NestJS REST API
│   └── web/          # Next.js RTL UI
├── packages/
│   └── shared/       # Enums, permissions, labels
├── docker-compose.yml
└── pnpm-workspace.yaml
```

## On-Premise

```env
TENANT_MODE=single
DEFAULT_TENANT_SLUG=default
```

## عیب‌یابی

### خطای 500 در لاگین / دیتابیس
1. **Docker Desktop** را باز کنید و صبر کنید تا آماده شود
2. **Run.bat** را اجرا کنید
3. API روی http://localhost:3001/api/health باید `{"status":"ok"}` برگرداند

### اطلاعات ورود
- ایمیل و رمز مدیر اولیه در `SEED_ADMIN_EMAIL` و `SEED_ADMIN_PASSWORD` تعیین می‌شود.
- رمز اولیه باید حداقل ۱۲ نویسه، منحصربه‌فرد و فقط برای راه‌اندازی نخست باشد؛ آن را در Git ثبت نکنید.
- برای کنترل کامل پس از اجرا: `pnpm verify:live`

## License

Private — All rights reserved.
