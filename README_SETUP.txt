# Trading Journal CRM — правки

## Запуск
1) npm install
2) npm run dev

## Сборка
npm run build

## Деплой на Vercel — настройка домена

### Канонический хост (CANONICAL_HOST)

Проект использует **одну точку правды** для редиректа доменов:
переменную окружения `CANONICAL_HOST`.

Vercel Edge Middleware (`middleware.js`) перенаправляет любой запрос
с "неканонического" хоста на канонический (308 Permanent Redirect).

#### Чтобы НЕ было бесконечных редиректов:

1. **В Vercel Dashboard → Settings → Environment Variables** установи:
   ```
   CANONICAL_HOST=hauntedx.trade
   ```
   (или `www.hauntedx.trade` — на твой выбор, но только **один** вариант.)

2. **В Vercel Dashboard → Settings → Domains** убедись, что
   **Primary Domain** совпадает с `CANONICAL_HOST`.
   - Если `CANONICAL_HOST=hauntedx.trade`, то Primary Domain = `hauntedx.trade`.
   - Если `CANONICAL_HOST=www.hauntedx.trade`, то Primary Domain = `www.hauntedx.trade`.

3. **Не добавляй** `redirects` в `vercel.json` — редирект уже обрабатывается
   в `middleware.js`. Дублирование приведёт к петлям.

4. Сделай **Redeploy** после изменения переменных.

#### Как проверить:
```bash
curl -I https://www.hauntedx.trade   # должен дать 308 → https://hauntedx.trade/
curl -I https://hauntedx.trade       # должен дать 200 OK (или содержимое SPA)
```

## Изменения
- Исправлен график **Profit progression** на Dashboard.
- Добавлена страница **Archive** для архивированных аккаунтов (в Accounts они скрываются).
- Добавлена страница **Trash** для удалённых: trades, accounts, pairs, sessions.
  - В Trash можно **Restore** или **Delete forever**.
