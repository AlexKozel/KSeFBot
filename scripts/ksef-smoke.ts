// Проверка клиента на настоящей тестовой среде KSeF: вход по токену и чтение фактур.
// Запускается из GitHub Actions (workflow «KSeF smoke test»).
import { KsefClient, KsefError } from "../src/ksef/client.ts";

const nip = process.env.KSEF_NIP;
const token = process.env.KSEF_TOKEN;
if (!nip || !token) throw new Error("Нужны KSEF_NIP и KSEF_TOKEN");

const note = (title: string, msg: string) => console.log(`::notice title=${title}::${msg}`);

try {
  const client = new KsefClient({ env: "test" });
  const t0 = Date.now();
  await client.authenticateWithToken(nip, token);
  note("auth", `Вход по токену KSeF успешен за ${((Date.now() - t0) / 1000).toFixed(1)} с (NIP ${nip})`);

  const to = new Date();
  const from = new Date(to.getTime() - 90 * 86_400_000);
  const invoices = await client.listSalesInvoices(from, to);
  note("invoices", `Фактур продаж за 90 дней: ${invoices.length}`);

  const first = invoices[0];
  if (first) {
    const xml = await client.downloadInvoiceXml(first.ksefNumber);
    note("download", `XML ${first.ksefNumber}: ${xml.length} байт, начало: ${xml.slice(0, 60).replace(/\s+/g, " ")}`);
  }
} catch (e) {
  const err = e as KsefError;
  console.log(`::error title=ksef::${err.message} ${(err.details ?? []).join(" | ").replace(/\s+/g, " ").slice(0, 400)}`);
  process.exit(1);
}
