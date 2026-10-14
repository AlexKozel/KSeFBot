// Один и тот же набор проверок для MemoryStore и PgStore.
// PgStore проверяется только при заданном DATABASE_URL (в CI — всегда).
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore, type UserStore } from "../src/db/store.ts";

async function contract(name: string, make: () => Promise<{ store: UserStore; done: () => Promise<void> }>) {
  test(`${name}: онбординг сохраняется целиком`, async () => {
    const { store, done } = await make();
    try {
      await store.upsertUser(101, "uk");
      await store.saveAnswer(101, "taxForm", "ryczalt");
      await store.saveAnswer(101, "vat", "no");
      await store.saveAnswer(101, "zus", "pelny");
      await store.markCompleted(101);
      assert.deepEqual(await store.getUser(101), {
        telegramId: 101,
        lang: "uk",
        answers: { taxForm: "ryczalt", vat: "no", zus: "pelny" },
        completed: true,
      });
    } finally {
      await done();
    }
  });

  test(`${name}: повторный /start меняет язык и не теряет ответы`, async () => {
    const { store, done } = await make();
    try {
      await store.upsertUser(102, "ru");
      await store.saveAnswer(102, "taxForm", "skala");
      await store.upsertUser(102, "uk");
      const u = await store.getUser(102);
      assert.equal(u?.lang, "uk");
      assert.equal(u?.answers.taxForm, "skala");
      assert.equal(u?.completed, false);
    } finally {
      await done();
    }
  });

  test(`${name}: недопустимый ответ отклоняется`, async () => {
    const { store, done } = await make();
    try {
      await store.upsertUser(103, "ru");
      await assert.rejects(store.saveAnswer(103, "vat", "maybe"), /Недопустимый/);
      await assert.rejects(store.saveAnswer(999, "vat", "yes"), /не найден/);
    } finally {
      await done();
    }
  });

  test(`${name}: /delete удаляет всё`, async () => {
    const { store, done } = await make();
    try {
      await store.upsertUser(104, "ru");
      await store.saveAnswer(104, "zus", "ulga_na_start");
      await store.deleteUser(104);
      assert.equal(await store.getUser(104), null);
    } finally {
      await done();
    }
  });
}

await contract("MemoryStore", async () => ({ store: new MemoryStore(), done: async () => {} }));

if (process.env.DATABASE_URL) {
  const { default: pg } = await import("pg");
  const { PgStore } = await import("../src/db/pg.ts");
  const { migrate } = await import("../src/db/migrate.ts");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(pool);
  await migrate(pool); // повторный запуск ничего не ломает
  await contract("PgStore", async () => {
    await pool.query("TRUNCATE users CASCADE");
    return { store: new PgStore(pool), done: async () => {} };
  });
  test.after(() => pool.end());
}
