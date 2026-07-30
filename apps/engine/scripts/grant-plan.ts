import { many, none } from '../src/db/index.js';
import { pool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';

// Set a business's plan tier by owner email — used to comp/grant access without
// going through billing (e.g. the owner's own workspace, or a manual enterprise
// deal). Updates every business the email owns.
// Usage: tsx scripts/grant-plan.ts <email> <tier>
//   tier ∈ free | basico | avanzado | pro | enterprise

const TIERS = ['free', 'basico', 'avanzado', 'pro', 'enterprise'] as const;
type Tier = (typeof TIERS)[number];

const [email, tierArg] = process.argv.slice(2);
const tier = (tierArg ?? '').toLowerCase() as Tier;

if (!email || !tier) {
  console.error('usage: tsx scripts/grant-plan.ts <email> <tier>');
  console.error(`  tier ∈ ${TIERS.join(' | ')}`);
  process.exit(1);
}
if (!TIERS.includes(tier)) {
  console.error(`invalid tier "${tier}". Must be one of: ${TIERS.join(', ')}`);
  process.exit(1);
}

async function main() {
  await runMigrations();
  const businesses = await many<{ id: number; name: string; plan_tier: string }>(
    `SELECT b.id, b.name, b.plan_tier
       FROM businesses b
       JOIN memberships m ON m.business_id = b.id
       JOIN users u ON u.id = m.user_id
      WHERE lower(u.email) = lower($1)`,
    [email],
  );
  if (businesses.length === 0) {
    console.error(`no business found for ${email} — has the user registered yet?`);
    await pool.end();
    process.exit(1);
  }
  for (const b of businesses) {
    await none('UPDATE businesses SET plan_tier = $1 WHERE id = $2', [tier, b.id]);
    console.log(`business ${b.id} (${b.name || 'sin nombre'}): ${b.plan_tier} → ${tier}`);
  }
  console.log(`✓ ${email} is now on "${tier}" (${businesses.length} business${businesses.length > 1 ? 'es' : ''})`);
  await pool.end();
}

main().catch(async (err) => { console.error(err); await pool.end().catch(() => {}); process.exit(1); });
