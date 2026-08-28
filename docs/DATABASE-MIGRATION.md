# Database Migration — SQLite to PostgreSQL

Status: COMPLETE. The production database is PostgreSQL. `prisma/schema.prisma` has
`provider = "postgresql"`, the migration baseline is `prisma/migrations/0_init`
(PostgreSQL), and all data was copied and validated by
`scripts/migrate-sqlite-to-postgres.ts` (1,591 rows, 0 discrepancies).

## What changed

### 1. Storage engine

SQLite (`file:./db/custom.db`) was replaced by PostgreSQL. The legacy file
`db/custom.db` is kept in the repo as an untouched archive; the server never opens
it. There is no local filesystem dependency left in production (logos are data: URLs
stored in the database).

### 2. Numeric types: Float to Decimal

SQLite stored all money and quantity fields as `Float`. The PostgreSQL schema stores
them as exact `DECIMAL`, eliminating base-10 float drift.

| Column class                          | Old (SQLite) | New (PostgreSQL)          |
|---------------------------------------|--------------|---------------------------|
| Money: totals, amounts, balances, prices, cost | `Float` | `Decimal @db.Decimal(14, 2)` |
| Quantities (StockLevel.qty, StockMovement.qty, minQty, item qty) | `Float` | `Decimal @db.Decimal(14, 3)` |
| Tax percent (Org.taxPercent, Invoice.taxPercent) | `Float` | `Decimal @db.Decimal(5, 2)`  |

The API contract stays numeric: `src/lib/api-helpers.ts` `decToNum()` converts Prisma
`Decimal` objects to JSON numbers at the `ok()` / export boundary, so the DB stores
exact DECIMAL while the frontend continues to receive plain numbers. No frontend
changes were required.

## Baseline migration approach

- `prisma/migrations/0_init/migration.sql` is the PostgreSQL baseline: one migration
  containing the full schema. `migration_lock.toml` is locked to `postgresql`.
- The old SQLite migrations (`0_init` ... `6_login_attempt_ledger`) are preserved for
  history in `prisma/migrations-sqlite-archive/` and are NOT part of the active
  migration path.
- `prisma/legacy-sqlite/schema.prisma` is the read-only legacy client schema used by
  the data bridge script.
- package.json scripts:
  - `db:deploy` = `prisma migrate deploy` — the ONLY command for production.
  - `db:migrate` = `prisma migrate dev` — for developer databases.
  - `db:push` = `prisma db push --accept-data-loss` — TEST databases only.

## Data migration script

`scripts/migrate-sqlite-to-postgres.ts` copies all data across the two engines.

Usage:

```bash
LEGACY_DATABASE_URL="file:/abs/path/custom.db" \
DATABASE_URL="postgresql://user:pass@host:5432/hamd" \
bun scripts/migrate-sqlite-to-postgres.ts            # first (clean target) run
bun scripts/migrate-sqlite-to-postgres.ts --reset    # deterministic re-run
```

Behaviour:

- Deterministic: fixed FK-safe table order (19 tables, parents before children),
  fixed per-row mapping, no invented timestamps.
- Repeatable: refuses a non-empty target unless `--reset` is passed; with `--reset`
  it wipes (children first) and re-inserts inside the same transaction, so re-runs
  always converge to the same end state.
- Transaction-safe: every insert happens inside ONE PostgreSQL transaction — either
  the whole dataset lands or nothing does.
- Read-only source: the SQLite file is opened through a dedicated legacy client and
  never written to; the original file is left untouched.
- Fails fast if `DATABASE_URL` does not point at PostgreSQL.

Validation (runs automatically after commit, re-reads both databases):

- 19 table row counts (Org, User, Counter, IdempotencyKey, LoginAttempt, Category,
  Unit, Warehouse, Product, StockLevel, StockMovement, Customer, Supplier, Invoice,
  InvoiceItem, Voucher, Expense, Transfer, TransferItem).
- 10 money/stock totals: salesTotal, purchaseTotal, paidAmount, receipts, payments,
  expenses, customer opening dues, supplier opening dues, stockQty, ledgerQty.
- Tolerances: 0.005 for money sums, 0.0005 for quantity sums. Any discrepancy exits
  non-zero with `DO NOT switch production traffic`.

Result of the executed run: 1,591 rows across 19 tables, 0 discrepancies. The SQLite
source was left untouched.

## Rules going forward

1. Never run `db push` against a production database. It diffs the schema without a
   migration trail and can drop data. Production only ever runs
   `prisma migrate deploy`.
2. To change the schema:
   ```bash
   bunx prisma migrate dev --create-only --name <change>   # on a dev database
   # review the generated SQL in prisma/migrations/<ts>_<name>/
   bunx prisma migrate dev                                  # apply + verify locally
   ```
   Then ship the migration folder with the release; production applies it with
   `bun run db:deploy`.
3. Zero-downtime changes follow the expand/contract pattern:
   - Expand: additive migration first (new nullable column, new table, new index).
   - Deploy code that writes the new field while still reading the old one.
   - Backfill existing rows (in the migration or a scripted backfill).
   - Contract: remove the old column/table in a later migration, once no running
     release reads it.
4. Take a backup (`scripts/pg-backup.sh`) immediately before every `migrate deploy`
   on production. Forward-only migrations are rolled back by restoring that backup.
