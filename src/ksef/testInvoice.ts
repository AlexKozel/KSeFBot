// Генератор тестовых фактур FA(3) для тестовой среды KSeF и тестов.
// Два типичных случая для IT на JDG:
//   domestic — польский клиент, 23% VAT, PLN;
//   eu       — клиент из ЕС (B2B), услуги по ст. 28b, «np II», odwrotne obciążenie, EUR.
// Это не генератор настоящих фактур для пользователей — он появится с модулем выставления.

export interface TestInvoiceInput {
  sellerNip: string;
  number: string;
  issueDate: string; // YYYY-MM-DD
  /** Последний день периода оказания услуги. */
  serviceTo: string;
  serviceFrom: string;
  kind: "domestic" | "eu";
  /** Сумма нетто строкой с 2 знаками, например "12000.00". */
  net: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function vat23(net: string): string {
  const [i, f = "0"] = net.split(".");
  const cents = Number(i) * 100 + Number(f.padEnd(2, "0").slice(0, 2));
  const v = Math.round((cents * 23) / 100);
  return `${Math.floor(v / 100)}.${String(v % 100).padStart(2, "0")}`;
}

function add(a: string, b: string): string {
  const c = (x: string) => {
    const [i, f = "0"] = x.split(".");
    return Number(i) * 100 + Number(f.padEnd(2, "0").slice(0, 2));
  };
  const s = c(a) + c(b);
  return `${Math.floor(s / 100)}.${String(s % 100).padStart(2, "0")}`;
}

export function buildTestInvoice(p: TestInvoiceInput): string {
  const eu = p.kind === "eu";
  const buyer = eu
    ? `<DaneIdentyfikacyjne><KodUE>DE</KodUE><NrVatUE>123456789</NrVatUE><Nazwa>Test Kunde GmbH</Nazwa></DaneIdentyfikacyjne>
      <Adres><KodKraju>DE</KodKraju><AdresL1>Teststraße 1</AdresL1><AdresL2>10115 Berlin</AdresL2></Adres>`
    : `<DaneIdentyfikacyjne><NIP>1111111111</NIP><Nazwa>Testowy Klient sp. z o.o.</Nazwa></DaneIdentyfikacyjne>
      <Adres><KodKraju>PL</KodKraju><AdresL1>ul. Testowa 1</AdresL1><AdresL2>00-001 Warszawa</AdresL2></Adres>`;

  const vat = eu ? "0.00" : vat23(p.net);
  const gross = eu ? p.net : add(p.net, vat);
  const sums = eu
    ? `<P_13_9>${p.net}</P_13_9>`
    : `<P_13_1>${p.net}</P_13_1><P_14_1>${vat}</P_14_1>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>${p.issueDate}T08:00:00Z</DataWytworzeniaFa>
    <SystemInfo>KSeFBot test</SystemInfo>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne><NIP>${esc(p.sellerNip)}</NIP><Nazwa>Testowy Programista JDG</Nazwa></DaneIdentyfikacyjne>
    <Adres><KodKraju>PL</KodKraju><AdresL1>ul. Przykładowa 2</AdresL1><AdresL2>00-002 Warszawa</AdresL2></Adres>
  </Podmiot1>
  <Podmiot2>
    ${buyer}
    <JST>2</JST>
    <GV>2</GV>
  </Podmiot2>
  <Fa>
    <KodWaluty>${eu ? "EUR" : "PLN"}</KodWaluty>
    <P_1>${p.issueDate}</P_1>
    <P_2>${esc(p.number)}</P_2>
    <OkresFa><P_6_Od>${p.serviceFrom}</P_6_Od><P_6_Do>${p.serviceTo}</P_6_Do></OkresFa>
    ${sums}
    <P_15>${gross}</P_15>
    <Adnotacje>
      <P_16>2</P_16>
      <P_17>2</P_17>
      <P_18>${eu ? 1 : 2}</P_18>
      <P_18A>2</P_18A>
      <Zwolnienie><P_19N>1</P_19N></Zwolnienie>
      <NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu>
      <P_23>2</P_23>
      <PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy>
    </Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Usługi programistyczne</P_7>
      <P_8A>usł.</P_8A>
      <P_8B>1</P_8B>
      <P_9A>${p.net}</P_9A>
      <P_11>${p.net}</P_11>
      <P_12>${eu ? "np II" : "23"}</P_12>
    </FaWiersz>
  </Fa>
</Faktura>
`;
}
