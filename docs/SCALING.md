# Scaling — H.A.M.D ERP

## Current architecture

A modular monolith (Next.js App Router with `/api` routes) in front of a single
PostgreSQL database. The application layer is stateless: sessions are signed
stateless cookies, idempotency and rate limiting live in the database, and no
request depends on which instance handles it. This is the right shape for the
current scale; the design goal below is to keep horizontal growth boring.

## Multi-instance readiness: evidence

`scripts/scale-test.ts` ran against two production-build instances
(`:3100` / `:3101`) on a dedicated `hamd_load` database:

| Test | Result |
|------|--------|
| 500 concurrent mixed reads across both instances | OK |
| 100 concurrent sales on ONE product, split across 2 instances | `StockLevel` == initial + sum of `StockMovement` ledger exactly — no lost update |
| 20 concurrent retries with the same idempotency key | exactly 1 document created |
| 30 concurrent payments of 20 on a 300 invoice | CAS-exact: 15 x 200, 15 x 409, `paidAmount` lands exactly at 300 |
| 100-org cross-tenant isolation under load | every cross-tenant read 404, own reads 200 |
| Unauthenticated reads | 401 |

## Why N instances are already safe

- Correctness comes from the database, not from process memory:
  - Stock and money mutations use DB-level CAS (conditional `updateMany`), unique
    constraints and in-transaction re-checks.
  - Idempotency identity is `scope + SHA-256(rawKey)` stored in the DB with
    `@@unique([orgId, clientOperationId])` on Invoice, Voucher, Expense, Transfer
    and StockMovement.
  - Login brute-force control is the DB-backed `LoginAttempt` ledger
    (per-account 10 failures/5 min AND per-IP 20 failures/5 min), so it survives
    restarts and works across instances.
- In-memory keyed mutexes (`withStockLock`, admin-role changes in
  `src/app/api/users/[id]/route.ts`) are contention reducers only — they reduce
  retry churn within one process but are never relied upon for correctness. The
  in-memory pre-auth damper (300 req/5 min per IP) only caps scrypt CPU burn and is
  per-instance by design.
- The in-memory rate limiters fail toward the DB-backed limits, never toward
  incorrectness.

## What to watch

- PostgreSQL connection count = app instances x `connection_limit`. With
  `connection_limit=10` per instance, 4 instances hold 40 connections. Direct
  connections are fine up to about 4 instances; beyond that, put PgBouncer
  (transaction mode) between the app and PostgreSQL and point `DATABASE_URL` at it
  — Prisma must run in its PgBouncer-compatible mode. Keep
  `pool_timeout=20&connect_timeout=10` on the URL.
- `/api/health` per instance: a 503 (DB check failed) means pull that instance from
  rotation.
- Structured request logs carry `x-request-id`; correlate them across instances by
  forwarding the header at the load balancer.

## Scaling path

1. **1 instance** — current default; a single systemd service or container plus
   PostgreSQL on the same or adjacent host.
2. **N instances behind nginx / caddy** — run 2–4 app instances, load-balance with
   round-robin, forward `X-Real-IP` / `X-Forwarded-For` (rightmost entry = client)
   and keep `TRUST_PROXY=true`. No code changes needed; scale tests above were run
   in exactly this topology.
3. **PgBouncer** — add when instance count x `connection_limit` approaches the
   PostgreSQL `max_connections` budget (beyond ~4 instances).
4. **Read replicas** — only if report/dashboard load justifies it; reports are the
   only read-heavy surface. Introduce 1 streaming replica and route report queries
   to it deliberately; writes stay on the primary.

## Deliberately absent (not needed)

| Component | Why it is absent |
|-----------|------------------|
| Redis | The DB-backed limiter is sufficient and correct across instances; adding Redis would add a second source of truth for rate limits and idempotency without solving a real problem at this scale. |
| Kafka / RabbitMQ | There are no async jobs; every mutation is synchronous request-response with DB transactions. |
| Microservices | One team, one bounded domain; a modular monolith deploys and rolls back faster. |
| Kubernetes | systemd / docker-compose behind an LB is enough for 1–4 instances; the app is stateless so orchestration adds operational cost, not capability. |

## Storage

Logos are `data:` URLs (raster only: png/jpeg/webp/gif, <= 600 KB) stored in the
database; there is NO local filesystem dependency — the SQLite file was the only
one and PostgreSQL replaced it. No object storage is needed today. If a future
feature adds real file uploads across multiple hosts, introduce an S3-compatible
abstraction at that point, not before.

## Observability floor and next step

Already in place: `x-request-id` correlation on every request (honours an upstream
LB header), one structured JSON log line per request `{t,lvl,msg:'request',id,m,p}`
without query strings, and `GET /api/health` for liveness/readiness.

Suggested next step: ship stdout logs to a central sink (Loki or CloudWatch) with
`x-request-id` as the correlation key, so logs from all instances are searchable in
one place.
