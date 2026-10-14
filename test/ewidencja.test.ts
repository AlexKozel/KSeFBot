import { test } from "node:test";
import assert from "node:assert/strict";
import { NbpClient, convertToPln, toRate4, type RateProvider } from "../src/tax/nbp.ts";
import { buildEwidencja, ewidencjaToCsv, monthRevenue, revenueDate } from "../src/tax/ewidencja.ts";
import type { Fa3Invoice } from "../src/ksef/fa3.ts";

function inv(p: Partial<Fa3Invoice>): Fa3Invoice {
  return {
    formCode: "FA (3)",
    invoiceNumber: "FV/1",
    issueDate: "2026-10-31",
    serviceDate: null,
    servicePeriod: null,
    currency: "PLN",
    netTotal: 100000,
    vatTotal: 0,
    grossTotal: 100000,
    invoiceType: "VAT",
    seller: { nip: "5265877635", vatUe: null, otherId: null, name: "JDG", country: "PL" },
    buyer: { nip: null, vatUe: "DE123456789", otherId: null, name: "Kunde GmbH", country: "DE" },
    lines: [],
    ...p,
  };
}

test("курс и пересчёт без потери грошей", () => {
  assert.equal(toRate4(4.2512), 42512);
  assert.equal(toRate4("4.25"), 42500);
  assert.equal(convertToPln(450000, 42512), 1913040); // 4500.00 EUR × 4,2512 = 19130,40
  assert.equal(convertToPln(100010, 42512), 425163); // 1000.10 × 4,2512 = 4251.625 → 4251.63
  assert.equal(convertToPln(-100010, 42512), -425163);
});

test("дата дохода: период услуги → конец периода", () => {
  assert.equal(revenueDate(inv({ servicePeriod: { from: "2026-10-01", to: "2026-10-31" }, issueDate: "2026-11-03" })), "2026-10-31");
});

test("дата дохода: услуга раньше фактуры → дата услуги; иначе дата фактуры", () => {
  assert.equal(revenueDate(inv({ serviceDate: "2026-10-20", issueDate: "2026-10-31" })), "2026-10-20");
  assert.equal(revenueDate(inv({ serviceDate: "2026-11-05", issueDate: "2026-10-31" })), "2026-10-31");
  assert.equal(revenueDate(inv({})), "2026-10-31");
});

test("NBP: берётся последний курс строго ДО даты дохода, с учётом выходных", async () => {
  let asked = "";
  const nbp = new NbpClient((async (url: string) => {
    asked = url;
    return Response.json({
      rates: [
        { no: "208/A/NBP/2026", effectiveDate: "2026-10-29", mid: 4.2401 },
        { no: "209/A/NBP/2026", effectiveDate: "2026-10-30", mid: 4.2512 },
      ],
    });
  }) as typeof fetch);
  // Доход в субботу 31.10 → курс пятницы 30.10.
  const r = await nbp.rateBefore("EUR", "2026-10-31");
  assert.deepEqual(r, { currency: "EUR", rate4: 42512, effectiveDate: "2026-10-30", tableNo: "209/A/NBP/2026" });
  assert.match(asked, /\/rates\/a\/eur\/2026-10-21\/2026-10-30\//);
});

test("NBP: курс в сам день дохода не используется", async () => {
  const nbp = new NbpClient((async () =>
    Response.json({
      rates: [
        { no: "1", effectiveDate: "2026-11-02", mid: 4.1 },
        { no: "2", effectiveDate: "2026-11-03", mid: 4.2 },
      ],
    })) as typeof fetch);
  assert.equal((await nbp.rateBefore("EUR", "2026-11-03")).effectiveDate, "2026-11-02");
});

const fixedRates: RateProvider = {
  async rateBefore(currency, date) {
    return { currency, rate4: 42512, effectiveDate: date === "2026-10-31" ? "2026-10-30" : "2026-10-14", tableNo: "T" };
  },
};

test("ewidencja: сортировка, нумерация по годам, PLN и EUR", async () => {
  const entries = await buildEwidencja(
    [
      { ksefNumber: "K2", invoice: inv({ invoiceNumber: "FV/2", currency: "EUR", netTotal: 450000, servicePeriod: { from: "2026-10-01", to: "2026-10-31" } }) },
      { ksefNumber: "K1", invoice: inv({ invoiceNumber: "FV/1", issueDate: "2026-10-15", netTotal: 1000001, buyer: { nip: "1111111111", vatUe: null, otherId: null, name: "Klient", country: "PL" } }) },
      { ksefNumber: "K3", invoice: inv({ invoiceNumber: "FV/1/2027", issueDate: "2027-01-05" }) },
    ],
    fixedRates,
    0.12,
  );
  assert.deepEqual(entries.map((e) => [e.lp, e.documentNumber, e.revenueDate]), [
    [1, "FV/1", "2026-10-15"],
    [2, "FV/2", "2026-10-31"],
    [1, "FV/1/2027", "2027-01-05"],
  ]);
  assert.equal(entries[0]!.amountPln, 1000001);
  assert.equal(entries[0]!.rate4, null);
  assert.equal(entries[1]!.amountPln, 1913040);
  assert.equal(entries[1]!.rateDate, "2026-10-30");
  assert.equal(monthRevenue(entries, "2026-10"), 1000001 + 1913040);
  assert.equal(monthRevenue(entries, "2026-11"), 0);
});

test("ewidencja: корректирующая фактура помечается для проверки", async () => {
  const [e] = await buildEwidencja([{ ksefNumber: null, invoice: inv({ invoiceType: "KOR", netTotal: -5000 }) }], fixedRates, 0.12);
  assert.equal(e!.amountPln, -5000);
  assert.match(e!.remarks.join(), /Корректирующая/);
});

test("CSV: польский формат и экранирование", async () => {
  const entries = await buildEwidencja(
    [{ ksefNumber: "K1", invoice: inv({ invoiceNumber: 'FV;"1"', netTotal: 123456 }) }],
    fixedRates,
    0.12,
  );
  const csv = ewidencjaToCsv(entries);
  const [head, row] = csv.trim().split("\r\n");
  assert.match(head!, /^Lp\.;Data uzyskania przychodu;/);
  assert.match(row!, /^1;2026-10-31;"FV;""1""";K1;/);
  assert.match(row!, /;1234,56;12%;/);
});
