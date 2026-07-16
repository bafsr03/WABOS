import { runMigrations } from '../src/db/migrate.js';
import { pool } from '../src/db/pool.js';

// Apply all pending migrations, then exit. Used in dev/CI/deploy.
runMigrations()
  .then(async () => {
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = current_schema()",
    );
    console.log(`migrations applied · ${rows[0].n} tables in schema`);
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
