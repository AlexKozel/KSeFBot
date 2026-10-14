import { z } from "zod";

const schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(20, "TELEGRAM_BOT_TOKEN не задан"),
  KSEF_ENV: z.enum(["test", "prod"]).default("test"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error("Ошибка конфигурации: " + parsed.error.issues.map((i) => i.message).join("; "));
  }
  return parsed.data;
}
