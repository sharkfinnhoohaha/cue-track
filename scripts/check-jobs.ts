import { getDb } from '../src/lib/db';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

(async () => {
  console.log('Querying recent analyze jobs...');
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT id, status, method, error_text, created_at, started_at, finished_at, audio_size_bytes, mime, title
      FROM analyze_jobs
      ORDER BY created_at DESC
      LIMIT 10;
    `);
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error('Failed to query:', err);
  }
  process.exit(0);
})();
