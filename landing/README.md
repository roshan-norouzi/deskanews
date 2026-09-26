# لندینگ دسکا

صفحهٔ مستقل فارسی و راست‌به‌چپ برای معرفی «دسکا؛ میز خبر هوشمند». فایل‌های قابل انتشار `index.html`، `styles.css`، `script.js` و پوشهٔ `assets` هستند. ساخت پروژه، نصب کتابخانه یا اتصال به سرویس خارجی لازم نیست.

## ویرایش متن‌ها

متن‌های صفحه در `index.html` (بخش‌های اصلی، پرسش‌ها و متادیتا در `head`) و بخش‌های تعاملی در `script.js` (شیءهای `workflow` و `audiences`) قرار دارند. پس از ذخیره، صفحه را تازه کنید. برای ظاهر و انیمیشن‌ها `styles.css` را ویرایش کنید.

## پیش‌نمایش

`index.html` را مستقیماً در مرورگر باز کنید، یا از ریشهٔ پروژه اجرا کنید:

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory landing
```

سپس `http://127.0.0.1:4173` را باز کنید. دکمه‌های ورود به `https://app.deska.ir/login` اشاره می‌کنند.

## نقشهٔ ویرایش

| بخش | شناسه | محل ویرایش |
|---|---|---|
| منو و برند | `top` | ابتدای HTML؛ لوگو در `assets/deska-wordmark.png` و `assets/deska-symbol.png` |
| تیتر و معرفی | `hero-title` | بخش ۰۲ در HTML |
| گردش کار تعاملی | `workflow` | بخش ۰۳ در HTML؛ سه نمای دیگر در `script.js` |
| نمونهٔ منابع | `source-catalog` | بخش ۰۴ در HTML؛ `assets/source-catalog.json` و `assets/source-logos` |
| ساخت میز خبر | `organization` | بخش 04b در HTML |
| امکانات و FAQ | `features`, `faq` | HTML |
| کاربردها | `audiences` | نمای رسانه در HTML؛ دو نمای دیگر در `script.js` |
| دعوت نهایی | `final-cta` | HTML |

- نشانی ورود: `APP_LOGIN_URL` در ابتدای `script.js` و `href` لینک‌های `data-app-link` در HTML.
- فهرست منابع از اکسل پلتفرم:
  ```sh
  python landing/tools/build-source-catalog.py "مسیر/deska-platform-feeds.xlsx" landing/assets/source-catalog.json
  node landing/tools/download-source-logos.mjs
  ```
  پوشهٔ `assets/source-logos` (حدود ۲۵۰ فایل PNG) را همراه `source-catalog.js` حتماً روی سرور آپلود کنید. اگر PNG نباشد، مرورگر از favicon دامنه (Google/DuckDuckGo) استفاده می‌کند؛ نسخهٔ کش در `SOURCE_LOGO_VERSION` داخل `script.js`.

## بررسی

```sh
node landing/verify.cjs
```

## قرار دادن روی دامنه

پوشهٔ لندینگ را به‌صورت استاتیک روی ریشهٔ دامنه (مثلاً `deska.ir`) آپلود کنید. این مسیر جدا از استقرار برنامهٔ Next.js روی `app.deska.ir` است.
