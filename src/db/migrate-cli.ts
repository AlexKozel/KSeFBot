// npm run migrate — применяет миграции к базе из DATABASE_URL.
import pg from "pg";
import { migrate } from "./migrate.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const done = await migrate(pool);
  console.log(done.length ? `Применено: ${done.join(", ")}` : "Нечего применять");
} finally {
  await pool.end();
}
