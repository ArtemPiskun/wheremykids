# Backend «Де мої діти»

NestJS 11 + TypeScript, Kysely поверх PostgreSQL 16, Redis 7, Socket.IO (`/rt`), BullMQ, FCM HTTP v1.

## Запуск

```bash
npm ci
cp .env.example .env && node scripts/gen-secrets.js   # значення вставити в .env
npm run build && npm run migrate && npm start
```

Усі секрети та адреси беруться лише зі змінних середовища, конфіг перевіряється zod під час старту. `RUN_MODE=api|worker|all` дозволяє рознести HTTP і фонові задачі (push, ретеншн) по різних подах.

## Тести

```bash
npm test                 # unit
createdb -O demoidity demoidity_test
npm run test:e2e         # e2e на demoidity_test і Redis db 1, секрети генеруються на льоту
```

`DATABASE_URL` і `TEST_REDIS_URL` перевизначають адреси для e2e.

## Інструменти

- `scripts/smoke.sh`: батьківський сценарій через curl (потрібен `jq`), друкує код інвайту.
- `npm run simulate:child -- --code XXXX-XXXX [--api URL] [--interval 10] [--sos-after N]`: віртуальна дитина.

## API (v1)

| Метод | Шлях | Хто |
|---|---|---|
| POST | `/v1/auth/register`, `/login`, `/refresh`, `/logout` | усі |
| GET/POST | `/v1/families`, `/v1/families/:id/children` | батьки |
| POST | `/v1/families/:id/children/:childId/invites`, `/parent-invites` | батьки |
| POST | `/v1/invites/redeem`, `/v1/parent-invites/accept` | дитина / батько |
| POST | `/v1/locations/batch` | дитина |
| GET | `/v1/families/:id/locations/latest`, `/v1/children/:id/history` | батьки |
| POST | `/v1/children/:id/locate` | батьки (запит на оновлення) |
| CRUD | `/v1/families/:id/geofences`, GET `/geofence-events` | батьки |
| POST | `/v1/sos`, `/v1/sos/:id/cancel\|ack\|resolve`; GET `/v1/families/:id/sos` | дитина / батьки |
| GET/PUT/DELETE | `/v1/devices`, `/v1/devices/current`, `/v1/devices/:id` | усі |
| GET/PATCH/DELETE | `/v1/me`, GET `/v1/me/export` | усі |
| GET/POST | `/v1/child/me`, `/v1/child/sharing/pause\|resume`, `/v1/child/leave` | дитина |
| GET | `/health/live`, `/health/ready` | інфраструктура |

Помилки мають вигляд `{ "error": { "code", "message", "details" } }`.
