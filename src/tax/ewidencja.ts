// Ewidencja przychodów для ryczałt: записи из фактур продаж.
//
// Дата дохода (ст. 14 закона о PIT):
//   ust. 1e — услуга в расчётных периодах (OkresFa на фактуре): последний день периода;
//   ust. 1c — иначе: день оказания услуги, но не позже дня выставления фактуры.
// (Оплата раньше услуги тоже создаёт доход — об оплатах мы пока не знаем.)
// Сумма дохода — нетто (без VAT), в злотых по курсу NBP с дня перед датой дохода.
//
// TODO(verify): правила даты дохода и состав записи сверить с консультантом.

import type { Fa3Invoice } from "../ksef/fa3.ts";
import { convertToPln, type RateProvider } from "./nbp.ts";

export interface RevenueEntry {
  lp: number; // порядковый номер в году
  revenueDate: string; // дата получения дохода
  documentNumber: string; // номер фактуры
  ksefNumber: string | null;
  buyer: string;
  currency: string;
  amountOriginal: number; // нетто в минимальных единицах валюты
  rate4: number | null; // курс NBP ×10 000 (null для PLN)
  rateDate: string | null;
  rateTable: string | null;
  amountPln: number; // гроши
  ryczaltRate: number; // например 0.12
  remarks: string[];
}

export interface InvoiceForEwidencja {
  ksefNumber: string | null;
  invoice: Fa3Invoice;
}

export function revenueDate(f: Fa3Invoice): string {
  if (f.servicePeriod) return f.servicePeriod.to;
  if (f.serviceDate && f.serviceDate < f.issueDate) return f.serviceDate;
  return f.issueDate;
}

function buyerLabel(f: Fa3Invoice): string {
  const id = f.buyer.nip ?? f.buyer.vatUe ?? f.buyer.otherId ?? "";
  return [f.buyer.name, id].filter(Boolean).join(", ");
}

export async function buildEwidencja(
  items: InvoiceForEwidencja[],
  rates: RateProvider,
  ryczaltRate: number,
): Promise<RevenueEntry[]> {
  const draft = await Promise.all(
    items.map(async ({ ksefNumber, invoice: f }) => {
      const date = revenueDate(f);
      const remarks: string[] = [];
      if (f.invoiceType.startsWith("KOR")) remarks.push("Корректирующая фактура — проверьте дату и сумму");
      if (f.invoiceType.startsWith("ZAL")) remarks.push("Авансовая фактура — доход по дате получения аванса");
      if (f.servicePeriod) remarks.push(`Период услуги ${f.servicePeriod.from} — ${f.servicePeriod.to}`);

      let rate4: number | null = null;
      let rateDate: string | null = null;
      let rateTable: string | null = null;
      let amountPln = f.netTotal;
      if (f.currency !== "PLN") {
        const r = await rates.rateBefore(f.currency, date);
        rate4 = r.rate4;
        rateDate = r.effectiveDate;
        rateTable = r.tableNo;
        amountPln = convertToPln(f.netTotal, r.rate4);
      }
      return {
        revenueDate: date,
        documentNumber: f.invoiceNumber,
        ksefNumber,
        buyer: buyerLabel(f),
        currency: f.currency,
        amountOriginal: f.netTotal,
        rate4,
        rateDate,
        rateTable,
        amountPln,
        ryczaltRate,
        remarks,
      };
    }),
  );

  draft.sort(
    (a, b) => a.revenueDate.localeCompare(b.revenueDate) || a.documentNumber.localeCompare(b.documentNumber),
  );
  // Нумерация lp идёт заново в каждом году.
  const counters = new Map<string, number>();
  return draft.map((e) => {
    const year = e.revenueDate.slice(0, 4);
    const lp = (counters.get(year) ?? 0) + 1;
    counters.set(year, lp);
    return { lp, ...e };
  });
}

/** Сумма дохода за месяц (YYYY-MM) в грошах — вход для месячного расчёта ryczałt. */
export function monthRevenue(entries: RevenueEntry[], month: string): number {
  return entries.filter((e) => e.revenueDate.startsWith(month)).reduce((s, e) => s + e.amountPln, 0);
}

const money = (grosze: number) => (grosze / 100).toFixed(2).replace(".", ",");
const csvCell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV для Excel (разделитель «;», запятая в суммах, как принято в Польше). */
export function ewidencjaToCsv(entries: RevenueEntry[]): string {
  const header = [
    "Lp.",
    "Data uzyskania przychodu",
    "Nr dowodu",
    "Numer KSeF",
    "Kontrahent",
    "Waluta",
    "Kwota w walucie",
    "Kurs NBP",
    "Data kursu",
    "Tabela NBP",
    "Przychód (PLN)",
    "Stawka ryczałtu",
    "Uwagi",
  ];
  const rows = entries.map((e) => [
    String(e.lp),
    e.revenueDate,
    e.documentNumber,
    e.ksefNumber ?? "",
    e.buyer,
    e.currency,
    money(e.amountOriginal),
    e.rate4 === null ? "" : (e.rate4 / 10_000).toFixed(4).replace(".", ","),
    e.rateDate ?? "",
    e.rateTable ?? "",
    money(e.amountPln),
    `${(e.ryczaltRate * 100).toLocaleString("pl-PL")}%`,
    e.remarks.join("; "),
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
