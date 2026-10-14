// Разбор фактуры FA(3) (XML из KSeF) в то, что нужно для ewidencja przychodów.
// Берём только нужные поля; остальное остаётся в исходном XML, который мы храним.

import { XMLParser } from "fast-xml-parser";

export interface Fa3Party {
  nip: string | null;
  /** Номер VAT UE вместе с кодом страны, например DE123456789. */
  vatUe: string | null;
  otherId: string | null;
  name: string | null;
  country: string | null;
}

export interface Fa3Invoice {
  formCode: string; // "FA (3)"
  invoiceNumber: string; // P_2
  issueDate: string; // P_1, YYYY-MM-DD
  /** Дата оказания услуги (P_6) или конец периода (OkresFa/P_6_Do), если указаны. */
  serviceDate: string | null;
  servicePeriod: { from: string; to: string } | null;
  currency: string;
  /** Суммы в минимальных единицах валюты фактуры. */
  netTotal: number; // сумма всех P_13_*
  vatTotal: number; // сумма P_14_* в валюте фактуры
  grossTotal: number; // P_15
  invoiceType: string; // VAT, KOR, ZAL, ...
  seller: Fa3Party;
  buyer: Fa3Party;
  lines: { description: string; net: number | null; vatRate: string | null }[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  parseTagValue: false, // NIP, суммы и даты оставляем строками
  trimValues: true,
  isArray: (name) => name === "FaWiersz",
});

/** "1234.5" → 123450; "-10.03" → -1003. Без чисел с плавающей точкой. */
export function parseAmount(value: string): number {
  const m = /^(-)?(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!m) throw new Error(`Некорректная сумма: ${value}`);
  const minor = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -minor : minor;
}

function str(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "object" && "#text" in (v as object)) return String((v as { "#text": unknown })["#text"]);
  return String(v);
}

function party(p: any): Fa3Party {
  const id = p?.DaneIdentyfikacyjne ?? {};
  const kodUe = str(id.KodUE);
  const nrUe = str(id.NrVatUE);
  return {
    nip: str(id.NIP),
    vatUe: kodUe && nrUe ? `${kodUe}${nrUe}` : null,
    otherId: str(id.NrID),
    name: str(id.Nazwa),
    country: str(p?.Adres?.KodKraju),
  };
}

export function parseFa3(xml: string): Fa3Invoice {
  const doc = parser.parse(xml);
  const f = doc?.Faktura;
  if (!f?.Fa) throw new Error("Это не фактура FA: нет элемента Faktura/Fa");

  const formCode = String(f.Naglowek?.KodFormularza?.["@kodSystemowy"] ?? "");
  const fa = f.Fa;

  let netTotal = 0;
  let vatTotal = 0;
  for (const [key, value] of Object.entries(fa)) {
    // P_13_1 … P_13_11 — суммы нетто по ставкам; P_14_1 … P_14_5 — VAT (без *W — это PLN).
    if (/^P_13_\d+$/.test(key)) netTotal += parseAmount(String(value));
    else if (/^P_14_\d+$/.test(key)) vatTotal += parseAmount(String(value));
  }

  const period = fa.OkresFa
    ? { from: String(fa.OkresFa.P_6_Od), to: String(fa.OkresFa.P_6_Do) }
    : null;

  return {
    formCode,
    invoiceNumber: String(fa.P_2),
    issueDate: String(fa.P_1),
    serviceDate: str(fa.P_6) ?? period?.to ?? null,
    servicePeriod: period,
    currency: String(fa.KodWaluty),
    netTotal,
    vatTotal,
    grossTotal: parseAmount(String(fa.P_15)),
    invoiceType: String(fa.RodzajFaktury ?? ""),
    seller: party(f.Podmiot1),
    buyer: party(f.Podmiot2),
    lines: (fa.FaWiersz ?? []).map((w: any) => ({
      description: String(w.P_7 ?? ""),
      net: w.P_11 !== undefined ? parseAmount(String(w.P_11)) : null,
      vatRate: str(w.P_12),
    })),
  };
}
