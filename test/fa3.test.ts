import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAmount, parseFa3 } from "../src/ksef/fa3.ts";
import { buildTestInvoice } from "../src/ksef/testInvoice.ts";

test("суммы без потери грошей", () => {
  assert.equal(parseAmount("53.63"), 5363);
  assert.equal(parseAmount("1000.1"), 100010);
  assert.equal(parseAmount("12000"), 1200000);
  assert.equal(parseAmount("-10.03"), -1003);
  assert.equal(parseAmount("0.07"), 7);
  assert.throws(() => parseAmount("1.234"));
  assert.throws(() => parseAmount("abc"));
});

test("официальный образец МФ FA(3)", () => {
  const xml = readFileSync(new URL("./fixtures/fa3-mf-template.xml", import.meta.url), "utf8");
  const f = parseFa3(xml);
  assert.equal(f.formCode, "FA (3)");
  assert.equal(f.issueDate, "2025-09-01");
  assert.equal(f.currency, "PLN");
  assert.equal(f.netTotal, 4360);
  assert.equal(f.vatTotal, 1003);
  assert.equal(f.grossTotal, 5363);
  assert.deepEqual(f.servicePeriod, { from: "2026-01-01", to: "2026-02-28" });
  assert.equal(f.serviceDate, "2026-02-28");
  assert.equal(f.seller.nip, "5265877635");
  assert.equal(f.buyer.nip, "1111111111");
  assert.equal(f.lines.length, 2);
  assert.equal(f.lines[1]!.net, 2560);
});

test("фактура клиенту из ЕС: np II, EUR, VAT UE покупателя", () => {
  const xml = buildTestInvoice({
    sellerNip: "5265877635",
    number: "FV/1/10/2026",
    issueDate: "2026-10-31",
    serviceFrom: "2026-10-01",
    serviceTo: "2026-10-31",
    kind: "eu",
    net: "4500.00",
  });
  const f = parseFa3(xml);
  assert.equal(f.currency, "EUR");
  assert.equal(f.netTotal, 450000);
  assert.equal(f.vatTotal, 0);
  assert.equal(f.grossTotal, 450000);
  assert.equal(f.buyer.vatUe, "DE123456789");
  assert.equal(f.buyer.country, "DE");
  assert.equal(f.lines[0]!.vatRate, "np II");
});

test("польский клиент: 23% VAT", () => {
  const f = parseFa3(
    buildTestInvoice({
      sellerNip: "5265877635",
      number: "FV/2/10/2026",
      issueDate: "2026-10-31",
      serviceFrom: "2026-10-01",
      serviceTo: "2026-10-31",
      kind: "domestic",
      net: "10000.01",
    }),
  );
  assert.equal(f.netTotal, 1000001);
  assert.equal(f.vatTotal, 230000); // 2300.0023 → 2300.00
  assert.equal(f.grossTotal, 1230001);
});

test("спецсимволы в номере экранируются", () => {
  const f = parseFa3(
    buildTestInvoice({
      sellerNip: "5265877635",
      number: "FV/<1>&2",
      issueDate: "2026-10-31",
      serviceFrom: "2026-10-01",
      serviceTo: "2026-10-31",
      kind: "eu",
      net: "1.00",
    }),
  );
  assert.equal(f.invoiceNumber, "FV/<1>&2");
});

test("не фактура — понятная ошибка", () => {
  assert.throws(() => parseFa3("<Something/>"), /не фактура/);
});
