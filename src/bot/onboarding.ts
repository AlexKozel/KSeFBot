// Онбординг для листа ожидания: язык → форма налога → VAT → схема ZUS.
// Ответы сохраняются в UserStore (PostgreSQL на сервере, память в разработке).

import { InlineKeyboard, type Bot, type Context } from "grammy";
import { texts, type Lang } from "../i18n/index.ts";
import type { AnswerField, UserStore } from "../db/store.ts";

function keyboard(prefix: string, options: Record<string, string>): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const [key, label] of Object.entries(options)) kb.text(label, `${prefix}:${key}`).row();
  return kb;
}

async function langOf(store: UserStore, ctx: Context): Promise<Lang> {
  const id = ctx.from?.id;
  return (id && (await store.getUser(id))?.lang) || "ru";
}

export function registerOnboarding(bot: Bot, store: UserStore): void {
  bot.command("start", (ctx) =>
    ctx.reply(texts.ru.chooseLang, {
      reply_markup: new InlineKeyboard().text("Русский", "lang:ru").text("Українська", "lang:uk"),
    }),
  );

  bot.command("delete", async (ctx) => {
    if (!ctx.from) return;
    const tx = texts[await langOf(store, ctx)];
    await store.deleteUser(ctx.from.id);
    await ctx.reply(tx.deleted);
  });

  bot.callbackQuery(/^lang:(ru|uk)$/, async (ctx) => {
    const lang = ctx.match[1] as Lang;
    await store.upsertUser(ctx.from.id, lang);
    const tx = texts[lang];
    await ctx.answerCallbackQuery();
    await ctx.reply(tx.welcome);
    await ctx.reply(tx.askTaxForm, { reply_markup: keyboard("tax", tx.taxForms) });
  });

  // Шаг онбординга: сохраняет ответ и задаёт следующий вопрос (или завершает).
  const step = (
    prefix: string,
    field: AnswerField,
    next: (tx: (typeof texts)[Lang]) => { text: string; kb?: InlineKeyboard } | null,
  ) => {
    bot.callbackQuery(new RegExp(`^${prefix}:(\\w+)$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      const user = await store.getUser(ctx.from.id);
      if (!user) return ctx.reply(texts.ru.chooseLang); // начал не с /start
      try {
        await store.saveAnswer(ctx.from.id, field, ctx.match[1]!);
      } catch {
        return; // устаревшая или подделанная кнопка
      }
      const tx = texts[user.lang];
      const n = next(tx);
      if (n) return ctx.reply(n.text, n.kb ? { reply_markup: n.kb } : {});
      await store.markCompleted(ctx.from.id);
      await ctx.reply(tx.done);
    });
  };

  step("tax", "taxForm", (tx) => ({
    text: tx.askVat,
    kb: keyboard("vat", { yes: tx.yes, no: tx.no, unknown: tx.dontKnow }),
  }));
  step("vat", "vat", (tx) => ({ text: tx.askZus, kb: keyboard("zus", tx.zusSchemes) }));
  step("zus", "zus", () => null);
}
