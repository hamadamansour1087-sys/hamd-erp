# Disaster Recovery — H.A.M.D ERP

Recovery targets for the self-hosted PostgreSQL deployment:

| Target | Value | How it is met |
|--------|-------|---------------|
| RPO    | 24 h  | nightly cold backup (or 1 h with a cron for active shops) |
| RTO    | < 15 min | decompress + boot + verify + DNS switch; measured drill completes in seconds |
| Restore proof | mandatory monthly | full restore drill with data comparison |

Rule: **a backup is not a backup until it has been restored.** A tarball without a
verified restore is a hope, not a capability. The restore drill below is therefore a
mandatory monthly procedure, not a nice-to-have.

## Backup strategy

Nightly physical cold backup of the PostgreSQL data directory (default RPO = 24 h).
For shops with heavy intraday activity, schedule the same script every hour to bring
RPO down to 1 h.

Retention policy:

| Class  | Copies kept |
|--------|-------------|
| Daily  | 14          |
| Weekly | 8           |
| Monthly| 6           |

## Backup procedure (embedded/local cluster)

`scripts/pg-backup.sh` performs a cold (offline-consistent) backup:

1. `pg_ctl stop -m fast` — clean checkpoint and shutdown.
2. `tar -czf backups/hamd-pgdata-<UTC-stamp>.tar.gz <PGDATA>` — compressed snapshot
   of the data directory.
3. `sha256sum` written next to the archive (`<name>.tar.gz.sha256`).
4. `pg_ctl start` — PostgreSQL restarted on the configured port.

Environment: `PGDATA`, `PGBIN` (directory containing `pg_ctl`), `PGPORT` (default
5432), `PGSOCK` (default /tmp), `BACKUP_DIR` (default `./backups`).

All commands below use placeholders instead of machine-specific paths. Determine
the values for YOUR environment once and reuse them:

```bash
# PGDATA   → the data directory you initialised with initdb; on a running
#            cluster you can read it directly from PostgreSQL:
#              psql -U postgres -c 'SHOW data_directory;'
# PGBIN    → directory containing pg_ctl, e.g.:
pg_config --bindir          # common results: /usr/lib/postgresql/16/bin, /usr/pgsql-16/bin
```

```bash
PGDATA=<PGDATA_PATH> PGBIN=<PGBIN_PATH> ./scripts/pg-backup.sh
```

Reference run: backup of the live dataset is ~18 MB compressed; the script prints
the size and the retention prune hint on completion. Copy the `.tar.gz` + `.sha256`
pair off the host (separate machine or object storage) — a backup on the same disk
as the database does not survive that disk.

### Managed deployments

On managed PostgreSQL (RDS / Cloud SQL / Neon):

- Use the provider's automated daily snapshots at minimum (equivalent RPO).
- Or run a nightly `pg_dump -Fc` to object storage.
- For near-zero RPO, enable WAL archiving / pgBackrest (or the provider's
  point-in-time recovery) so recovery can target any recent second instead of the
  last snapshot.

## Restore procedure (full drill)

`scripts/pg-restore-verify.sh` + `scripts/verify-restore.ts` perform the complete,
provable drill:

1. Pick the latest `backups/hamd-pgdata-*.tar.gz` and verify its `sha256sum -c`.
2. Extract into a scratch directory, remove stale `postmaster.pid`/`postmaster.opts`.
3. Boot a throwaway PostgreSQL instance on port 5433 (never touching the live one).
4. Compare restored vs live: 19 table counts + 8 money/stock totals
   (salesTotal, purchaseTotal, paidAmount, receipts, payments, expenses, stockQty,
   ledgerQty). Any mismatch exits non-zero.
5. Stop the scratch cluster and clean up.

```bash
PGDATA=<PGDATA_PATH> PGBIN=<PGBIN_PATH> ./scripts/pg-restore-verify.sh
# ... [restore] RESTORE DRILL PASSED — backup is provably restorable
```

Last executed drill: PASSED, 0 discrepancies; restore boot + verification took
seconds on the ~18 MB backup.

### Real failure (not a drill)

To actually fail over onto a backup:

```bash
# 1) stop the app instances (they are stateless — restart is trivial)
# 2) stop/replace the broken cluster, restore the data directory.
#    RESTORE_DIR must be OUTSIDE the live PGDATA (scratch location, e.g.
#    /var/tmp/hamd-pgdata-restored — pick any path with enough free space):
RESTORE_DIR=<RESTORE_DIR>
mkdir -p "$RESTORE_DIR"
tar -xzf backups/hamd-pgdata-<stamp>.tar.gz -C "$RESTORE_DIR" --strip-components=1
rm -f "$RESTORE_DIR/postmaster.pid" "$RESTORE_DIR/postmaster.opts"
# 3) start PostgreSQL on the data dir (or swap directories and start as usual)
# 4) curl /api/health until 200, restart app instances, update DNS / proxy upstream
```

## Monthly drill (mandatory)

First Monday of every month, or after any change to PGDATA location, PostgreSQL
version or backup script:

```bash
./scripts/pg-backup.sh          # fresh backup
./scripts/pg-restore-verify.sh  # prove it restores, diff must be 0
```

Record the output (date, backup file, sha256, drill result) in the ops log. If the
drill fails, treat it as an incident: fix the backup path before the next business
day.

## What the drill does NOT cover

- Off-host copy integrity: copy artifacts off the server and checksum them there.
- WAL-level point-in-time recovery: not implemented for the embedded cluster; RPO
  stays at the backup interval. Adopt pgBackrest/WAL archiving when the business
  needs RPO under 1 h.
