# GitHub Secrets — deskanews

ریپوی **`roshan-norouzi/deskanews`** → Settings → Secrets and variables → Actions

## روش سریع

از ریپوی **`roshan-norouzi/deska`** همان Secrets را کپی کنید؛ **فقط `DEPLOY_PATH` را عوض کنید.**

| Secret | مقدار deskanews |
|--------|-----------------|
| `SERVER_HOST` | `94.101.184.39` (یا همان مقدار deska اگر `pixad.ir` است) |
| `SERVER_USER` | `root` (همان deska) |
| `SERVER_PORT` | `22` (همان deska — **32168 پورت پنل است، نه SSH**) |
| `SERVER_SSH_KEY` | همان کلید خصوصی deska |
| `SERVER_SSH_KNOWN_HOSTS` | همان deska (یا `ssh-keyscan -H -p 22 94.101.184.39`) |
| **`DEPLOY_PATH`** | **`/www/wwwroot/deska.ir/app`** |

## تفاوت با deska قدیم

| | deska (ERP) | deska-news |
|---|-------------|------------|
| مسیر deploy | `/www/wwwroot/pixad.ir/deska` | `/www/wwwroot/deska.ir/app` |
| Docker project | (پیش‌فرض پوشه) | **`deska-news`** |
| GHCR images | `ghcr.io/.../deska` | `ghcr.io/roshan-norouzi/deskanews` |
| دامنه کاربر | pixad.ir/… | **app.deska.ir** |

پنل سرور: https://94.101.184.39:32168/
