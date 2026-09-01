// Verify Neon schema after prisma migrate deploy
// Usage: DATABASE_URL=... node scripts/verify-neon.mjs
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const tables = await c.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1"
);
console.log(`tables: ${tables.rows.length}`);
console.log(tables.rows.map(r => r.table_name).join(', '));

const mig = await c.query(
  "SELECT migration_name, finished_at IS NOT NULL AS done FROM _prisma_migrations ORDER BY finished_at"
);
console.log('--- migration ledger ---');
for (const m of mig.rows) console.log(`${m.migration_name} => applied=${m.done}`);

const counts = {};
for (const t of ['User', 'Org', 'Sale', 'SaleLine', 'Product', 'RateLimitEvent']) {
  try {
    const r = await c.query(`SELECT count(*)::int AS n FROM "${t}"`);
    counts[t] = r.rows[0].n;
  } catch {
    counts[t] = 'MISSING';
  }
}
console.log('--- empty-table sanity ---');
console.log(JSON.stringify(counts));
await c.end();
