// Проверка на настоящей тестовой среде KSeF (запускается из GitHub Actions):
//   1. токеном с InvoiceWrite отправляем 2 тестовые фактуры (клиент из ЕС в EUR и польский клиент);
//   2. токеном только на чтение (как у бета-пользователя) входим, находим их и скачиваем XML;
//   3. разбираем FA(3) и сверяем суммы с отправленными.
import { KsefClient, KsefError } from "../src/ksef/client.ts";
import { parseFa3 } from "../src/ksef/fa3.ts";
import { buildTestInvoice } from "../src/ksef/testInvoice.ts";

const nip = process.env.KSEF_NIP;
const readToken = process.env.KSEF_TOKEN;
const seedToken = process.env.KSEF_SEED_TOKEN;
if (!nip || !readToken || !seedToken) throw new Error("Нужны KSEF_NIP, KSEF_TOKEN и KSEF_SEED_TOKEN");

const note = (title: string, msg: string) => console.log(`::notice title=${title}::${msg}`);
const fail = (title: string, msg: string) => {
  console.log(`::error title=${title}::${msg}`);
  process.exit(1);
};

const today = new Date().toISOString().slice(0, 10);
const monthStart = today.slice(0, 8) + "01";
const run = Date.now().toString(36);
const sent = [
  { kind: "eu" as const, number: `FV/${run}/EU`, net: "4500.00", expectNet: 450000, currency: "EUR" },
  { kind: "domestic" as const, number: `FV/${run}/PL`, net: "10000.01", expectNet: 1000001, currency: "PLN" },
];

try {
  // 1. Тестовые данные
  const seeder = new KsefClient({ env: "test" });
  await seeder.authenticateWithToken(nip, seedToken);
  const t0 = Date.now();
  const numbers = await seeder.sendInvoices(
    sent.map((s) =>
      buildTestInvoice({ sellerNip: nip, number: s.number, issueDate: today, serviceFrom: monthStart, serviceTo: today, kind: s.kind, net: s.net }),
    ),
  );
  note("send", `Отправлено ${numbers.length} фактур за ${((Date.now() - t0) / 1000).toFixed(1)} с: ${numbers.map((n) => n.ksefNumber).join(", ")}`);

  // 2. Чтение токеном только на чтение
  const reader = new KsefClient({ env: "test" });
  await reader.authenticateWithToken(nip, readToken);
  note("auth", `Вход токеном InvoiceRead успешен (NIP ${nip})`);

  const from = new Date(Date.now() - 2 * 86_400_000);
  let found: Awaited<ReturnType<KsefClient["listSalesInvoices"]>> = [];
  for (let i = 0; i < 20; i++) {
    // Метаданные появляются с небольшой задержкой.
    const all = await reader.listSalesInvoices(from, new Date(Date.now() + 86_400_000));
    found = all.filter((h) => numbers.some((n) => n.ksefNumber === h.ksefNumber));
    if (found.length === numbers.length) break;
    await new Promise((r) => setTimeout(r, 15_000));
  }
  if (found.length !== numbers.length) fail("list", `Найдено ${found.length} из ${numbers.length} отправленных фактур`);
  note("list", `Обе фактуры найдены в списке продаж`);

  // 3. Скачивание и разбор
  for (const s of sent) {
    const h = found.find((x) => x.invoiceNumber === s.number);
    if (!h) fail("match", `Нет фактуры ${s.number} в списке`);
    const f = parseFa3(await reader.downloadInvoiceXml(h!.ksefNumber));
    if (f.netTotal !== s.expectNet || f.currency !== s.currency || f.invoiceNumber !== s.number) {
      fail("parse", `${s.number}: ожидали ${s.expectNet} ${s.currency}, получили ${f.netTotal} ${f.currency}`);
    }
    if (h!.netAmount !== s.expectNet) fail("metadata", `${s.number}: в метаданных ${h!.netAmount}, ожидали ${s.expectNet}`);
    note("parse", `${s.number}: ${f.currency} нетто ${(f.netTotal / 100).toFixed(2)}, услуга до ${f.serviceDate}, покупатель ${f.buyer.vatUe ?? f.buyer.nip}`);
  }
} catch (e) {
  const err = e as KsefError;
  fail("ksef", `${err.message} ${(err.details ?? []).join(" | ").replace(/\s+/g, " ").slice(0, 400)}`);
}
