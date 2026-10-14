// Клиент KSeF API 2.0: вход по токену KSeF и чтение фактур продаж.
//
// Поток входа (документация МФ, uwierzytelnianie.md, раздел 2.2):
//   1. GET  /security/public-key-certificates  → ключ для шифрования токена
//   2. POST /auth/challenge                     → challenge + timestampMs
//   3. POST /auth/ksef-token                    → RSA-OAEP(SHA-256) от "token|timestampMs"
//   4. GET  /auth/{referenceNumber}             → ждём status.code = 200
//   5. POST /auth/token/redeem                  → accessToken + refreshToken
// Чтение: POST /invoices/query/metadata (Subject1 = мы продавец), GET /invoices/ksef/{n}.

import { X509Certificate, constants, publicEncrypt, type KeyObject } from "node:crypto";

export type KsefEnv = "test" | "demo" | "prod";

export const KSEF_BASE_URL: Record<KsefEnv, string> = {
  test: "https://api-test.ksef.mf.gov.pl/v2",
  demo: "https://api-demo.ksef.mf.gov.pl/v2",
  prod: "https://api.ksef.mf.gov.pl/v2",
};

export interface KsefInvoiceHeader {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string; // YYYY-MM-DD
  sellerNip: string;
  buyerIdentifierType: string;
  buyerIdentifier: string | null;
  buyerName: string | null;
  currency: string;
  /** Суммы в минимальных единицах валюты фактуры (гроши, евроценты). */
  netAmount: number;
  grossAmount: number;
  vatAmount: number;
  invoiceType: string;
}

export class KsefError extends Error {
  readonly status: number | undefined;
  readonly details: string[];
  constructor(message: string, status?: number, details: string[] = []) {
    super(message);
    this.name = "KsefError";
    this.status = status;
    this.details = details;
  }
}

export interface KsefClientOptions {
  env: KsefEnv;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Сколько раз опрашивать статус входа (с паузой 1 с). */
  authPollAttempts?: number;
  now?: () => Date;
}

interface TokenInfo {
  token: string;
  validUntil: string;
}

const toMinor = (x: number) => Math.round(x * 100);

/** Шифрует "token|timestampMs" открытым ключом KSeF (RSA-OAEP, SHA-256), результат — Base64. */
export function encryptKsefToken(token: string, timestampMs: number, key: KeyObject): string {
  const data = Buffer.from(`${token}|${timestampMs}`, "utf8");
  return publicEncrypt(
    { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    data,
  ).toString("base64");
}

export class KsefClient {
  private readonly base: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pollAttempts: number;
  private readonly now: () => Date;
  private access: TokenInfo | null = null;
  private refresh: TokenInfo | null = null;

  constructor(opts: KsefClientOptions) {
    this.base = KSEF_BASE_URL[opts.env];
    this.fetchFn = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.pollAttempts = opts.authPollAttempts ?? 30;
    this.now = opts.now ?? (() => new Date());
  }

  // ---------- HTTP ----------

  private async request(
    method: string,
    path: string,
    opts: { bearer?: string; json?: unknown; accept?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: opts.accept ?? "application/json" };
    if (opts.bearer) headers.Authorization = `Bearer ${opts.bearer}`;
    if (opts.json !== undefined) headers["Content-Type"] = "application/json";

    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchFn(this.base + path, {
        method,
        headers,
        body: opts.json === undefined ? undefined : JSON.stringify(opts.json),
      });
      // Лимиты API: 429 и Retry-After в секундах. Повторяем не больше двух раз.
      if (res.status === 429 && attempt < 2) {
        const wait = Math.min(Number(res.headers.get("retry-after")) || 5, 60);
        await this.sleep(wait * 1000);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new KsefError(`KSeF ${method} ${path}: HTTP ${res.status}`, res.status, [text.slice(0, 500)]);
      }
      return res;
    }
  }

  private async json<T>(method: string, path: string, opts: Parameters<KsefClient["request"]>[2] = {}): Promise<T> {
    return (await (await this.request(method, path, opts)).json()) as T;
  }

  // ---------- Вход ----------

  async getTokenEncryptionKey(): Promise<KeyObject> {
    const certs = await this.json<
      { certificate: string; usage: string[]; validFrom: string; validTo: string }[]
    >("GET", "/security/public-key-certificates");
    const now = this.now().getTime();
    const cert = certs.find(
      (c) =>
        c.usage.includes("KsefTokenEncryption") &&
        Date.parse(c.validFrom) <= now &&
        now <= Date.parse(c.validTo),
    );
    if (!cert) throw new KsefError("Нет действующего ключа KSeF для шифрования токена");
    return new X509Certificate(Buffer.from(cert.certificate, "base64")).publicKey;
  }

  /** Вход по токену KSeF пользователя в контексте его NIP. */
  async authenticateWithToken(nip: string, ksefToken: string): Promise<void> {
    const key = await this.getTokenEncryptionKey();
    const challenge = await this.json<{ challenge: string; timestampMs: number }>("POST", "/auth/challenge");

    const init = await this.json<{ referenceNumber: string; authenticationToken: TokenInfo }>(
      "POST",
      "/auth/ksef-token",
      {
        json: {
          challenge: challenge.challenge,
          contextIdentifier: { type: "Nip", value: nip },
          encryptedToken: encryptKsefToken(ksefToken, challenge.timestampMs, key),
        },
      },
    );
    const authToken = init.authenticationToken.token;

    for (let i = 0; ; i++) {
      const st = await this.json<{ status: { code: number; description: string; details?: string[] } }>(
        "GET",
        `/auth/${encodeURIComponent(init.referenceNumber)}`,
        { bearer: authToken },
      );
      if (st.status.code === 200) break;
      if (st.status.code !== 100) {
        throw new KsefError(`Вход в KSeF не удался: ${st.status.description}`, st.status.code, st.status.details ?? []);
      }
      if (i + 1 >= this.pollAttempts) throw new KsefError("Вход в KSeF: истекло время ожидания");
      await this.sleep(1000);
    }

    const tokens = await this.json<{ accessToken: TokenInfo; refreshToken: TokenInfo }>(
      "POST",
      "/auth/token/redeem",
      { bearer: authToken },
    );
    this.access = tokens.accessToken;
    this.refresh = tokens.refreshToken;
  }

  /** Действующий accessToken; при необходимости обновляет его через refreshToken. */
  private async accessToken(): Promise<string> {
    if (!this.access || !this.refresh) throw new KsefError("Сначала нужно войти в KSeF");
    // Обновляем заранее, за минуту до истечения.
    if (Date.parse(this.access.validUntil) - this.now().getTime() > 60_000) return this.access.token;
    const r = await this.json<{ accessToken: TokenInfo }>("POST", "/auth/token/refresh", {
      bearer: this.refresh.token,
    });
    this.access = r.accessToken;
    return this.access.token;
  }

  // ---------- Фактуры ----------

  /**
   * Фактуры продаж (пользователь — продавец, Subject1) с датой выставления в [from, to].
   * Учитывает постраничность (hasMore) и технический лимит 10 000 записей (isTruncated).
   */
  async listSalesInvoices(from: Date, to: Date): Promise<KsefInvoiceHeader[]> {
    const pageSize = 100;
    const result = new Map<string, KsefInvoiceHeader>();
    let rangeFrom = from;
    let pageOffset = 0;

    for (let guard = 0; guard < 1000; guard++) {
      const page = await this.json<MetadataResponse>(
        "POST",
        `/invoices/query/metadata?sortOrder=Asc&pageOffset=${pageOffset}&pageSize=${pageSize}`,
        {
          bearer: await this.accessToken(),
          json: {
            subjectType: "Subject1",
            dateRange: { dateType: "Issue", from: rangeFrom.toISOString(), to: to.toISOString() },
          },
        },
      );
      for (const m of page.invoices) result.set(m.ksefNumber, toHeader(m));
      if (!page.hasMore) return [...result.values()];

      const last = page.invoices.at(-1);
      if (page.isTruncated && last) {
        // Сужаем диапазон с даты последней записи; дубли убирает Map по номеру KSeF.
        rangeFrom = new Date(`${last.issueDate}T00:00:00Z`);
        pageOffset = 0;
      } else {
        pageOffset += 1;
      }
    }
    throw new KsefError("Слишком много страниц фактур — остановлено защитой от зацикливания");
  }

  /** Полный XML фактуры (FA(3)) по номеру KSeF. */
  async downloadInvoiceXml(ksefNumber: string): Promise<string> {
    const res = await this.request("GET", `/invoices/ksef/${encodeURIComponent(ksefNumber)}`, {
      bearer: await this.accessToken(),
      accept: "application/xml",
    });
    return res.text();
  }
}

interface MetadataResponse {
  hasMore: boolean;
  isTruncated: boolean;
  invoices: {
    ksefNumber: string;
    invoiceNumber: string;
    issueDate: string;
    seller: { nip: string };
    buyer: { identifier: { type: string; value?: string | null }; name?: string | null };
    currency: string;
    netAmount: number;
    grossAmount: number;
    vatAmount: number;
    invoiceType: string;
  }[];
}

function toHeader(m: MetadataResponse["invoices"][number]): KsefInvoiceHeader {
  return {
    ksefNumber: m.ksefNumber,
    invoiceNumber: m.invoiceNumber,
    issueDate: m.issueDate,
    sellerNip: m.seller.nip,
    buyerIdentifierType: m.buyer.identifier.type,
    buyerIdentifier: m.buyer.identifier.value ?? null,
    buyerName: m.buyer.name ?? null,
    currency: m.currency,
    netAmount: toMinor(m.netAmount),
    grossAmount: toMinor(m.grossAmount),
    vatAmount: toMinor(m.vatAmount),
    invoiceType: m.invoiceType,
  };
}
