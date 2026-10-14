import { Bot } from "grammy";
import { loadConfig } from "./config.ts";
import { registerOnboarding } from "./bot/onboarding.ts";

const config = loadConfig();
const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

registerOnboarding(bot);
bot.catch((err) => console.error("bot error", err.error));

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

console.log(`KSeFBot запущен (KSeF: ${config.KSEF_ENV})`);
await bot.start();
