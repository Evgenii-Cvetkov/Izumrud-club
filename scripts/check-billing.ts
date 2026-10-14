/**
 * Сквозная проверка подписки на настоящей базе в демо-режиме ЮKassa.
 * Создаёт тестовых пользователей с адресами @check.invalid и удаляет их в конце.
 * Запуск: npx tsx scripts/check-billing.ts
 */
import { existsSync } from "node:fs";
if (existsSync(".env") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env");
delete process.env.YOOKASSA_SHOP_ID;

import assert from "node:assert/strict";

async function main() {
  const { db, schema, sql } = await import("@/db");
  const { eq, like } = await import("drizzle-orm");
  const billing = await import("@/lib/billing");
  const { mockOutcome } = await import("@/lib/yookassa");
  const { runOnce } = await import("../worker/jobs");
  const { DAY, HOUR, hasAccess } = await import("@/lib/subscription-rules");

  const cleanup = async () => {
    await db.delete(schema.users).where(like(schema.users.email, "%@check.invalid"));
  };
  await cleanup();

  const mkUser = async (email: string) => (await db.insert(schema.users).values({ email }).returning())[0];
  const sub = async (userId: string) => (await billing.getSubscription(userId))!;
  const setPeriodEnd = (userId: string, d: Date) =>
    db.update(schema.subscriptions).set({ periodEnd: d, reminderSentFor: null }).where(eq(schema.subscriptions.userId, userId));
  const pay = async (userId: string, autopay: boolean, outcome: "succeeded" | "canceled" = "succeeded") => {
    const u = (await db.query.users.findFirst({ where: eq(schema.users.id, userId) }))!;
    const r = await billing.startCheckout(u, { pdn: true, offer: true, autopay, ip: "127.0.0.1" });
    assert.ok(r.ok, "checkout создан");
    const ykId = new URL(r.confirmationUrl).searchParams.get("payment")!;
    const p = (await db.query.payments.findFirst({ where: eq(schema.payments.yookassaId, ykId) }))!;
    return billing.applyPayment(mockOutcome(ykId, p.amountRub, outcome, p.autopayRequested, userId));
  };

  // 1. Без согласий оформить нельзя
  const a = await mkUser("anna@check.invalid");
  const noConsent = await billing.startCheckout(a, { pdn: true, offer: false, autopay: true, ip: "x" });
  assert.equal(noConsent.ok, false);

  // 2. Отказ на странице оплаты — доступа нет
  await pay(a.id, true, "canceled");
  assert.equal((await sub(a.id)).status, "pending");
  assert.equal(hasAccess(await sub(a.id)), false);

  // 3. Успешная оплата с автосписанием — доступ на месяц, карта сохранена
  assert.equal(await pay(a.id, true), "applied");
  let s = await sub(a.id);
  assert.equal(s.status, "active");
  assert.ok(s.autopayEnabled && s.paymentMethodId);
  assert.ok(hasAccess(s));
  const consents = await db.select().from(schema.consents).where(eq(schema.consents.userId, a.id));
  assert.ok(consents.some((c) => c.type === "autopay"), "согласие на автосписание записано");

  // 4. Повторный вебхук того же платежа ничего не меняет
  const firstPay = (await db.query.payments.findFirst({ where: eq(schema.payments.userId, a.id), orderBy: (p, { desc }) => desc(p.createdAt) }))!;
  assert.equal(await billing.applyPayment(mockOutcome(firstPay.yookassaId!, 10000, "succeeded", true, a.id)), "ignored");

  // 5. Напоминание за 3 дня, затем автопродление
  const now = new Date();
  await setPeriodEnd(a.id, new Date(now.getTime() + 2 * DAY));
  let rep = await runOnce(now);
  assert.equal(rep.reminded, 1, "напоминание отправлено");
  rep = await runOnce(now);
  assert.equal(rep.reminded, 0, "второй раз не напоминаем");
  const end = new Date(now.getTime() - 60_000);
  await setPeriodEnd(a.id, end);
  rep = await runOnce(now);
  assert.equal(rep.charged, 1, "автосписание прошло");
  s = await sub(a.id);
  assert.equal(s.status, "active");
  assert.ok(s.periodEnd! > now);
  rep = await runOnce(now);
  assert.equal(rep.charged, 0, "повторный проход не списывает второй раз");

  // 6. Неудачные автосписания: past_due → два повтора → expired
  const b = await mkUser("boris+fail@check.invalid");
  await pay(b.id, true);
  const bEnd = new Date(now.getTime() - 60_000);
  await setPeriodEnd(b.id, bEnd);
  await runOnce(now);
  s = await sub(b.id);
  assert.equal(s.status, "past_due");
  assert.ok(hasAccess(s, now), "доступ сохраняется на время повторов");
  await runOnce(new Date(now.getTime() + 25 * HOUR));
  assert.equal((await sub(b.id)).retryCount, 2);
  await runOnce(new Date(now.getTime() + 49 * HOUR));
  s = await sub(b.id);
  assert.equal(s.status, "expired");
  assert.equal(hasAccess(s), false);
  const bPays = await db.select().from(schema.payments).where(eq(schema.payments.userId, b.id));
  assert.equal(bPays.filter((p) => p.kind === "renewal").length, 3, "ровно три попытки списания");

  // 7. Отмена: доступ до конца периода, карта отключена, списаний нет
  const c = await mkUser("vera@check.invalid");
  await pay(c.id, true);
  await billing.cancelAutopay(c.id);
  s = await sub(c.id);
  assert.equal(s.status, "cancelled");
  assert.equal(s.paymentMethodId, null);
  assert.ok(hasAccess(s));
  const methods = await db.select().from(schema.paymentMethods).where(eq(schema.paymentMethods.userId, c.id));
  assert.ok(methods.every((m) => !m.isActive), "карта отключена");
  await setPeriodEnd(c.id, new Date(now.getTime() - 60_000));
  rep = await runOnce(now);
  s = await sub(c.id);
  assert.equal(s.status, "expired");
  const cRenewals = (await db.select().from(schema.payments).where(eq(schema.payments.userId, c.id))).filter((p) => p.kind === "renewal");
  assert.equal(cRenewals.length, 0, "после отмены не было ни одного автосписания");

  // 8. Возвращение: новая оплата открывает доступ снова
  await pay(c.id, false);
  s = await sub(c.id);
  assert.equal(s.status, "active");
  assert.equal(s.autopayEnabled, false, "без галочки автосписания карта не сохраняется");
  await setPeriodEnd(c.id, new Date(now.getTime() - 60_000));
  await runOnce(now);
  assert.equal((await sub(c.id)).status, "expired", "без автопродления доступ закрывается в срок");

  // 9. Удаление аккаунта обезличивает данные
  await billing.deleteAccount(a.id);
  const deleted = (await db.query.users.findFirst({ where: eq(schema.users.id, a.id) }))!;
  assert.ok(deleted.deletedAt && deleted.email.endsWith("@deleted.invalid"));
  await db.delete(schema.users).where(eq(schema.users.id, a.id));

  await cleanup();
  await sql.end();
  console.log("Проверка подписки: все сценарии прошли");
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
