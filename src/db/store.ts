// Хранилище пользователей и ответов онбординга.
// MemoryStore — для разработки и юнит-тестов, PgStore — для сервера.

import type { Lang } from "../i18n/index.ts";

export type AnswerField = "taxForm" | "vat" | "zus";

export interface UserRecord {
  telegramId: number;
  lang: Lang;
  answers: Partial<Record<AnswerField, string>>;
  completed: boolean;
}

export interface UserStore {
  /** Создаёт пользователя или меняет ему язык. */
  upsertUser(telegramId: number, lang: Lang): Promise<void>;
  getUser(telegramId: number): Promise<UserRecord | null>;
  saveAnswer(telegramId: number, field: AnswerField, value: string): Promise<void>;
  markCompleted(telegramId: number): Promise<void>;
  /** Удаляет пользователя и все его данные (GDPR, команда /delete). */
  deleteUser(telegramId: number): Promise<void>;
}

/** Допустимые значения ответов — те же, что в CHECK-ограничениях миграции. */
export const ANSWER_VALUES: Record<AnswerField, readonly string[]> = {
  taxForm: ["ryczalt", "liniowy", "skala", "unknown"],
  vat: ["yes", "no", "unknown"],
  zus: ["ulga_na_start", "preferencyjny", "pelny", "unknown"],
};

export function assertAnswer(field: AnswerField, value: string): void {
  if (!ANSWER_VALUES[field].includes(value)) {
    throw new Error(`Недопустимый ответ ${field}=${value}`);
  }
}

export class MemoryStore implements UserStore {
  private users = new Map<number, UserRecord>();

  async upsertUser(telegramId: number, lang: Lang): Promise<void> {
    const u = this.users.get(telegramId);
    if (u) u.lang = lang;
    else this.users.set(telegramId, { telegramId, lang, answers: {}, completed: false });
  }

  async getUser(telegramId: number): Promise<UserRecord | null> {
    const u = this.users.get(telegramId);
    return u ? structuredClone(u) : null;
  }

  async saveAnswer(telegramId: number, field: AnswerField, value: string): Promise<void> {
    assertAnswer(field, value);
    const u = this.users.get(telegramId);
    if (!u) throw new Error("Пользователь не найден");
    u.answers[field] = value;
  }

  async markCompleted(telegramId: number): Promise<void> {
    const u = this.users.get(telegramId);
    if (u) u.completed = true;
  }

  async deleteUser(telegramId: number): Promise<void> {
    this.users.delete(telegramId);
  }
}
