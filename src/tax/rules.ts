// Налоговые параметры по годам (TaxRuleSet). Деньги — в грошах (целые числа).
//
// ВНИМАНИЕ: значения баз ZUS и зарплат НЕ сверены. Пока ruleset помечен
// verified: false, расчёт для реальных пользователей запускать нельзя
// (getRuleSet бросает ошибку). Сверить с консультантом и официальными
// объявлениями ZUS/GUS, затем выставить verified: true.

export type ZusScheme =
  | "ulga_na_start" // только здоровье, социальные 0 (первые 6 мес.)
  | "preferencyjny" // база 30% минимальной зарплаты (24 мес.)
  | "pelny"; // полный ZUS (база 60% прогноза средней зарплаты)

export interface ZusRates {
  emerytalne: number; // доля, например 0.1952
  rentowe: number;
  wypadkowe: number;
  chorobowe: number; // добровольный
  funduszPracy: number; // не вычитается из дохода
}

export interface RyczaltHealthTier {
  /** Верхняя граница годовой выручки в грошах; null — без границы. */
  maxAnnualRevenue: number | null;
  /** Месячный взнос на здоровье в грошах. */
  monthlyContribution: number;
}

export interface TaxRuleSet {
  year: number;
  verified: boolean;
  zusRates: ZusRates;
  /** Месячная база социальных взносов по схемам, грошей. */
  zusBase: Record<Exclude<ZusScheme, "ulga_na_start">, number>;
  ryczaltHealthTiers: RyczaltHealthTier[];
  /** Доля оплаченного взноса на здоровье, которую можно вычесть из выручки. */
  ryczaltHealthDeductibleShare: number;
}

const RATES: ZusRates = {
  emerytalne: 0.1952,
  rentowe: 0.08,
  wypadkowe: 0.0167,
  chorobowe: 0.0245,
  funduszPracy: 0.0245,
};

// TODO(verify): все суммы ниже — заглушки для разработки, не реальные значения.
const RULES: Record<number, TaxRuleSet> = {
  2026: {
    year: 2026,
    verified: false,
    zusRates: RATES,
    zusBase: { preferencyjny: 0, pelny: 0 },
    ryczaltHealthTiers: [
      { maxAnnualRevenue: 60_000_00, monthlyContribution: 0 },
      { maxAnnualRevenue: 300_000_00, monthlyContribution: 0 },
      { maxAnnualRevenue: null, monthlyContribution: 0 },
    ],
    ryczaltHealthDeductibleShare: 0.5,
  },
};

export function getRuleSet(year: number, opts: { allowUnverified?: boolean } = {}): TaxRuleSet {
  const rules = RULES[year];
  if (!rules) throw new Error(`Нет налоговых параметров для ${year} года`);
  if (!rules.verified && !opts.allowUnverified) {
    throw new Error(`Параметры ${year} года не сверены — расчёт для пользователей отключён`);
  }
  return rules;
}
