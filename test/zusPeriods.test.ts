import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextSchemeStart,
  parseDate,
  schemeEndDate,
  todayInPoland,
} from "../src/tax/zusPeriods.ts";

test("ulga na start с 1-го числа: 6 месяцев включая месяц начала", () => {
  assert.deepEqual(schemeEndDate("ulga_na_start", { year: 2026, month: 3, day: 1 }), {
    year: 2026,
    month: 8,
    day: 31,
  });
  assert.deepEqual(nextSchemeStart("ulga_na_start", { year: 2026, month: 3, day: 1 }), {
    year: 2026,
    month: 9,
    day: 1,
  });
});

test("ulga na start с середины месяца: неполный месяц не считается", () => {
  assert.deepEqual(schemeEndDate("ulga_na_start", { year: 2026, month: 3, day: 15 }), {
    year: 2026,
    month: 9,
    day: 30,
  });
});

test("ulga na start через конец года", () => {
  assert.deepEqual(schemeEndDate("ulga_na_start", { year: 2026, month: 10, day: 20 }), {
    year: 2027,
    month: 4,
    day: 30,
  });
});

test("preferencyjny: 24 месяца", () => {
  assert.deepEqual(schemeEndDate("preferencyjny", { year: 2026, month: 9, day: 1 }), {
    year: 2028,
    month: 8,
    day: 31,
  });
  assert.deepEqual(schemeEndDate("preferencyjny", { year: 2025, month: 1, day: 10 }), {
    year: 2027,
    month: 1,
    day: 31,
  });
});

test("конец февраля в високосный год", () => {
  assert.deepEqual(schemeEndDate("ulga_na_start", { year: 2027, month: 8, day: 5 }), {
    year: 2028,
    month: 2,
    day: 29,
  });
});

test("разбор дат", () => {
  assert.deepEqual(parseDate("15.03.2026"), { year: 2026, month: 3, day: 15 });
  assert.deepEqual(parseDate(" 1/9/2025 "), { year: 2025, month: 9, day: 1 });
  assert.deepEqual(parseDate("2026-03-15"), { year: 2026, month: 3, day: 15 });
  assert.equal(parseDate("31.02.2026"), null);
  assert.equal(parseDate("март 2026"), null);
  assert.equal(parseDate("15.13.2026"), null);
});

test("сегодня по польскому времени", () => {
  // 23:30 UTC 31 декабря — в Варшаве уже 1 января.
  assert.deepEqual(todayInPoland(new Date("2026-12-31T23:30:00Z")), {
    year: 2027,
    month: 1,
    day: 1,
  });
});
