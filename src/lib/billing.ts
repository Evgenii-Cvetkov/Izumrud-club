/**
 * Подписка и платежи: оформление, применение результатов ЮKassa, продление, отмена.
 * Правила переходов — в subscription-rules.ts; здесь только база, ЮKassa и письма.
 */
import { and, desc, eq, isNull, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Subscription } from "@/db/schema";
import { env } from "./env";
import { randomToken } from "./crypto";
import { sendMail } from "./mail";
import { formatDate, formatRub } from "./format";
import { CONSENT_VERSION } from "./consents";
import {
  hasAccess,
  onCancel,
  onFirstPaymentSucceeded,
  onRenewalFailed,
  onRenewalSucceeded,
  renewalIdempotenceKey,
  type SubState,
} from "./subscription-rules";
import { createPayment, failureText, paymentMethodTitle, type YkPayment } from "./yookassa";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const MEMBERSHIP_DESCRIPTION = "Членство в клубе «Изумруд», 1 месяц";

const toState = (s: Subscription): SubState => ({
  status: s.status,
  periodStart: s.periodStart,
  periodEnd: s.periodEnd,
  graceUntil: s.graceUntil,
  autopayEnabled: s.autopayEnabled,
  retryCount: s.retryCount,
  nextAttemptAt: s.nextAttemptAt,
});

export async function getSubscription(userId: string) {
  return (await db.query.subscriptions.findFirst({ where: eq(schema.subscriptions.userId, userId) })) ?? null;
}

export async function userHasAccess(userId: string, now = new Date()) {
  return hasAccess(await getSubscription(userId), now);
}

export async function getActivePaymentMethod(userId: string) {
  return (
    (await db.query.paymentMethods.findFirst({
      where: and(eq(schema.paymentMethods.userId, userId), eq(schema.paymentMethods.isActive, true)),
      orderBy: desc(schema.paymentMethods.createdAt),
    })) ?? null
  );
}

// ─── Оформление ──────────────────────────────────────────────────────

export type CheckoutResult =
  | { ok: true; confirmationUrl: string }
  | { ok: false; error: "already_active" | "consents_required" | "payment_error"; message: string };

export async function startCheckout(
  user: { id: string; email: string },
  input: { pdn: boolean; offer: boolean; autopay: boolean; ip: string },
): Promise<CheckoutResult> {
  if (!input.pdn || !input.offer) {
    return { ok: false, error: "consents_required", message: "Чтобы вступить, нужно согласие на обработку данных и принятие оферты" };
  }
  const sub = await getSubscription(user.id);
  if (sub && hasAccess(sub) && sub.autopayEnabled) {
    return { ok: false, error: "already_active", message: "Членство уже активно, автопродление включено" };
  }

  const types: ("pdn" | "offer" | "autopay")[] = input.autopay ? ["pdn", "offer", "autopay"] : ["pdn", "offer"];
  const consentRows = types.map((type) => ({
    userId: user.id,
    type,
    textVersion: CONSENT_VERSION,
    ip: input.ip,
  }));
  await db.insert(schema.consents).values(consentRows);

  const subscriptionId =
    sub?.id ??
    (await db
      .insert(schema.subscriptions)
      .values({ userId: user.id, status: "pending" })
      .onConflictDoNothing()
      .returning({ id: schema.subscriptions.id }))[0]?.id ??
    (await getSubscription(user.id))!.id;

  const idempotenceKey = `first:${user.id}:${randomToken(12)}`;
  const [payment] = await db
    .insert(schema.payments)
    .values({ userId: user.id, subscriptionId, idempotenceKey, amountRub: env.priceRub, kind: "first", autopayRequested: input.autopay })
    .returning();

  try {
    const yk = await createPayment({
      amountRub: env.priceRub,
      description: MEMBERSHIP_DESCRIPTION,
      idempotenceKey,
      metadata: { payment_id: payment.id, user_id: user.id },
      customerEmail: user.email,
      returnUrl: `${env.appUrl}/join/return?payment=${payment.id}`,
      savePaymentMethod: input.autopay,
    });
    await db.update(schema.payments).set({ yookassaId: yk.id, updatedAt: new Date() }).where(eq(schema.payments.id, payment.id));
    const url = yk.confirmation?.confirmation_url;
    if (!url) throw new Error("ЮKassa не вернула ссылку на оплату");
    return { ok: true, confirmationUrl: url };
  } catch (e) {
    console.error("[billing] не удалось создать платёж", e);
    await db
      .update(schema.payments)
      .set({ status: "canceled", failureReason: "create_failed", appliedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.payments.id, payment.id));
    return { ok: false, error: "payment_error", message: "Платёжный сервис не отвечает. Попробуйте ещё раз через минуту" };
  }
}

// ─── Результат платежа (вебхук, ответ на автоплатёж, демо-страница) ─────

type Effect = { kind: "welcome" | "renewed" | "renewal_failed"; email: string; periodEnd?: Date | null; graceUntil?: Date | null; reason?: string };

/**
 * Применяет состояние платежа из ЮKassa к нашей базе. Идемпотентно: повторный
 * вызов с тем же платежом ничего не меняет и писем повторно не отправляет.
 */
export async function applyPayment(yk: YkPayment): Promise<"applied" | "ignored" | "unknown"> {
  const effects: Effect[] = [];
  const outcome = await db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.yookassaId, yk.id))
      .for("update")
      .limit(1);
    if (!payment) return "unknown" as const;

    // Частичный или полный возврат — только отметка в истории.
    const refunded = yk.refunded_amount ? Math.round(Number(yk.refunded_amount.value)) : 0;
    if (refunded > payment.refundedRub) {
      await tx
        .update(schema.payments)
        .set({ refundedRub: refunded, status: refunded >= payment.amountRub ? "refunded" : payment.status, updatedAt: new Date() })
        .where(eq(schema.payments.id, payment.id));
    }

    if (payment.appliedAt || (yk.status !== "succeeded" && yk.status !== "canceled")) return "ignored" as const;

    const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, payment.userId)).limit(1);
    const [sub] = await tx
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, payment.userId))
      .for("update")
      .limit(1);
    const now = new Date();

    await tx
      .update(schema.payments)
      .set({
        status: yk.status === "succeeded" ? "succeeded" : "canceled",
        failureReason: yk.cancellation_details?.reason ?? null,
        appliedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.payments.id, payment.id));

    if (!sub) return "applied" as const;
    let next: SubState = toState(sub);
    let paymentMethodId = sub.paymentMethodId;

    if (yk.status === "succeeded") {
      if (payment.kind === "first") {
        const pm = yk.payment_method;
        const canAutopay = payment.autopayRequested && !!pm?.saved;
        if (canAutopay && pm) paymentMethodId = await saveMethod(tx, payment.userId, pm);
        next = onFirstPaymentSucceeded(next, now, canAutopay);
        if (!canAutopay) paymentMethodId = null;
        effects.push({ kind: "welcome", email: user.email, periodEnd: next.periodEnd });
      } else if (payment.renewsPeriodEnd) {
        next = onRenewalSucceeded(next, payment.renewsPeriodEnd);
        effects.push({ kind: "renewed", email: user.email, periodEnd: next.periodEnd });
      }
    } else if (payment.kind === "renewal") {
      next = onRenewalFailed(next, now, env.graceDays);
      effects.push({ kind: "renewal_failed", email: user.email, graceUntil: next.graceUntil, reason: yk.cancellation_details?.reason });
      if (yk.cancellation_details?.reason === "permission_revoked" && paymentMethodId) {
        // Участник отозвал разрешение через банк — способ оплаты больше не используем.
        await deactivateMethods(tx, payment.userId);
        next = { ...next, autopayEnabled: false };
        paymentMethodId = null;
      }
    }

    await tx
      .update(schema.subscriptions)
      .set({ ...next, paymentMethodId, updatedAt: now })
      .where(eq(schema.subscriptions.id, sub.id));
    return "applied" as const;
  });

  for (const e of effects) await sendEffectMail(e);
  return outcome;
}

async function saveMethod(tx: Tx, userId: string, pm: NonNullable<YkPayment["payment_method"]>): Promise<string> {
  await deactivateMethods(tx, userId);
  const [row] = await tx
    .insert(schema.paymentMethods)
    .values({ userId, yookassaId: pm.id, title: paymentMethodTitle(pm), type: pm.type })
    .onConflictDoUpdate({
      target: schema.paymentMethods.yookassaId,
      set: { isActive: true, deactivatedAt: null, title: paymentMethodTitle(pm) },
    })
    .returning({ id: schema.paymentMethods.id });
  return row.id;
}

async function deactivateMethods(tx: Tx | typeof db, userId: string) {
  await tx
    .update(schema.paymentMethods)
    .set({ isActive: false, deactivatedAt: new Date() })
    .where(and(eq(schema.paymentMethods.userId, userId), eq(schema.paymentMethods.isActive, true)));
}

async function sendEffectMail(e: Effect) {
  const profile = `${env.appUrl}/profile`;
  if (e.kind === "welcome") {
    await sendMail({
      to: e.email,
      subject: "Добро пожаловать в клуб «Изумруд»",
      text: `Оплата прошла, членство активно до ${formatDate(e.periodEnd)}.\n\nЛекции, статьи и фото встреч уже открыты: ${env.appUrl}/feed\n\nЧек придёт отдельным письмом от платёжного сервиса. Управлять подпиской можно в профиле: ${profile}`,
    });
  } else if (e.kind === "renewed") {
    await sendMail({
      to: e.email,
      subject: "Членство продлено",
      text: `Списали ${formatRub(env.priceRub)}, членство продлено до ${formatDate(e.periodEnd)}.\n\nОтключить автопродление можно в профиле: ${profile}`,
    });
  } else {
    await sendMail({
      to: e.email,
      subject: "Не удалось продлить членство",
      text: `Не получилось списать ${formatRub(env.priceRub)}: ${failureText(e.reason)}.\n\nДоступ к лекциям сохранится до ${formatDate(e.graceUntil)}. Мы попробуем списать оплату ещё раз. Чтобы оплатить другой картой, откройте профиль: ${profile}`,
    });
  }
}

// ─── Продление (фоновая задача) ──────────────────────────────────────

/** Создаёт автоплатёж за текущий period_end. Безопасно вызывать повторно. */
export async function chargeRenewal(sub: Subscription): Promise<"charged" | "pending" | "skipped"> {
  if (!sub.periodEnd || !sub.paymentMethodId || !sub.autopayEnabled) return "skipped";
  const method = await db.query.paymentMethods.findFirst({ where: eq(schema.paymentMethods.id, sub.paymentMethodId) });
  if (!method?.isActive) return "skipped";
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, sub.userId) });
  if (!user || user.deletedAt) return "skipped";

  const attempt = sub.retryCount + 1;
  const key = renewalIdempotenceKey(sub.id, sub.periodEnd, attempt);

  let payment = await db.query.payments.findFirst({ where: eq(schema.payments.idempotenceKey, key) });
  if (payment?.appliedAt) return "skipped";
  if (!payment) {
    [payment] = await db
      .insert(schema.payments)
      .values({
        userId: sub.userId,
        subscriptionId: sub.id,
        idempotenceKey: key,
        amountRub: env.priceRub,
        kind: "renewal",
        renewsPeriodEnd: sub.periodEnd,
      })
      .onConflictDoNothing()
      .returning();
    if (!payment) return "pending"; // параллельный процесс уже создал платёж
  }

  // Тот же Idempotence-Key: при повторном вызове ЮKassa вернёт тот же платёж, а не спишет второй раз.
  const yk = await createPayment({
    amountRub: env.priceRub,
    description: MEMBERSHIP_DESCRIPTION,
    idempotenceKey: key,
    metadata: { payment_id: payment.id, user_id: sub.userId },
    customerEmail: user.email,
    paymentMethodId: method.yookassaId,
  });
  if (!payment.yookassaId) {
    await db.update(schema.payments).set({ yookassaId: yk.id, updatedAt: new Date() }).where(eq(schema.payments.id, payment.id));
  }
  if (yk.status === "succeeded" || yk.status === "canceled") {
    await applyPayment(yk);
    return "charged";
  }
  return "pending";
}

export async function expireSubscription(subId: string) {
  await db
    .update(schema.subscriptions)
    .set({ status: "expired", graceUntil: null, nextAttemptAt: null, updatedAt: new Date() })
    .where(eq(schema.subscriptions.id, subId));
}

export async function sendRenewalReminder(sub: Subscription) {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, sub.userId) });
  if (!user || user.deletedAt || !sub.periodEnd) return;
  await sendMail({
    to: user.email,
    subject: `${formatDate(sub.periodEnd)} продлим членство`,
    text: `${formatDate(sub.periodEnd)} спишем ${formatRub(env.priceRub)} за следующий месяц членства в клубе «Изумруд».\n\nЕсли не хотите продлевать, отключите автопродление в профиле — доступ сохранится до ${formatDate(sub.periodEnd)}: ${env.appUrl}/profile`,
  });
  await db
    .update(schema.subscriptions)
    .set({ reminderSentFor: sub.periodEnd, updatedAt: new Date() })
    .where(eq(schema.subscriptions.id, sub.id));
}

// ─── Отмена, удаление карты, удаление аккаунта ────────────────────────

/**
 * Выключает автопродление и перестаёт использовать сохранённый способ оплаты (376-ФЗ).
 * Доступ сохраняется до конца оплаченного периода.
 */
export async function cancelAutopay(userId: string) {
  return db.transaction(async (tx) => {
    const [sub] = await tx.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId, userId)).for("update").limit(1);
    await deactivateMethods(tx, userId);
    await tx
      .update(schema.consents)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.consents.userId, userId), eq(schema.consents.type, "autopay"), isNull(schema.consents.revokedAt)));
    if (!sub) return null;
    const next = onCancel(toState(sub));
    await tx
      .update(schema.subscriptions)
      .set({ ...next, paymentMethodId: null, updatedAt: new Date() })
      .where(eq(schema.subscriptions.id, sub.id));
    return next;
  });
}

/** Удаление аккаунта: отключаем автоплатёж, обезличиваем данные. Платежи храним для бухгалтерии. */
export async function deleteAccount(userId: string) {
  await cancelAutopay(userId);
  await db.transaction(async (tx) => {
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    await tx.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
    await tx.delete(schema.progress).where(eq(schema.progress.userId, userId));
    await tx
      .update(schema.subscriptions)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(schema.subscriptions.userId, userId));
    await tx
      .update(schema.users)
      .set({ email: dsql`'deleted-' || ${userId} || '@deleted.invalid'`, name: null, deletedAt: new Date() })
      .where(eq(schema.users.id, userId));
  });
}

export async function listPayments(userId: string) {
  return db.query.payments.findMany({
    where: eq(schema.payments.userId, userId),
    orderBy: desc(schema.payments.createdAt),
    limit: 50,
  });
}
