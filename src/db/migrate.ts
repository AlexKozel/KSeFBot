// Простые миграции: применяет файлы migrations/*.sql по порядку, каждый — в транзакции.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const DIR = new URL("../../migrations/", import.meta.url).pathname;

export async function migrate(pool: pg.Pool): Promise<string[]> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  const { rows } = await pool.query<{ name: string }>(`SELECT name FROM schema_migrations`);
  const applied = new Set(rows.map((r) => r.name));
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
  const done: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
      await client.query("COMMIT");
      done.push(file);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Миграция ${file} не применилась: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return done;
}
