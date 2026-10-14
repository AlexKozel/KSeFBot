import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidNip, normalizeNip, randomNip } from "../src/util/nip.ts";

test("проверка NIP", () => {
  assert.equal(isValidNip("5265877635"), true);
  assert.equal(isValidNip("PL 526-587-76-35"), true);
  assert.equal(isValidNip("5265877636"), false); // неверная контрольная цифра
  assert.equal(isValidNip("0265877635"), false);
  assert.equal(isValidNip("12345"), false);
  assert.equal(normalizeNip("PL526-587-76-35"), "5265877635");
});

test("случайные NIP всегда корректны", () => {
  for (let i = 0; i < 500; i++) assert.equal(isValidNip(randomNip()), true);
});
