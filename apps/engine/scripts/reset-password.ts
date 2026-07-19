import argon2 from 'argon2';
import { pool } from '../src/db/pool.js';

// Admin/dev tool to set a user's password directly (e.g. to recover a forgotten
// local account without the email flow).
//
//   pnpm exec tsx scripts/reset-password.ts <email> <newPassword>

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: pnpm exec tsx scripts/reset-password.ts <email> <newPassword>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const hash = await argon2.hash(password);
const res = await pool.query(
  'UPDATE users SET password_hash = $1 WHERE lower(email) = lower($2) RETURNING id, email',
  [hash, email],
);
if (res.rowCount) console.log(`✔ Password updated for ${res.rows[0].email} (id ${res.rows[0].id}).`);
else console.log(`No user found with email "${email}".`);
await pool.end();
