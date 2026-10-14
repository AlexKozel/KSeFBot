// Клиент KSeF против поддельного сервера: проверяем протокол, а не сеть.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constants, createDecipheriv, createHash, createPrivateKey, privateDecrypt } from "node:crypto";
import { KsefClient, KsefError } from "../src/ksef/client.ts";

// Самоподписанный сертификат вместо настоящего ключа KSeF.
const dir = mkdtempSync(join(tmpdir(), "ksef-test-"));
execFileSync("openssl", [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
  "-subj", "/CN=fake-ksef", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.der"), "-outform", "DER",
], { stdio: "ignore" });
const PRIVATE_KEY = createPrivateKey(readFileSync(join(dir, "key.pem")));
const CERT_B64 = readFileSync(join(dir, "cert.der")).toString("base64");
rmSync(dir, { recursive: true, force: true });

const NOW = new Date("2026-10-14T12:00:00Z");

interface Call {
  method: string;
  path: string;
  auth: string | null;
  body: any;
}

type Handler = (call: Call) => { status?: number; json?: unknown; text?: string; headers?: Record<string, string> };

function fakeKsef(routes: Record<string, Handler | Handler[]>) {
  const calls: Call[] = [];
  const counters: Record<string, number> = {};
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    assert.equal(u.origin + "/v2", "https://api-test.ksef.mf.gov.pl/v2");
    const path = u.pathname.replace(/^\/v2/, "");
    const method = init.method ?? "GET";
    const headers = init.headers as Record<string, string>;
    const call: Call = {
      method,
      path: path + u.search,
      auth: headers?.Authorization ?? null,
      body: init.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(call);
    const key = `${method} ${path}`;
    const route = routes[key];
    if (!route) throw new Error(`Неожиданный запрос ${key}`);
    const i = (counters[key] = (counters[key] ?? 0) + 1) - 1;
    const h = Array.isArray(route) ? route[Math.min(i, route.length - 1)]! : route;
    const r = h(call);
    const body = r.text ?? JSON.stringify(r.json ?? {});
    return new Response(body, { status: r.status ?? 200, headers: r.headers ?? {} });
  }) as typeof fetch;
  return { fetchFn, calls };
}

const inHour = new Date(NOW.getTime() + 3600_000).toISOString();

function authRoutes(statusSequence: Handler[]): Record<string, Handler | Handler[]> {
  return {
    "GET /security/public-key-certificates": () => ({
      json: [
        { certificate: CERT_B64, usage: ["SymmetricKeyEncryption"], validFrom: "2025-01-01T00:00:00Z", validTo: "2030-01-01T00:00:00Z" },
        { certificate: CERT_B64, usage: ["KsefTokenEncryption"], validFrom: "2025-01-01T00:00:00Z", validTo: "2030-01-01T00:00:00Z" },
      ],
    }),
    "POST /auth/challenge": () => ({ json: { challenge: "c".repeat(36), timestampMs: 1760443200123, timestamp: "x", clientIp: "1.1.1.1" } }),
    "POST /auth/ksef-token": (c) => {
      const plain = privateDecrypt(
        { key: PRIVATE_KEY, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
        Buffer.from(c.body.encryptedToken, "base64"),
      ).toString("utf8");
      assert.equal(plain, "SECRET-TOKEN|1760443200123");
      assert.deepEqual(c.body.contextIdentifier, { type: "Nip", value: "5265877635" });
      assert.equal(c.body.challenge, "c".repeat(36));
      return { status: 202, json: { referenceNumber: "r".repeat(36), authenticationToken: { token: "AUTH", validUntil: inHour } } };
    },
    [`GET /auth/${"r".repeat(36)}`]: statusSequence,
    "POST /auth/token/redeem": (c) => {
      assert.equal(c.auth, "Bearer AUTH");
      return { json: { accessToken: { token: "ACCESS", validUntil: inHour }, refreshToken: { token: "REFRESH", validUntil: inHour } } };
    },
  };
}

const ok: Handler = () => ({ json: { status: { code: 200, description: "OK" } } });
const pending: Handler = () => ({ json: { status: { code: 100, description: "Uwierzytelnianie w toku" } } });

function invoice(n: number, issueDate: string) {
  return {
    ksefNumber: `5265877635-20261014-0000000000${String(n).padStart(2, "0")}-AB`,
    invoiceNumber: `FV/${n}/2026`,
    issueDate,
    seller: { nip: "5265877635" },
    buyer: { identifier: { type: "VatUe", value: "DE123456789" }, name: "Kunde GmbH" },
    currency: "EUR",
    netAmount: 1000.1,
    grossAmount: 1000.1,
    vatAmount: 0,
    invoiceType: "Vat",
  };
}

test("вход по токену: шифрование, ожидание статуса, получение accessToken", async () => {
  const { fetchFn, calls } = fakeKsef({
    ...authRoutes([pending, pending, ok]),
    "POST /invoices/query/metadata": () => ({ json: { hasMore: false, isTruncated: false, invoices: [] } }),
  });
  const sleeps: number[] = [];
  const client = new KsefClient({ env: "test", fetch: fetchFn, sleep: async (ms) => void sleeps.push(ms), now: () => NOW });

  await client.authenticateWithToken("5265877635", "SECRET-TOKEN");
  assert.deepEqual(sleeps, [1000, 1000]); // два раза «в процессе», затем успех

  await client.listSalesInvoices(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-31T23:59:59Z"));
  const q = calls.at(-1)!;
  assert.equal(q.auth, "Bearer ACCESS");
  assert.equal(q.body.subjectType, "Subject1");
  assert.equal(q.body.dateRange.dateType, "Issue");
});

test("неудачный вход возвращает понятную ошибку с деталями", async () => {
  const { fetchFn } = fakeKsef(
    authRoutes([() => ({ json: { status: { code: 450, description: "Uwierzytelnianie zakończone niepowodzeniem", details: ["Nieprawidłowy token."] } } })]),
  );
  const client = new KsefClient({ env: "test", fetch: fetchFn, sleep: async () => {}, now: () => NOW });
  await assert.rejects(client.authenticateWithToken("5265877635", "SECRET-TOKEN"), (e: unknown) => {
    assert.ok(e instanceof KsefError);
    assert.equal(e.status, 450);
    assert.deepEqual(e.details, ["Nieprawidłowy token."]);
    return true;
  });
});

test("постраничная загрузка, лимит 10 000 (isTruncated) и суммы в центах", async () => {
  const pages = [
    { hasMore: true, isTruncated: false, invoices: [invoice(1, "2026-10-01"), invoice(2, "2026-10-02")] },
    { hasMore: true, isTruncated: true, invoices: [invoice(3, "2026-10-05")] },
    { hasMore: false, isTruncated: false, invoices: [invoice(3, "2026-10-05"), invoice(4, "2026-10-09")] },
  ];
  const { fetchFn, calls } = fakeKsef({
    ...authRoutes([ok]),
    "POST /invoices/query/metadata": pages.map((p) => () => ({ json: p })),
  });
  const client = new KsefClient({ env: "test", fetch: fetchFn, sleep: async () => {}, now: () => NOW });
  await client.authenticateWithToken("5265877635", "SECRET-TOKEN");
  const list = await client.listSalesInvoices(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-31T23:59:59Z"));

  assert.deepEqual(list.map((i) => i.invoiceNumber), ["FV/1/2026", "FV/2/2026", "FV/3/2026", "FV/4/2026"]);
  assert.equal(list[0]!.grossAmount, 100010); // 1000.10 EUR
  assert.equal(list[0]!.buyerIdentifier, "DE123456789");

  const queries = calls.filter((c) => c.path.startsWith("/invoices/query/metadata"));
  assert.match(queries[1]!.path, /pageOffset=1/);
  // После isTruncated: offset сброшен, from = дата последней записи.
  assert.match(queries[2]!.path, /pageOffset=0/);
  assert.equal(queries[2]!.body.dateRange.from, "2026-10-05T00:00:00.000Z");
});

test("429: ждёт Retry-After и повторяет", async () => {
  const { fetchFn } = fakeKsef({
    ...authRoutes([ok]),
    "GET /invoices/ksef/X": [
      () => ({ status: 429, json: { status: { code: 429 } }, headers: { "Retry-After": "7" } }),
      () => ({ text: "<Faktura/>" }),
    ],
  });
  const sleeps: number[] = [];
  const client = new KsefClient({ env: "test", fetch: fetchFn, sleep: async (ms) => void sleeps.push(ms), now: () => NOW });
  await client.authenticateWithToken("5265877635", "SECRET-TOKEN");
  assert.equal(await client.downloadInvoiceXml("X"), "<Faktura/>");
  assert.deepEqual(sleeps, [7000]);
});

test("accessToken обновляется через refreshToken перед истечением", async () => {
  let now = NOW;
  const { fetchFn, calls } = fakeKsef({
    ...authRoutes([ok]),
    "POST /auth/token/refresh": (c) => {
      assert.equal(c.auth, "Bearer REFRESH");
      return { json: { accessToken: { token: "ACCESS2", validUntil: new Date(now.getTime() + 3600_000).toISOString() } } };
    },
    "GET /invoices/ksef/X": () => ({ text: "<Faktura/>" }),
  });
  const client = new KsefClient({ env: "test", fetch: fetchFn, sleep: async () => {}, now: () => now });
  await client.authenticateWithToken("5265877635", "SECRET-TOKEN");
  now = new Date(NOW.getTime() + 3600_000 - 30_000); // до истечения 30 секунд
  await client.downloadInvoiceXml("X");
  assert.equal(calls.at(-1)!.auth, "Bearer ACCESS2");
});

test("без входа чтение запрещено", async () => {
  const client = new KsefClient({ env: "test", fetch: (async () => new Response("{}")) as typeof fetch });
  await assert.rejects(client.downloadInvoiceXml("X"), /Сначала нужно войти/);
});

function sendRoutes(statuses: Handler[], received: string[]): Record<string, Handler | Handler[]> {
  let key: Buffer;
  let iv: Buffer;
  const S = "s".repeat(36);
  return {
    ...authRoutes([ok]),
    "POST /sessions/online": (c) => {
      assert.deepEqual(c.body.formCode, { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" });
      key = privateDecrypt(
        { key: PRIVATE_KEY, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
        Buffer.from(c.body.encryption.encryptedSymmetricKey, "base64"),
      );
      iv = Buffer.from(c.body.encryption.initializationVector, "base64");
      assert.equal(key.length, 32);
      assert.equal(iv.length, 16);
      return { status: 201, json: { referenceNumber: S, validUntil: inHour } };
    },
    [`POST /sessions/online/${S}/invoices`]: (c) => {
      const enc = Buffer.from(c.body.encryptedInvoiceContent, "base64");
      const d = createDecipheriv("aes-256-cbc", key, iv);
      const plain = Buffer.concat([d.update(enc), d.final()]);
      assert.equal(c.body.invoiceHash, createHash("sha256").update(plain).digest("base64"));
      assert.equal(c.body.invoiceSize, plain.length);
      assert.equal(c.body.encryptedInvoiceHash, createHash("sha256").update(enc).digest("base64"));
      received.push(plain.toString("utf8"));
      return { status: 202, json: { referenceNumber: "i".repeat(36) } };
    },
    [`GET /sessions/${S}/invoices/${"i".repeat(36)}`]: statuses,
    [`POST /sessions/online/${S}/close`]: () => ({ status: 204, text: "" }),
  };
}

test("отправка фактуры: шифрование AES, ожидание номера KSeF, закрытие сессии", async () => {
  const received: string[] = [];
  const { fetchFn, calls } = fakeKsef(
    sendRoutes(
      [
        () => ({ json: { status: { code: 100, description: "Przyjęta" } } }),
        () => ({ json: { status: { code: 150, description: "Trwa przetwarzanie" } } }),
        () => ({ json: { ksefNumber: "5265877635-20261014-ABCDEF123456-01", status: { code: 200, description: "Sukces" } } }),
      ],
      received,
    ),
  );
  const client = new KsefClient({ env: "test", fetch: fetchFn, sleep: async () => {}, now: () => NOW });
  await client.authenticateWithToken("5265877635", "SECRET-TOKEN");
  const res = await client.sendInvoices(["<Faktura>zażółć</Faktura>"]);
  assert.deepEqual(res.map((r) => r.ksefNumber), ["5265877635-20261014-ABCDEF123456-01"]);
  assert.deepEqual(received, ["<Faktura>zażółć</Faktura>"]);
  assert.ok(calls.some((c) => c.path.endsWith("/close")));
});

test("отклонённая фактура: ошибка с деталями, сессия всё равно закрывается", async () => {
  const { fetchFn, calls } = fakeKsef(
    sendRoutes(
      [() => ({ json: { status: { code: 450, description: "Błąd weryfikacji semantyki", details: ["P_15 niezgodne"] } } })],
      [],
    ),
  );
  const client = new KsefClient({ env: "test", fetch: fetchFn, sleep: async () => {}, now: () => NOW });
  await client.authenticateWithToken("5265877635", "SECRET-TOKEN");
  await assert.rejects(client.sendInvoices(["<Faktura/>"]), /отклонена/);
  assert.ok(calls.some((c) => c.path.endsWith("/close")));
});
