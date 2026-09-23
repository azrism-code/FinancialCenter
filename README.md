# Financial Center

Private portfolio research application. The deployed Work Site uses its own private D1 database. This repository contains source code only; personal holdings and Site identity are intentionally excluded.

## Local setup

Requires Node.js 22.13+. Run `npm install`, `npm run db:generate` when the schema changes, and `npm run dev`. The bundled Sites workflow deploys the application; a separate Firebase migration has not been performed.

The initial seed in `db/seed.json` is empty. Every authenticated user has an independent portfolio keyed by the site's authenticated user ID. Do not commit portfolio exports, credentials, or API keys.

Market prices and background alerts are not connected yet.
