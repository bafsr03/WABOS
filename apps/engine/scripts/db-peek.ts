import { pool } from '../src/db/pool.js';

// Tiny dev helper to run a one-off SQL query against the local database without
// needing the `psql` client installed. Pass SQL as the first arg, or run with no
// args to dump the billing-relevant columns of every business.
//
//   pnpm exec tsx scripts/db-peek.ts
//   pnpm exec tsx scripts/db-peek.ts "update businesses set plan_tier='free' where id=1"

const sql = process.argv[2]
  ?? 'select id, plan_tier, subscription_status, billing_subscription_id, billing_customer_id from businesses order by id';

const res = await pool.query(sql);
if (res.rows.length) console.table(res.rows);
else console.log(`OK — ${res.rowCount} row(s) affected.`);
await pool.end();
