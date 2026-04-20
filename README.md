# TradeCRM (Vite + Vercel)

Это Vite‑клиент + API на Node/Express, адаптированное под деплой на **Vercel**.

## Как устроено на Vercel
- **Фронтенд**: статический билд Vite (папка `dist`)
- **Бэкенд**: Serverless Function `api/index.js` (Express app)
- **База**: **Postgres** (обязательно) через переменную `DATABASE_URL`

## Bunny CDN + Vercel Setup

### Vercel Domains
All three domains must be added to the **same** Vercel project under Production:
- `origin.hauntedx.trade` — Bunny origin (pull zone upstream)
- `hauntedx.trade` — apex domain
- `www.hauntedx.trade` — www alias

### Bunny Pull Zone
| Setting | Value |
|---------|-------|
| Origin URL | `https://origin.hauntedx.trade` |
| Host Header | `origin.hauntedx.trade` |
| Custom Hostnames | `hauntedx.trade`, `www.hauntedx.trade` |

### DNS Records
| Record | Name | Target |
|--------|------|--------|
| ALIAS / ANAME / flattened CNAME | `@` (apex) | Bunny pull zone hostname |
| CNAME | `www` | Bunny pull zone hostname |
| CNAME | `origin` | `cname.vercel-dns.com` |

### Required Environment Variables (Vercel Dashboard)
| Variable | Example | Notes |
|----------|---------|-------|
| `CANONICAL_HOST` | `www.hauntedx.trade` | Edge middleware redirects non-canonical hosts |
| `ORIGIN_HOST` | `origin.hauntedx.trade` | Excluded from canonical redirect (prevents loops) |
| `COOKIE_DOMAIN` | `.hauntedx.trade` | Shares session cookie across apex / www / origin |
| `SESSION_SECRET` | *(random 32+ char string)* | **Must be set in production** |
| `AUTH_DEBUG` | `true` / unset | Enables diagnostic logging & `/api/ping/session-debug` endpoint |

### Cookie Domain Behavior
- If `COOKIE_DOMAIN` is set, it is used as-is (e.g. `.hauntedx.trade`).
- If `COOKIE_DOMAIN` is **not** set, a safe fallback derives the domain from the request `Host` header:
  - `hauntedx.trade`, `www.hauntedx.trade`, `origin.hauntedx.trade` → `.hauntedx.trade`
  - `localhost` → no domain attribute (cookie bound to exact host)
- This ensures the session cookie is shared across all subdomains behind Bunny CDN.

### Caching
- All `/api/*` responses include `Cache-Control: private, no-store`, `CDN-Cache-Control: no-store`, and `Surrogate-Control: no-store` (see `vercel.json`).
- Only static assets (JS, CSS, images) are served through the CDN. API and auth requests are **never** cached.

## CDN Configuration (BunnyCDN)

Для ускорения загрузки статических ассетов (JS, CSS, изображения) можно использовать CDN.

### Настройка

1. Создайте Pull Zone в BunnyCDN с origin: `hauntedx.trade`
2. Настройте CNAME: `cdn.hauntedx.trade` → `hauntedxcdn.b-cdn.net`
3. Добавьте переменную окружения в Vercel Dashboard:
   ```
   VITE_ASSET_PREFIX=https://cdn.hauntedx.trade
   ```
4. Передеплойте приложение

### Проверка

После деплоя откройте DevTools → Network и убедитесь, что:
- JS/CSS файлы загружаются с `cdn.hauntedx.trade`
- API запросы (`/api/*`) идут напрямую на `hauntedx.trade`
- HTML страницы отдаются с `hauntedx.trade` (не через CDN)

### Безопасность

- CDN используется **только** для статических ассетов
- API (`/api/*`), SSR и cookies **не проксируются** через CDN
- Приватные данные не кешируются на CDN
