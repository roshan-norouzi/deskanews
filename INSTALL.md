# بسته نصبی DESKA ERP

این بسته برای نصب هسته دسکا روی سروری است که Docker Engine و Docker Compose (Plugin جدید یا `docker-compose`) دارد. Node.js، pnpm، PostgreSQL، Nginx و تنظیمات توسعه روی سرور لازم نیستند.

نسخه این بسته: **1.0.0**

در این نسخه، API تا آماده‌شدن PostgreSQL چند بار مهاجرت را تکرار می‌کند. نصب تازه برای مدیر رمز عمومی پیش‌فرض ندارد و رمز حداقل ۱۲ نویسه‌ای را از شما می‌گیرد؛ همچنین `SETTINGS_ENCRYPTION_KEY` را به‌صورت تصادفی تولید می‌کند. در ارتقا، فایل `.env` و داده‌های موجود عمداً حفظ می‌شوند.

برای نصب یا ارتقای production وجود این مقادیر در `.env` الزامی است: `POSTGRES_PASSWORD`، `JWT_SECRET`، `SETTINGS_ENCRYPTION_KEY` و `CORS_ORIGIN`. کلید رمزنگاری تنظیمات را پس از شروع سرویس تغییر ندهید؛ تغییر آن باعث غیرقابل‌خواندن‌شدن secretهای رمزنگاری‌شده قبلی می‌شود.

اجرای `install.sh` یا `install.ps1` هر دو حالت را خودکار تشخیص می‌دهد: نصب تازه، نصب نیمه‌کاره (بدون نشانگر نسخه)، یا آپدیت نسخهٔ موجود. اجرای مجدد همان نسخه نیز برای تعمیر سرویس‌ها مجاز است؛ فقط نسخهٔ قدیمی‌تر پذیرفته نمی‌شود.

### انتشار و استفاده از imageهای آماده

برای کوتاه‌شدن نصب، ابتدا در Docker Hub یا GHCR یک نام مانند `ghcr.io/USERNAME/deska` انتخاب کنید و وارد Registry شوید. سپس در ریشهٔ پروژه اجرا کنید:

```bash
export IMAGE_PREFIX=ghcr.io/USERNAME/deska
docker login ghcr.io
./publish-images.sh
```

در سرور مقصد، قبل از اجرای نصب‌کننده همین مقدار را در فایل `.env` قرار دهید:

```env
IMAGE_PREFIX=ghcr.io/USERNAME/deska
```

در این حالت نصب‌کننده فقط imageهای نسخه‌دار API و Web را دریافت می‌کند و Build انجام نمی‌دهد. PostgreSQL همچنان به‌صورت image رسمی دریافت می‌شود و اطلاعات آن در volume باقی می‌ماند.

## لینوکس

```bash
bash install.sh
```

## ویندوز / PowerShell

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

نصب، فایل `.env` را می‌سازد، PostgreSQL و سرویس‌های API/Web را اجرا می‌کند، migration دیتابیس را اعمال می‌کند و سلامت API را بررسی می‌کند. اجرای دوباره‌ی نصب، تنظیمات و داده‌های موجود را حفظ می‌کند.

پس از نصب، آدرس ورود عمومی روی پورت وب انتخاب‌شده نمایش داده می‌شود. اگر پورت `3000` انتخاب شود، آدرس مستقیم شامل `:3000` است؛ برای آدرس بدون پورت مانند `http://pixad.ir` باید در Nginx/Apache یا پنل سرور، reverse proxy از پورت ۸۰/۴۴۳ به پورت وب تنظیم شود. پورت ۳۰۰۰ نیز باید در firewall سرور باز باشد اگر قصد دسترسی مستقیم دارید.

در مرحله نصب می‌توانید آدرس کامل مانند `https://pixad.ir/deska` را وارد کنید؛ نصب‌کننده دامنه و مسیر `/deska` را خودکار جدا می‌کند. در reverse proxy باید مسیر `/deska/` به پورت برنامه ارسال شود و prefix حفظ شود.

این بسته به دامنه یا نام سایت خاصی وابسته نیست. دامنه، پورت و مسیر پایه فقط در زمان نصب در `.env` ثبت می‌شوند؛ ماژول‌ها نیز از API نسبی هسته استفاده می‌کنند و برای انتقال به سرور یا دامنه دیگر نیازی به تغییر کد ندارند.

API در اولین راه‌اندازی تا آماده‌شدن کامل PostgreSQL به‌صورت خودکار تلاش مجدد می‌کند؛ بنابراین تأخیر اولیه دیتابیس باعث توقف نصب نمی‌شود.

نمونه تنظیم Nginx:

```nginx
server {
    server_name pixad.ir www.pixad.ir;
    # API must be matched before the general /deska/ location. The prefix
    # replacement keeps Nest's /api global prefix intact.
    location ^~ /deska/api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /deska;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location = /deska {
        return 301 /deska/;
    }

    location ^~ /deska/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /deska;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

در این پیکربندی، درخواست مرورگر به
`/deska/api/auth/login` مستقیماً به `/api/auth/login` در سرویس API می‌رسد؛
بنابراین نام داخلی Docker (`api`) هرگز به مرورگر ارسال نمی‌شود. پس از ذخیره
تنظیمات، در پنل سرور گزینهٔ تست و سپس Reload سرویس Nginx را اجرا کنید.

## ارتقا بدون تغییر داده‌ها

بسته نسخه جدید را کنار نصب فعلی قرار دهید و اجرا کنید:

```bash
bash upgrade.sh ./deska-erp-v1.0.1.zip
```

ارتقا فایل `.env` و volumeهای PostgreSQL و آپلودها را حفظ می‌کند، قبل از ارتقا backup دیتابیس می‌گیرد و فقط کد و imageهای برنامه را جایگزین می‌کند. نسخه در فایل `VERSION`، پاسخ health API و پایین منوی برنامه قابل مشاهده است.

## روش وردپرسی نصب و ارتقا

در هر نسخه، کل ZIP نسخه‌دار را روی پوشه نصب قبلی استخراج کنید (گزینه‌ی جایگزینی فایل‌ها را تأیید کنید) و همان `install.sh` را اجرا کنید. فایل `.deska-installed-version` نسخه نصب‌شده را نگه می‌دارد؛ اگر نسخه جدیدتر باشد، نصب‌کننده خودکار وارد حالت ارتقا می‌شود و نیازی به اجرای اسکریپت جداگانه نیست:

```bash
bash install.sh
```

نام فایل پیشنهادی بسته‌ها: `deska-erp-v1.0.0.zip`، `deska-erp-v1.0.1.zip` و ... .
