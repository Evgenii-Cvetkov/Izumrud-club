/**
 * Клиент API ЮKassa v3: создание платежа (первого и автоплатежа) и получение статуса.
 * Без YOOKASSA_SHOP_ID работает демо-режим: платёж «оплачивается» на странице /dev/mock-pay.
 */
import { randomUUID } from "node:crypto";
import { env } from "./env";

const API = "https://api.yookassa.ru/v3";

export interface YkPaymentMethod {
  id: string;
  type: string;
  saved: boolean;
  title?: string;
  card?: { last4?: string; card_type?: string };
}

export interface YkPayment {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paid: boolean;
  amount: { value: string; currency: string };
  refunded_amount?: { value: string; currency: string };
  payment_method?: YkPaymentMethod;
  cancellation_details?: { party: string; reason: string };
  confirmation?: { type: string; confirmation_url?: string };
  metadata?: Record<string, string>;
  created_at: string;
}

export interface CreatePaymentParams {
  amountRub: number;
  description: string;
  idempotenceKey: string;
  metadata: Record<string, string>;
  customerEmail: string;
  /** Первый платёж: куда вернуть пользователя и сохранять ли способ оплаты. */
  returnUrl?: string;
  savePaymentMethod?: boolean;
  /** Автоплатёж: ID сохранённого способа оплаты. */
  paymentMethodId?: string;
}

export class YookassaError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: unknown) {
    super(message);
  }
}

const money = (rub: number) => ({ value: rub.toFixed(2), currency: "RUB" });

function authHeader() {
  return "Basic " + Buffer.from(`${env.yookassaShopId}:${env.yookassaSecretKey}`).toString("base64");
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, idempotenceKey?: string): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(idempotenceKey ? { "Idempotence-Key": idempotenceKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new YookassaError(`ЮKassa ответила ${res.status}`, res.status, data);
  return data as T;
}

export async function createPayment(p: CreatePaymentParams): Promise<YkPayment> {
  if (env.paymentsMock) return mockCreate(p);

  const body: Record<string, unknown> = {
    amount: money(p.amountRub),
    capture: true,
    description: p.description.slice(0, 128),
    metadata: p.metadata,
  };
  if (p.paymentMethodId) {
    body.payment_method_id = p.paymentMethodId;
  } else {
    body.confirmation = { type: "redirect", return_url: p.returnUrl };
    body.save_payment_method = !!p.savePaymentMethod;
  }
  if (env.yookassaReceipts) {
    body.receipt = {
      customer: { email: p.customerEmail },
      items: [
        {
          description: p.description.slice(0, 128),
          quantity: "1.00",
          amount: money(p.amountRub),
          vat_code: env.yookassaVatCode,
          payment_mode: "full_payment",
          payment_subject: "service",
        },
      ],
    };
  }
  return call<YkPayment>("POST", "/payments", body, p.idempotenceKey);
}

export async function getPayment(id: string): Promise<YkPayment> {
  if (env.paymentsMock) throw new YookassaError("В демо-режиме статус платежа меняется только через /dev/mock-pay");
  return call<YkPayment>("GET", `/payments/${encodeURIComponent(id)}`);
}

// ─── Демо-режим ───────────────────────────────────────────────────────

function mockCreate(p: CreatePaymentParams): YkPayment {
  if (!env.mockPaymentsAllowed) throw new YookassaError("ЮKassa не настроена: задайте YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY");
  const id = `mock_${randomUUID()}`;
  const base: YkPayment = {
    id,
    status: "pending",
    paid: false,
    amount: money(p.amountRub),
    metadata: p.metadata,
    created_at: new Date().toISOString(),
  };
  if (p.paymentMethodId) {
    // Автоплатёж в демо: проходит, кроме адресов с «+fail» или при MOCK_AUTOPAY_FAIL=1.
    const fail = process.env.MOCK_AUTOPAY_FAIL === "1" || p.customerEmail.includes("+fail");
    return fail
      ? { ...base, status: "canceled", cancellation_details: { party: "issuer", reason: "insufficient_funds" } }
      : { ...base, status: "succeeded", paid: true, payment_method: { id: p.paymentMethodId, type: "bank_card", saved: true } };
  }
  return {
    ...base,
    confirmation: { type: "redirect", confirmation_url: `${env.appUrl}/dev/mock-pay?payment=${encodeURIComponent(id)}` },
  };
}

/** Объект платежа, который «вернула бы» ЮKassa после действия на демо-странице. */
export function mockOutcome(id: string, amountRub: number, outcome: "succeeded" | "canceled", savePaymentMethod: boolean, userId: string): YkPayment {
  const base: YkPayment = { id, status: outcome, paid: outcome === "succeeded", amount: money(amountRub), created_at: new Date().toISOString() };
  if (outcome === "canceled") return { ...base, cancellation_details: { party: "yoo_money", reason: "expired_on_confirmation" } };
  return {
    ...base,
    payment_method: { id: `mock_pm_${userId}`, type: "bank_card", saved: savePaymentMethod, title: "Bank card *4242", card: { last4: "4242", card_type: "Mir" } },
  };
}

/** Человекочитаемое название способа оплаты для профиля. */
export function paymentMethodTitle(pm: YkPaymentMethod): string {
  if (pm.type === "bank_card") {
    const brand = pm.card?.card_type && pm.card.card_type !== "Unknown" ? pm.card.card_type : "Карта";
    return pm.card?.last4 ? `${brand} •• ${pm.card.last4}` : brand;
  }
  if (pm.type === "sbp") return "СБП";
  if (pm.type === "sberbank") return "SberPay";
  if (pm.type === "yoo_money") return "ЮMoney";
  return pm.title ?? pm.type;
}

/** Причины отказа ЮKassa → понятный текст для участника. */
export function failureText(reason?: string): string {
  switch (reason) {
    case "insufficient_funds":
      return "недостаточно средств на карте";
    case "card_expired":
      return "срок действия карты истёк";
    case "permission_revoked":
      return "банк отозвал разрешение на автосписания";
    case "expired_on_confirmation":
      return "оплата не была подтверждена вовремя";
    case "3d_secure_failed":
      return "не пройдено подтверждение платежа в банке";
    default:
      return "банк отклонил платёж";
  }
}
