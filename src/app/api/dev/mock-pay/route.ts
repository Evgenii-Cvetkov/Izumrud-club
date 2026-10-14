import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { applyPayment } from "@/lib/billing";
import { env } from "@/lib/env";
import { mockOutcome } from "@/lib/yookassa";
import { fail, forbiddenOrigin, json, parseBody, sameOrigin, unauthorized } from "@/lib/http";

const Body = z.object({ payment: z.string(), outcome: z.enum(["succeeded", "canceled"]) });

/** Демо-оплата: имитирует то, что вернула бы ЮKassa. Работает только без ключей ЮKassa. */
export async function POST(req: Request) {
  if (!env.paymentsMock || !env.mockPaymentsAllowed) return fail(404, "not_found", "Демо-оплата отключена");
  if (!sameOrigin(req)) return forbiddenOrigin();
  const user = await getUser();
  if (!user) return unauthorized();
  const body = await parseBody(req, Body);
  if (!body) return fail(400, "bad_request", "Неверный запрос");

  const payment = await db.query.payments.findFirst({ where: eq(schema.payments.yookassaId, body.payment) });
  if (!payment || payment.userId !== user.id) return fail(404, "not_found", "Платёж не найден");

  const yk = mockOutcome(body.payment, payment.amountRub, body.outcome, payment.autopayRequested, user.id);
  const result = await applyPayment(yk);
  return json({ ok: true, result, returnUrl: `/join/return?payment=${payment.id}` });
}
