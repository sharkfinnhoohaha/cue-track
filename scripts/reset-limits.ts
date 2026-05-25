import { getDb } from '../src/lib/db';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

(async () => {
  console.log('Resetting rate limits and database jobs...');
  try {
    const db = getDb();
    await db.execute(sql`TRUNCATE TABLE rate_limits CASCADE;`);
    await db.execute(sql`TRUNCATE TABLE upload_analyses CASCADE;`);
    await db.execute(sql`TRUNCATE TABLE analyze_jobs CASCADE;`);
    await db.execute(sql`TRUNCATE TABLE tracks CASCADE;`);
    console.log('Successfully reset all limits and jobs!');
  } catch (err) {
    console.error('Failed to reset:', err);
  }
  process.exit(0);
})();
