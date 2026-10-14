// Интерфейс клиента KSeF 2.0. Реализация — следующий шаг, в тестовой среде МФ.
// В бете: только чтение фактур по токену пользователя с правом чтения.

export type KsefEnv = "test" | "prod";

export interface KsefInvoiceHeader {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string; // ISO
  sellerNip: string;
  buyerId: string | null;
  currency: string;
  grossAmount: number; // гроши в валюте фактуры
}

export interface KsefClient {
  /** Открывает сессию по токену пользователя (только чтение). */
  authenticateWithToken(nip: string, token: string): Promise<void>;
  /** Фактуры продаж пользователя за период. */
  listSalesInvoices(from: Date, to: Date): Promise<KsefInvoiceHeader[]>;
  /** Полный XML FA(3) по номеру KSeF. */
  downloadInvoiceXml(ksefNumber: string): Promise<string>;
}
