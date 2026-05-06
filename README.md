# Koshyk

Особистий фінансовий трекер: гаманці, категорії, транзакції, бюджети, цілі.
Mobile-first PWA, працює офлайн.

A personal finance tracker: wallets, categories, transactions, budgets, goals.
Mobile-first PWA, works offline.

## Stack

- **Front**: Vite + React 18 + Tailwind + framer-motion + recharts
- **PWA**: vite-plugin-pwa (Workbox)
- **API**: Node/Express
- **DB**: Postgres (`DATABASE_URL`)
- **Storage**: IndexedDB on the client; mirrored JSON state on the server

## Local development

```bash
npm install
cp .env.example .env   # set DATABASE_URL etc.
npm run migrate        # create schema
npm run dev            # vite + nodemon (server on :8080, client on :5173)
```

## Build

```bash
npm run build
npm start              # serve dist/ + API on :8080
```

## Environment

| Var | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | required in production (32+ chars) |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional — enables transactional email |
| `APP_URL` | required in production for verification links |
| `COOKIE_DOMAIN` | optional — share session cookie across subdomains |

## Deploy on Vercel

The API ships as a single serverless function at `api/index.js`. Static assets
live in `dist/`. Vercel routing is in `vercel.json`.

## License

Source-available. See `LICENSE`.
