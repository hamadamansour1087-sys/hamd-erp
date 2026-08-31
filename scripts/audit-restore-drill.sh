#!/usr/bin/env bash
# AUDIT DRILL — non-zero-data restore verification on a THROWAWAY database.
# Creates hamd_drill (same cluster, port 5432), pushes the schema, inserts a
# synthetic tenant dataset (org/user/product/customer/invoice+voucher/
# expense/transfer), then runs the cold backup + scratch-cluster restore and
# verifies counts + money totals against hamd_drill — WITHOUT touching the
# live 'hamd' database. Drops hamd_drill at the end.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

PGBIN=/home/z/pg-setup/node_modules/@embedded-postgres/linux-x64/native/bin
LIBDIR=/home/z/pg-setup/node_modules/@embedded-postgres/linux-x64/native/lib
export LD_LIBRARY_PATH="$LIBDIR:${LD_LIBRARY_PATH:-}"
export PATH="$PGBIN:$PATH"
# The embedded bundle ships no psql — run admin SQL through bun + node-pg.
run_sql() { # run_sql "<db>" "<sql>"
  bun -e '
import { Client } from "pg"
const c = new Client({ connectionString: `postgresql://hamd@127.0.0.1:5432/${process.argv[1]}` })
await c.connect()
await c.query(process.argv[2])
await c.end()
' "$1" "$2"
}
PGDATA="$ROOT/.pgdata"
PGPORT=5432
PGSOCK=/tmp
BACKUP_DIR="$ROOT/backups"
DRILL_DB=hamd_drill
DRILL_URL="postgresql://hamd@127.0.0.1:5432/${DRILL_DB}"
export DATABASE_URL="$DRILL_URL"

# 1) create the drill database
run_sql postgres "DROP DATABASE IF EXISTS ${DRILL_DB};"
run_sql postgres "CREATE DATABASE ${DRILL_DB};"
bunx prisma db push --skip-generate >/dev/null 2>&1

# 2) synthetic dataset (isolated: new org, new user, seeded docs)
bun -e '
import { PrismaClient } from "@prisma/client"
const d = new PrismaClient()
const org = await d.org.create({ data: { name: "DRILL-ORG", status: "ACTIVE" } })
const u = await d.user.create({ data: { orgId: org.id, email: "drill@x.test", name: "drill", passwordHash: "aa:bb", role: "ADMIN" } })
const wh = await d.warehouse.create({ data: { orgId: org.id, name: "W1", isDefault: true } })
const p1 = await d.product.create({ data: { orgId: org.id, name: "P1", cost: 10.5, price: 20.25 } })
const c1 = await d.customer.create({ data: { orgId: org.id, name: "C1", openingBalance: 5 } })
await d.stockLevel.create({ data: { productId: p1.id, warehouseId: wh.id, qty: 100 } })
const inv = await d.invoice.create({ data: { orgId: org.id, number: 1, type: "SALE", status: "PAID", customerId: c1.id, warehouseId: wh.id, userId: u.id, subtotal: 40.5, total: 40.5, paidAmount: 40.5, costTotal: 21 } })
await d.invoiceItem.create({ data: { invoiceId: inv.id, productId: p1.id, nameSnap: "P1", qty: 2, price: 20.25, costAtSale: 10.5, total: 40.5 } })
await d.stockLevel.update({ where: { productId_warehouseId: { productId: p1.id, warehouseId: wh.id } }, data: { qty: 98 } })
await d.stockMovement.create({ data: { orgId: org.id, productId: p1.id, warehouseId: wh.id, qty: -2, kind: "SALE", refType: "INVOICE", refId: inv.id, userId: u.id } })
await d.voucher.create({ data: { orgId: org.id, number: 1, type: "RECEIPT", method: "CASH", amount: 40.5, partyType: "CUSTOMER", customerId: c1.id, invoiceId: inv.id, userId: u.id } })
await d.expense.create({ data: { orgId: org.id, category: "drill", amount: 7.25, userId: u.id } })
await d.$disconnect()
console.log("[drill] synthetic dataset inserted")
'

# 3) cold backup (brief cluster stop/start — same as the documented drill)
PGBIN="$PGBIN" PGDATA="$PGDATA" PGPORT="$PGPORT" PGSOCK="$PGSOCK" BACKUP_DIR="$BACKUP_DIR" bash scripts/pg-backup.sh >/dev/null 2>&1
echo "[drill] cold backup taken"

# 4) scratch-cluster restore (extract latest, boot :5433)
LATEST="$(ls -t "$BACKUP_DIR"/hamd-pgdata-*.tar.gz | head -1)"
sha256sum -c "$LATEST.sha256" >/dev/null
SCRATCH="$(mktemp -d /tmp/hamd-drill-XXXXXX)"
tar -xzf "$LATEST" -C "$SCRATCH" --strip-components=1
rm -f "$SCRATCH/postmaster.pid" "$SCRATCH/postmaster.opts"
"$PGBIN/pg_ctl" -D "$SCRATCH" -o "-p 5433 -k $PGSOCK" -l "$SCRATCH/restore.log" start -w >/dev/null 2>&1
echo "[drill] scratch cluster booted on :5433"

# 5) verify hamd_drill live vs restored
set +e
LIVE_URL="$DRILL_URL" RESTORE_URL="postgresql://hamd@127.0.0.1:5433/${DRILL_DB}" bun scripts/verify-restore.ts
RC=$?
set -e

# 6) cleanup: scratch cluster + drill database
"$PGBIN/pg_ctl" -D "$SCRATCH" stop -m fast -w >/dev/null 2>&1 || true
rm -rf "$SCRATCH"
run_sql postgres "DROP DATABASE IF EXISTS ${DRILL_DB};"
echo "[drill] cleanup done (scratch cluster + ${DRILL_DB} dropped)"
exit $RC
