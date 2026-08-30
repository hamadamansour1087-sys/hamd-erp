#!/usr/bin/env bash
# H.A.M.D ERP — physical (cold) PostgreSQL backup.
# docs/DISASTER-RECOVERY.md → "Backup procedure (embedded/local cluster)".
#
# Stops the cluster (fast checkpoint), snapshots the data directory as a
# compressed tar + sha256 checksum, then restarts. For managed PostgreSQL
# (RDS/Cloud SQL/Neon) use their automated snapshots or pg_dump/pgBackrest
# instead — see docs/DISASTER-RECOVERY.md §"Managed deployments".
#
# Usage:  PGDATA=/path/to/pgdata PGBIN=/path/to/pg/bin ./scripts/pg-backup.sh
set -euo pipefail
PGDATA="${PGDATA:?set PGDATA}"
PGBIN="${PGBIN:?set PGBIN (dir containing pg_ctl)}"
PGPORT="${PGPORT:-5432}"
PGSOCK="${PGSOCK:-/tmp}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/hamd-pgdata-$STAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] stopping PostgreSQL (fast) …"
"$PGBIN/pg_ctl" -D "$PGDATA" stop -m fast -w

echo "[backup] snapshotting $PGDATA → $OUT"
tar -czf "$OUT" -C "$(dirname "$PGDATA")" "$(basename "$PGDATA")"
sha256sum "$OUT" | tee "$OUT.sha256"

echo "[backup] restarting PostgreSQL on port $PGPORT …"
"$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -k $PGSOCK" -l "$PGDATA/server.log" start -w

echo "[backup] DONE in $(du -h "$OUT" | cut -f1): $OUT"
echo "[backup] retention: keep daily ×14, weekly ×8, monthly ×6 (prune with:"
echo "[backup]   ls -t $BACKUP_DIR/hamd-pgdata-*.tar.gz | tail -n +15 | xargs rm -f )"
