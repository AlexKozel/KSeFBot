import { Bot } from "grammy";
import pg from "pg";
import { loadConfig } from "./config.ts";
import { registerOnboarding } from "./bot/onboarding.ts";
import { MemoryStore, type UserStore } from "./db/store.ts";
import { PgStore } from "./db/pg.ts";
import { migrate } from "./db/migrate.ts";

const config = loadConfig();

let store: UserStore;
let pool: pg.Pool | undefined;
if (config.DATABASE_URL) {
  pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  const done = await migrate(pool);
  if (done.length) console.log(`Миграции применены: ${done.join(", ")}`);
  store = new PgStore(pool);
} else {
  console.warn("DATABASE_URL не задан — данные в памяти и пропадут при перезапуске");
  store = new MemoryStore();
}

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);
registerOnboarding(bot, store);
bot.catch((err) => console.error("bot error", err.error));

const stop = async () => {
  await bot.stop();
  await pool?.end();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

console.log(`KSeFBot запущен (KSeF: ${config.KSEF_ENV})`);
await bot.start();
