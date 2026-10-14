// Тесты проверяют формулу на синтетических параметрах (не реальные ставки года).
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateRyczaltMonth, roundToZloty, socialZus } from "../src/tax/ryczalt.ts";
import { getRuleSet, type TaxRuleSet } from "../src/tax/rules.ts";

const FAKE: TaxRuleSet = {
  year: 2099,
  verified: true,
  zusRates: { emerytalne: 0.1952, rentowe: 0.08, wypadkowe: 0.0167, chorobowe: 0.0245, funduszPracy: 0.0245 },
  zusBase: { preferencyjny: 1_000_00, pelny: 5_000_00 },
  ryczaltHealthTiers: [
    { maxAnnualRevenue: 60_000_00, monthlyContribution: 400_00 },
    { maxAnnualRevenue: 300_000_00, monthlyContribution: 700_00 },
    { maxAnnualRevenue: null, monthlyContribution: 1_200_00 },
  ],
  ryczaltHealthDeductibleShare: 0.5,
};

test("округление до злотого", () => {
  assert.equal(roundToZloty(12_349), 12_300);
  assert.equal(roundToZloty(12_350), 12_400);
});

test("ulga na start: социальных взносов нет", () => {
  assert.deepEqual(socialZus(FAKE, "ulga_na_start", true), { total: 0, deductible: 0 });
});

test("полный ZUS: Fundusz Pracy платится, но не вычитается", () => {
  const z = socialZus(FAKE, "pelny", false);
  // 5000 × (19.52% + 8% + 1.67%) = 1459.50; FP 2.45% = 122.50
  assert.equal(z.deductible, 1_459_50);
  assert.equal(z.total, 1_459_50 + 122_50);
});

test("preferencyjny ZUS без Fundusz Pracy, с добровольным chorobowe", () => {
  const z = socialZus(FAKE, "preferencyjny", true);
  // 1000 × (29.19% + 2.45%) = 316.40
  assert.equal(z.deductible, 316_40);
  assert.equal(z.total, 316_40);
});

test("месячный расчёт IT 12%, средняя ступень здоровья", () => {
  const r = calculateRyczaltMonth(FAKE, {
    monthRevenue: 20_000_00,
    annualRevenueForHealthTier: 240_000_00,
    rate: 0.12,
    zusScheme: "pelny",
    voluntaryChorobowe: false,
  });
  // база: 20000 − 1459.50 − 350 = 18190.50 → 18191; налог 12% = 2182.92 → 2183
  assert.equal(r.health, 700_00);
  assert.equal(r.taxBase, 18_191_00);
  assert.equal(r.tax, 2_183_00);
  assert.equal(r.totalToPay, 1_582_00 + 700_00 + 2_183_00);
});

test("база не уходит в минус", () => {
  const r = calculateRyczaltMonth(FAKE, {
    monthRevenue: 500_00,
    annualRevenueForHealthTier: 6_000_00,
    rate: 0.12,
    zusScheme: "pelny",
    voluntaryChorobowe: false,
  });
  assert.equal(r.taxBase, 0);
  assert.equal(r.tax, 0);
});

test("несверенные параметры года не отдаются для расчёта", () => {
  assert.throws(() => getRuleSet(2026), /не сверены/);
  assert.equal(getRuleSet(2026, { allowUnverified: true }).year, 2026);
});
