// Месячный расчёт для JDG на ryczałt: социальный ZUS, взнос на здоровье, аванс налога.
// Все суммы — в грошах. Каждый шаг сохраняется в `steps`, чтобы показать
// пользователю расчёт целиком и хранить его в MonthlyObligation.calculation.

import type { TaxRuleSet, ZusScheme } from "./rules.ts";

export interface RyczaltInput {
  /** Выручка за месяц, грошей. */
  monthRevenue: number;
  /** Ожидаемая выручка за год — определяет ступень взноса на здоровье. */
  annualRevenueForHealthTier: number;
  /** Ставка ryczałt, например 0.12 для IT. */
  rate: number;
  zusScheme: ZusScheme;
  voluntaryChorobowe: boolean;
}

export interface RyczaltStep {
  label: string;
  amount: number;
}

export interface RyczaltResult {
  zusSocial: number;
  zusSocialDeductible: number;
  health: number;
  taxBase: number;
  tax: number;
  totalToPay: number;
  steps: RyczaltStep[];
}

const ZL = 100;

/** Округление до полного злотого (суммы в грошах). */
export function roundToZloty(grosze: number): number {
  return Math.round(grosze / ZL) * ZL;
}

function pct(base: number, rate: number): number {
  return Math.round(base * rate);
}

export function socialZus(
  rules: TaxRuleSet,
  scheme: ZusScheme,
  voluntaryChorobowe: boolean,
): { total: number; deductible: number } {
  if (scheme === "ulga_na_start") return { total: 0, deductible: 0 };
  const base = rules.zusBase[scheme];
  const r = rules.zusRates;
  const pension = pct(base, r.emerytalne) + pct(base, r.rentowe) + pct(base, r.wypadkowe);
  const sick = voluntaryChorobowe ? pct(base, r.chorobowe) : 0;
  // Fundusz Pracy не платится на preferencyjny ZUS и не вычитается из выручки.
  const fp = scheme === "pelny" ? pct(base, r.funduszPracy) : 0;
  const deductible = pension + sick;
  return { total: deductible + fp, deductible };
}

export function healthContribution(rules: TaxRuleSet, annualRevenue: number): number {
  for (const tier of rules.ryczaltHealthTiers) {
    if (tier.maxAnnualRevenue === null || annualRevenue <= tier.maxAnnualRevenue) {
      return tier.monthlyContribution;
    }
  }
  throw new Error("Не найдена ступень взноса на здоровье");
}

export function calculateRyczaltMonth(rules: TaxRuleSet, input: RyczaltInput): RyczaltResult {
  if (input.monthRevenue < 0) throw new Error("Выручка не может быть отрицательной");
  if (input.rate <= 0 || input.rate >= 1) throw new Error("Некорректная ставка ryczałt");

  const zus = socialZus(rules, input.zusScheme, input.voluntaryChorobowe);
  const health = healthContribution(rules, input.annualRevenueForHealthTier);
  const healthDeductible = Math.round(health * rules.ryczaltHealthDeductibleShare);

  const rawBase = input.monthRevenue - zus.deductible - healthDeductible;
  const taxBase = Math.max(0, roundToZloty(rawBase));
  const tax = roundToZloty(Math.round(taxBase * input.rate));

  return {
    zusSocial: zus.total,
    zusSocialDeductible: zus.deductible,
    health,
    taxBase,
    tax,
    totalToPay: zus.total + health + tax,
    steps: [
      { label: "Выручка за месяц", amount: input.monthRevenue },
      { label: "Социальный ZUS к вычету", amount: -zus.deductible },
      { label: "Вычет части взноса на здоровье", amount: -healthDeductible },
      { label: "База налога (до полного злотого)", amount: taxBase },
      { label: `Налог ${(input.rate * 100).toFixed(1)}%`, amount: tax },
      { label: "Социальный ZUS к оплате", amount: zus.total },
      { label: "Взнос на здоровье к оплате", amount: health },
    ],
  };
}
