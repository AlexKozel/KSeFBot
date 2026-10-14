// Онбординг для листа ожидания: язык → форма налога → VAT → схема ZUS.
// Пока ответы хранятся в памяти; в следующем шаге — PostgreSQL (User, Business).

import { Bot, InlineKeyboard, type Context } from "grammy";
import { texts, type Lang } from "../i18n/index.ts";

export interface WaitlistAnswers {
  lang: Lang;
  taxForm?: string;
  vat?: string;
  zus?: string;
}

export const waitlist = new Map<number, WaitlistAnswers>();

function t(ctx: Context) {
  const id = ctx.from?.id;
  const lang = (id && waitlist.get(id)?.lang) || "ru";
  return texts[lang];
}

function keyboard(prefix: string, options: Record<string, string>): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const [key, label] of Object.entries(options)) kb.text(label, `${prefix}:${key}`).row();
  return kb;
}

export function registerOnboarding(bot: Bot): void {
  bot.command("start", (ctx) =>
    ctx.reply(texts.ru.chooseLang, {
      reply_markup: new InlineKeyboard().text("Русский", "lang:ru").text("Українська", "lang:uk"),
    }),
  );

  bot.callbackQuery(/^lang:(ru|uk)$/, async (ctx) => {
    const lang = ctx.match[1] as Lang;
    waitlist.set(ctx.from.id, { lang });
    const tx = texts[lang];
    await ctx.answerCallbackQuery();
    await ctx.reply(tx.welcome);
    await ctx.reply(tx.askTaxForm, { reply_markup: keyboard("tax", tx.taxForms) });
  });

  bot.callbackQuery(/^tax:(\w+)$/, async (ctx) => {
    const a = waitlist.get(ctx.from.id);
    if (!a) return ctx.answerCallbackQuery();
    a.taxForm = ctx.match[1];
    const tx = t(ctx);
    await ctx.answerCallbackQuery();
    await ctx.reply(tx.askVat, {
      reply_markup: keyboard("vat", { yes: tx.yes, no: tx.no, unknown: tx.dontKnow }),
    });
  });

  bot.callbackQuery(/^vat:(\w+)$/, async (ctx) => {
    const a = waitlist.get(ctx.from.id);
    if (!a) return ctx.answerCallbackQuery();
    a.vat = ctx.match[1];
    const tx = t(ctx);
    await ctx.answerCallbackQuery();
    await ctx.reply(tx.askZus, { reply_markup: keyboard("zus", tx.zusSchemes) });
  });

  bot.callbackQuery(/^zus:(\w+)$/, async (ctx) => {
    const a = waitlist.get(ctx.from.id);
    if (!a) return ctx.answerCallbackQuery();
    a.zus = ctx.match[1];
    await ctx.answerCallbackQuery();
    await ctx.reply(t(ctx).done);
    console.log("waitlist", ctx.from.id, JSON.stringify(a));
  });
}
