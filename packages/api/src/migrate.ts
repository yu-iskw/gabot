import { isMainModule } from '@gabot/common';
import postgres from 'postgres';

import { SCHEMA_SQL, SEED_SQL } from './db/schema-sql.js';
import * as schema from './db/schema.js';

export async function migrateDatabase(url: string): Promise<void> {
  const sql = postgres(url, { max: 1 });
  try {
    await sql.unsafe(SCHEMA_SQL);
    await sql.unsafe(SEED_SQL);
    await sql`
      INSERT INTO mastra_threads (id, resource_id, title)
      VALUES ('bootstrap', 'gabot', 'Mastra PostgresStore')
      ON CONFLICT (id) DO NOTHING
    `;
    console.info(`gabot migrate applied ${String(Object.keys(schema).length)} drizzle tables`);
  } finally {
    await sql.end();
  }
}

const url = process.env.DATABASE_URL;
if (url && isMainModule(import.meta.url)) {
  await migrateDatabase(url);
}
