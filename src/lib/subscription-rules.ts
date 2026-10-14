/**
 * Правила подписки без обращения к базе: доступ, продление, повторы, отмена.
 * Всё, что меняет подписку, проходит через эти функции — их покрывают тесты.
 */
import type { SubscriptionStatus } from "@/db/schema";

export const DAY = 24 * 60 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;
/** Повторные попытки автосписания: через 24 и 48 часов после первой неудачи. */
export const RETRY_DELAYS_HOURS = [24, 48] as const;
export const MAX_RENEWAL_ATTEMPTS = 1 + RETRY_DELAYS_HOURS.length;
export const REMINDER_DAYS_BEFORE = 3;

export interface SubState {
  status: SubscriptionStatus;
  periodStart: Date | null;
  periodEnd: Date | null;
  graceUntil: Date | null;
  autopayEnabled: boolean;
  retryCount: number;
  nextAttemptAt: Date | null;
}

export const emptySub = (): SubState => ({
  status: "pending",
  periodStart: null,
  periodEnd: null,
  graceUntil: null,
  autopayEnabled: false,
  retryCount: 0,
  nextAttemptAt: null,
});

/**
 * +1 календарный месяц. 31 января → 28 (29) февраля, а не 3 марта.
 * Считается в UTC, чтобы результат не зависел от часового пояса сервера.
 */
export function addOneMonth(d: Date): Date {
  const r = new Date(d.getTime());
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, lastDay));
  return r;
}

/** Открыт ли доступ к контенту прямо сейчас. */
export function hasAccess(s: Pick<SubState, "status" | "periodEnd" | "graceUntil"> | null | undefined, now = new Date()): boolean {
  if (!s) return false;
  switch (s.status) {
    case "active":
    case "cancelled":
      return !!s.periodEnd && now < s.periodEnd;
    case "past_due":
      return !!s.graceUntil && now < s.graceUntil;
    default:
      return false;
  }
}

/** До какой даты открыт доступ (для профиля). */
export function accessUntil(s: SubState): Date | null {
  if (s.status === "past_due") return s.graceUntil;
  if (s.status === "active" || s.status === "cancelled") return s.periodEnd;
  return null;
}

/** Успешный первый платёж или возобновление после истечения. */
export function onFirstPaymentSucceeded(s: SubState, paidAt: Date, autopay: boolean): SubState {
  // Если оплатили, пока доступ ещё открыт (например, после отмены), продлеваем от конца периода.
  const base = hasAccess(s, paidAt) && s.periodEnd ? s.periodEnd : paidAt;
  return {
    status: "active",
    periodStart: base === paidAt ? paidAt : s.periodStart,
    periodEnd: addOneMonth(base),
    graceUntil: null,
    autopayEnabled: autopay,
    retryCount: 0,
    nextAttemptAt: null,
  };
}

/**
 * Успешное автосписание. Новый период отсчитывается от конца прошлого,
 * даже если списание прошло со второй попытки — участник не теряет дни.
 */
export function onRenewalSucceeded(s: SubState, renewsPeriodEnd: Date): SubState {
  // Платёж за уже продлённый период — ничего не меняем (повторный вебхук).
  if (s.periodEnd && renewsPeriodEnd.getTime() !== s.periodEnd.getTime()) return s;
  if (s.status !== "active" && s.status !== "past_due") return s;
  return {
    ...s,
    status: "active",
    periodStart: renewsPeriodEnd,
    periodEnd: addOneMonth(renewsPeriodEnd),
    graceUntil: null,
    retryCount: 0,
    nextAttemptAt: null,
  };
}

/** Неудачное автосписание: past_due, следующий повтор или истечение. */
export function onRenewalFailed(s: SubState, failedAt: Date, graceDays: number): SubState {
  if (s.status !== "active" && s.status !== "past_due") return s;
  const attempts = s.retryCount + 1;
  const firstFailureAt = s.status === "past_due" && s.graceUntil
    ? new Date(s.graceUntil.getTime() - graceDays * DAY)
    : failedAt;
  if (attempts >= MAX_RENEWAL_ATTEMPTS) {
    return { ...s, status: "expired", graceUntil: null, retryCount: attempts, nextAttemptAt: null };
  }
  const delayH = RETRY_DELAYS_HOURS[attempts - 1];
  return {
    ...s,
    status: "past_due",
    graceUntil: new Date(firstFailureAt.getTime() + graceDays * DAY),
    retryCount: attempts,
    nextAttemptAt: new Date(firstFailureAt.getTime() + delayH * HOUR),
  };
}

/**
 * Отмена автопродления участником (или удаление карты).
 * Доступ остаётся до конца оплаченного периода; при past_due — закрывается сразу,
 * потому что оплаченного периода уже нет.
 */
export function onCancel(s: SubState): SubState {
  if (s.status === "active") {
    return { ...s, status: "cancelled", autopayEnabled: false, nextAttemptAt: null };
  }
  if (s.status === "past_due") {
    return { ...s, status: "expired", autopayEnabled: false, graceUntil: null, nextAttemptAt: null };
  }
  return { ...s, autopayEnabled: false, nextAttemptAt: null };
}

/** Что фоновая задача должна сделать с подпиской сейчас. */
export type DueAction = "charge" | "expire" | "remind" | null;

export function dueAction(
  s: SubState & { reminderSentFor?: Date | null },
  now: Date,
  hasPaymentMethod: boolean,
): DueAction {
  if (s.status === "cancelled" && s.periodEnd && now >= s.periodEnd) return "expire";
  if (s.status === "past_due") {
    if (s.graceUntil && now >= s.graceUntil) return "expire";
    if (s.nextAttemptAt && now >= s.nextAttemptAt && s.autopayEnabled && hasPaymentMethod) return "charge";
    return null;
  }
  if (s.status === "active" && s.periodEnd) {
    if (now >= s.periodEnd) return s.autopayEnabled && hasPaymentMethod ? "charge" : "expire";
    const remindFrom = s.periodEnd.getTime() - REMINDER_DAYS_BEFORE * DAY;
    const alreadyReminded = s.reminderSentFor && s.reminderSentFor.getTime() === s.periodEnd.getTime();
    if (s.autopayEnabled && now.getTime() >= remindFrom && !alreadyReminded) return "remind";
  }
  return null;
}

/** Ключ идемпотентности для автосписания: один период + номер попытки. */
export function renewalIdempotenceKey(subscriptionId: string, periodEnd: Date, attempt: number): string {
  return `renew:${subscriptionId}:${periodEnd.toISOString()}:${attempt}`;
}
