// Курсы NBP (таблица A, средний курс) для пересчёта выручки в валюте.
//
// Правило (ст. 11a ust. 1 закона о PIT): курс среднего NBP с последнего рабочего дня,
// предшествующего дню получения дохода. Поэтому ищем последнюю таблицу СТРОГО до даты.
// API: https://api.nbp.pl/api/exchangerates/rates/a/{code}/{start}/{end}/?format=json

export interface NbpRate {
  currency: string;
  /** Курс × 10 000 (4 знака после запятой, как публикует NBP), целое число. */
  rate4: number;
  /** Дата таблицы NBP, YYYY-MM-DD. */
  effectiveDate: string;
  tableNo: string;
}

export interface RateProvider {
  /** Курс с последнего рабочего дня перед датой дохода. */
  rateBefore(currency: string, revenueDate: string): Promise<NbpRate>;
}

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Курс строкой/числом с 4 знаками → целое ×10 000 без ошибок округления. */
export function toRate4(mid: number | string): number {
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(String(mid));
  if (!m) throw new Error(`Некорректный курс NBP: ${mid}`);
  return Number(m[1]) * 10_000 + Number((m[2] ?? "").padEnd(4, "0"));
}

/** Сумма в минимальных единицах валюты × курс → гроши (округление до гроша, половина вверх). */
export function convertToPln(minor: number, rate4: number): number {
  const sign = minor < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(minor) * rate4) / 10_000);
}

export class NbpClient implements RateProvider {
  private readonly fetchFn: typeof fetch;
  private readonly cache = new Map<string, NbpRate>();

  constructor(fetchFn: typeof fetch = fetch) {
    this.fetchFn = fetchFn;
  }

  async rateBefore(currency: string, revenueDate: string): Promise<NbpRate> {
    const code = currency.toUpperCase();
    if (code === "PLN") return { currency: "PLN", rate4: 10_000, effectiveDate: revenueDate, tableNo: "-" };
    const cacheKey = `${code}:${revenueDate}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const end = Date.parse(`${revenueDate}T00:00:00Z`) - DAY; // строго до даты дохода
    // 10 дней хватает на любые праздники подряд (Пасха, Рождество + выходные).
    const url = `https://api.nbp.pl/api/exchangerates/rates/a/${code.toLowerCase()}/${iso(end - 9 * DAY)}/${iso(end)}/?format=json`;
    const res = await this.fetchFn(url, { headers: { Accept: "application/json" } });
    if (res.status === 404) throw new Error(`NBP: нет курса ${code} за 10 дней до ${revenueDate}`);
    if (!res.ok) throw new Error(`NBP: HTTP ${res.status}`);
    const body = (await res.json()) as { rates: { no: string; effectiveDate: string; mid: number }[] };
    const last = body.rates.filter((r) => r.effectiveDate < revenueDate).at(-1);
    if (!last) throw new Error(`NBP: нет курса ${code} до ${revenueDate}`);

    const rate: NbpRate = { currency: code, rate4: toRate4(last.mid), effectiveDate: last.effectiveDate, tableNo: last.no };
    this.cache.set(cacheKey, rate);
    return rate;
  }
}
