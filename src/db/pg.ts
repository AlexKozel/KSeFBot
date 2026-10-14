import pg from "pg";
import type { Lang } from "../i18n/index.ts";
import { assertAnswer, type AnswerField, type UserRecord, type UserStore } from "./store.ts";

const COLUMN: Record<AnswerField, string> = {
  taxForm: "tax_form",
  vat: "vat",
  zus: "zus",
};

export class PgStore implements UserStore {
  constructor(private pool: pg.Pool) {}

  async upsertUser(telegramId: number, lang: Lang): Promise<void> {
    await this.pool.query(
      `INSERT INTO users (telegram_id, lang) VALUES ($1, $2)
       ON CONFLICT (telegram_id) DO UPDATE SET lang = EXCLUDED.lang, updated_at = now()`,
      [telegramId, lang],
    );
  }

  async getUser(telegramId: number): Promise<UserRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT u.telegram_id, u.lang, a.tax_form, a.vat, a.zus, a.completed_at
         FROM users u LEFT JOIN onboarding_answers a ON a.user_id = u.id
        WHERE u.telegram_id = $1`,
      [telegramId],
    );
    const r = rows[0];
    if (!r) return null;
    const answers: UserRecord["answers"] = {};
    if (r.tax_form) answers.taxForm = r.tax_form;
    if (r.vat) answers.vat = r.vat;
    if (r.zus) answers.zus = r.zus;
    return {
      telegramId: Number(r.telegram_id),
      lang: r.lang,
      answers,
      completed: r.completed_at !== null && r.completed_at !== undefined,
    };
  }

  async saveAnswer(telegramId: number, field: AnswerField, value: string): Promise<void> {
    assertAnswer(field, value);
    // Имя колонки берётся только из фиксированной таблицы COLUMN, не из ввода пользователя.
    const col = COLUMN[field];
    const res = await this.pool.query(
      `INSERT INTO onboarding_answers (user_id, ${col})
       SELECT id, $2 FROM users WHERE telegram_id = $1
       ON CONFLICT (user_id) DO UPDATE SET ${col} = EXCLUDED.${col}, updated_at = now()`,
      [telegramId, value],
    );
    if (res.rowCount === 0) throw new Error("Пользователь не найден");
  }

  async markCompleted(telegramId: number): Promise<void> {
    await this.pool.query(
      `UPDATE onboarding_answers SET completed_at = now(), updated_at = now()
        WHERE user_id = (SELECT id FROM users WHERE telegram_id = $1)`,
      [telegramId],
    );
  }

  async deleteUser(telegramId: number): Promise<void> {
    await this.pool.query(`DELETE FROM users WHERE telegram_id = $1`, [telegramId]);
  }
}
