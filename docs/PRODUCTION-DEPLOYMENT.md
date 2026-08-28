# Production Deployment Runbook — H.A.M.D ERP

Repeatable deployment for the Next.js 16 + Prisma + PostgreSQL build. The app is a
stateless modular monolith: any instance can serve any request, so a single VPS and
N instances behind a load balancer follow the exact same steps.

## Prerequisites

| Component   | Version  | Notes                                                        |
|-------------|----------|--------------------------------------------------------------|
| Node.js     | 24       | `bun run start` executes `node .next/standalone/server.js`   |
| Bun         | 1.x      | used for build, Prisma CLI and operational scripts           |
| PostgreSQL  | >= 14    | provider is locked to `postgresql` in `prisma/schema.prisma` |
| Reverse proxy | nginx / caddy | recommended for TLS and real client IP forwarding      |

## Environment variables

Create `.env` in the project root (template: `.env.example`).

| Variable       | Required        | Value / example                                                                 |
|----------------|-----------------|---------------------------------------------------------------------------------|
| `DATABASE_URL` | yes             | `postgresql://user:pass@host:5432/hamd?connection_limit=10&pool_timeout=20&connect_timeout=10` |
| `AUTH_SECRET`  | yes             | `openssl rand -base64 32`; minimum 16 characters                                |
| `NODE_ENV`     | yes             | `production` (set automatically by `bun run start`)                             |
| `TRUST_PROXY`  | behind a proxy  | `true` so per-IP login rate limiting keys on the real client IP                 |
| `PORT`         | no              | default `3000`                                                                  |

Notes:

- `AUTH_SECRET` is fail-fast: `src/instrumentation.ts` calls `getAuthSecret()` once at
  boot and the process refuses to serve when the secret is missing or shorter than
  16 characters. In development a random per-boot secret is used instead.
- Pooling parameters ride on `DATABASE_URL` (Prisma connection-string params).
  Guidance: `connection_limit=10` per instance is sized for 2–4 instances; direct
  PostgreSQL connections are fine up to about 4 instances. Beyond that, terminate
  connections in PgBouncer (transaction mode; Prisma must run in its PgBouncer
  compatible mode) and point `DATABASE_URL` at it. `pool_timeout=20`,
  `connect_timeout=10`.
- Sessions use a `session` cookie: httpOnly, sameSite=lax, `secure` in production.

## First deployment

```bash
# 0) code + environment
git clone <repo> my-project && cd my-project
cp .env.example .env          # fill in the values from the table above

# 1) create the database
createdb hamd                 # or CREATE DATABASE via psql

# 2) apply the schema — production path is migrate deploy, never db:push
bun run db:deploy             # prisma migrate deploy (applies prisma/migrations/0_init ...)

# 3) one-time data import — only when migrating from the legacy SQLite system
LEGACY_DATABASE_URL="file:./db/custom.db" \
DATABASE_URL="postgresql://user:pass@host:5432/hamd" \
bun scripts/migrate-sqlite-to-postgres.ts
# refuses a non-empty target by default; add --reset for a deterministic wipe+reload.
# See docs/DATABASE-MIGRATION.md for the full procedure and validation output.

# 4) build and start
bun run build                 # next build + assemble .next/standalone
bun run start                 # NODE_ENV=production node .next/standalone/server.js
```

Run the process under systemd, docker-compose or a process manager of your choice;
the start command itself is plain Node with no state on disk.

## Post-deployment verification

Health probe (unauthenticated; reveals no versions, hostnames or counts):

```bash
curl -fsS http://127.0.0.1:3000/api/health
# 200 -> {"status":"ok","db":"ok","dbLatencyMs":<ms>,"time":"<iso>"}
# 503 -> {"status":"degraded","db":"error",...}  (DB failing — pull instance from rotation)
```

Login smoke test:

```bash
curl -fsS -D- -o /dev/null -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"<admin>","password":"<password>"}'
# expect HTTP 200 and a set-cookie: session=... header
```

Then log in once from the browser and confirm the dashboard renders real data.

## Reverse proxy notes

- Terminate TLS at nginx/caddy and forward to the app port.
- Forward the client IP: set `X-Real-IP` and append to `X-Forwarded-For`; the
  rightmost entry added by your own proxy is the address your infrastructure saw.
  Set `TRUST_PROXY=true` so login brute-force control counts the real client IP
  instead of treating the whole proxy as one bucket.
- `/api/health` is the load-balancer health check. A failing DB check returns 503 so
  an unhealthy instance can be removed from rotation automatically.
- Security headers: production CSP is nonce + strict-dynamic for scripts (no
  unsafe-inline); styles keep unsafe-inline for Tailwind and print templates. The
  CSP is emitted by `src/proxy.ts`, which also stamps `x-request-id` on every
  request and logs one structured JSON line without query strings.

## Rollback procedure

- Application: keep the previous release directory (or the previous
  `.next/standalone` artifact). Stop, swap artifact, start. The app is stateless, so
  rollback is a restart on the old artifact.
- Database: `prisma migrate deploy` is forward-only by policy. If the release being
  rolled back shipped a migration, restore the backup taken immediately before the
  deploy (see docs/DISASTER-RECOVERY.md) and redeploy the previous release. Always
  run `scripts/pg-backup.sh` right before applying a migration.
- The legacy SQLite file `db/custom.db` stays in the repo as an untouched archive
  and is never used at runtime.
