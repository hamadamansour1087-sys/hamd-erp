#!/usr/bin/env bash
# H.A.M.D ERP — RESTORE VERIFICATION (a backup is not a backup until restored).
# docs/DISASTER-RECOVERY.md → "Restore drill".
#
# Extracts the LATEST backup into a scratch directory, boots a throwaway
# PostgreSQL instance on port 5433, verifies every table count + the money
# totals against the LIVE database, then shuts the scratch instance down and
# cleans up. Exits non-zero on any discrepancy.
#
# Usage: PGDATA=/home/z/pgdata PGBIN=/path/to/pg/bin ./scripts/pg-restore-verify.sh
set -euo pipefail
PGDATA="${PGDATA:?set PGDATA}"
PGBIN="${PGBIN:?set PGBIN}"
PGPORT="${PGPORT:-5432}"
PGSOCK="${PGSOCK:-/tmp}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
RESTORE_PORT=5433

LATEST="$(ls -t "$BACKUP_DIR"/hamd-pgdata-*.tar.gz | head -1)"
echo "[restore] latest backup: $LATEST"
sha256sum -c "$LATEST.sha256"

SCRATCH="$(mktemp -d /tmp/hamd-restore-XXXXXX)"
trap 'rm -rf "$SCRATCH"' EXIT
echo "[restore] extracting into $SCRATCH …"
tar -xzf "$LATEST" -C "$SCRATCH" --strip-components=1
rm -f "$SCRATCH/postmaster.pid" "$SCRATCH/postmaster.opts"

echo "[restore] booting scratch cluster on port $RESTORE_PORT …"
"$PGBIN/pg_ctl" -D "$SCRATCH" -o "-p $RESTORE_PORT -k $PGSOCK" -l "$SCRATCH/restore.log" start -w

echo "[restore] verifying data integrity (restored :$RESTORE_PORT vs live :$PGPORT) …"
set +e
LIVE_URL="postgresql://hamd@127.0.0.1:$PGPORT/hamd" \
RESTORE_URL="postgresql://hamd@127.0.0.1:$RESTORE_PORT/hamd" \
bun scripts/verify-restore.ts
RC=$?
set -e

echo "[restore] stopping scratch cluster …"
"$PGBIN/pg_ctl" -D "$SCRATCH" stop -m fast -w || true

if [ "$RC" -eq 0 ]; then
  echo "[restore] ✅ RESTORE DRILL PASSED — backup is provably restorable"
else
  echo "[restore] ❌ RESTORE DRILL FAILED (rc=$RC)"
fi
exit "$RC"
