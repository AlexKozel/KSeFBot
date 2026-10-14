// Онбординг для листа ожидания: язык → форма налога → VAT → схема ZUS
// → (для ulga na start и preferencyjny) дата начала льготы.
// Ответы сохраняются в UserStore (PostgreSQL на сервере, память в разработке).

import { InlineKeyboard, type Bot, type Context } from "grammy";
import { texts, type Lang } from "../i18n/index.ts";
import type { AnswerField, UserStore } from "../db/store.ts";
import {
  NEXT_SCHEME,
  compareDates,
  formatDate,
  nextSchemeStart,
  parseDate,
  schemeEndDate,
  toIsoDate,
  todayInPoland,
  type LimitedScheme,
  type SimpleDate,
} from "../tax/zusPeriods.ts";

type Texts = (typeof texts)[Lang];

const LIMITED: readonly string[] = ["ulga_na_start", "preferencyjny"];

function keyboard(prefix: string, options: Record<string, string>): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const [key, label] of Object.entries(options)) kb.text(label, `${prefix}:${key}`).row();
  return kb;
}

async function langOf(store: UserStore, ctx: Context): Promise<Lang> {
  const id = ctx.from?.id;
  return (id && (await store.getUser(id))?.lang) || "ru";
}

/** Льготу могут оформлять заранее, но не больше чем на ~месяц вперёд. */
function tooFarInFuture(d: SimpleDate, today: SimpleDate): boolean {
  const days = (x: SimpleDate) => Date.UTC(x.year, x.month - 1, x.day) / 86_400_000;
  return days(d) - days(today) > 35;
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
    next: (tx: Texts, value: string) => { text: string; kb?: InlineKeyboard } | null,
  ) => {
    bot.callbackQuery(new RegExp(`^${prefix}:(\\w+)$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      const user = await store.getUser(ctx.from.id);
      if (!user) return ctx.reply(texts.ru.chooseLang); // начал не с /start
      const value = ctx.match[1]!;
      try {
        await store.saveAnswer(ctx.from.id, field, value);
      } catch {
        return; // устаревшая или подделанная кнопка
      }
      const tx = texts[user.lang];
      const n = next(tx, value);
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
  step("zus", "zus", (tx, value) =>
    LIMITED.includes(value)
      ? { text: tx.askZusSince(tx.schemeName[value as LimitedScheme]) }
      : null,
  );

  // Дата начала льготы — свободным текстом. Ждём её, только если выбрана
  // льготная схема и дата ещё не сохранена.
  bot.on("message:text", async (ctx, nextMiddleware) => {
    if (ctx.message.text.startsWith("/")) return nextMiddleware();
    const user = await store.getUser(ctx.from.id);
    const scheme = user?.answers.zus;
    if (!user || !scheme || !LIMITED.includes(scheme) || user.zusSince) return nextMiddleware();

    const tx = texts[user.lang];
    const date = parseDate(ctx.message.text);
    if (!date) return ctx.reply(tx.badDate);

    const today = todayInPoland();
    if (tooFarInFuture(date, today)) return ctx.reply(tx.futureDate);

    const limited = scheme as LimitedScheme;
    const end = schemeEndDate(limited, date);
    if (compareDates(end, today) < 0) {
      return ctx.reply(tx.schemeEnded(tx.schemeName[limited], formatDate(end)), {
        reply_markup: keyboard("zus", tx.zusSchemes),
      });
    }

    await store.saveZusSince(ctx.from.id, toIsoDate(date));
    await store.markCompleted(ctx.from.id);
    await ctx.reply(
      tx.zusSchedule(
        tx.schemeName[limited],
        formatDate(end),
        tx.schemeName[NEXT_SCHEME[limited]],
        formatDate(nextSchemeStart(limited, date)),
      ),
    );
    await ctx.reply(tx.done);
  });
}
