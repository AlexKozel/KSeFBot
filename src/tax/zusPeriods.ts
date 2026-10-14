// Сроки льготных схем ZUS по дате их начала.
//
// ulga na start  — 6 полных календарных месяцев;
// preferencyjny  — 24 полных календарных месяца.
// Если схема началась 1-го числа, этот месяц считается полным; если позже — неполный
// месяц не входит в счёт, и льгота длится до конца 6-го (24-го) следующего месяца.
//
// TODO(verify): правила сверить с консультантом. Пользователю показываем срок как
// ориентировочный и советуем сверить в PUE/eZUS.

export type LimitedScheme = "ulga_na_start" | "preferencyjny";

export interface SimpleDate {
  year: number;
  month: number; // 1–12
  day: number;
}

const LENGTH_MONTHS: Record<LimitedScheme, number> = {
  ulga_na_start: 6,
  preferencyjny: 24,
};

export const NEXT_SCHEME: Record<LimitedScheme, "preferencyjny" | "pelny"> = {
  ulga_na_start: "preferencyjny",
  preferencyjny: "pelny",
};

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + n;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function isValidDate(d: SimpleDate): boolean {
  return (
    Number.isInteger(d.year) &&
    d.year >= 2000 &&
    d.year <= 2100 &&
    d.month >= 1 &&
    d.month <= 12 &&
    d.day >= 1 &&
    d.day <= lastDayOfMonth(d.year, d.month)
  );
}

/** Разбирает «15.03.2026», «15/03/2026», «2026-03-15». */
export function parseDate(text: string): SimpleDate | null {
  const s = text.trim();
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  let d: SimpleDate | null = null;
  if (m) d = { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) };
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) d = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  return d && isValidDate(d) ? d : null;
}

export function compareDates(a: SimpleDate, b: SimpleDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** Последний день действия льготной схемы. */
export function schemeEndDate(scheme: LimitedScheme, start: SimpleDate): SimpleDate {
  if (!isValidDate(start)) throw new Error("Некорректная дата начала");
  // С 1-го числа месяц начала — первый полный; иначе отсчёт со следующего месяца.
  const offset = LENGTH_MONTHS[scheme] - (start.day === 1 ? 1 : 0);
  const end = addMonths(start.year, start.month, offset);
  return { ...end, day: lastDayOfMonth(end.year, end.month) };
}

/** День, с которого действует следующая схема. */
export function nextSchemeStart(scheme: LimitedScheme, start: SimpleDate): SimpleDate {
  const end = schemeEndDate(scheme, start);
  const next = addMonths(end.year, end.month, 1);
  return { ...next, day: 1 };
}

export function formatDate(d: SimpleDate): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.day)}.${p(d.month)}.${d.year}`;
}

export function toIsoDate(d: SimpleDate): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.year}-${p(d.month)}-${p(d.day)}`;
}

/** Сегодняшняя дата в Польше (без времени). */
export function todayInPoland(now: Date = new Date()): SimpleDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}
