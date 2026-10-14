import { applyPayment } from "@/lib/billing";
import { env } from "@/lib/env";
import { getPayment } from "@/lib/yookassa";
import { json } from "@/lib/http";

/**
 * Уведомления ЮKassa: payment.succeeded, payment.canceled, refund.succeeded.
 * Телу уведомления не доверяем: берём из него только ID и запрашиваем платёж через API.
 * Отвечаем 200 на всё, что приняли; 500 — чтобы ЮKassa повторила доставку позже.
 */
export async function POST(req: Request) {
  if (env.paymentsMock) return json({ ok: false, reason: "mock_mode" }, 404);

  let body: { event?: string; object?: { id?: string; payment_id?: string } };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false }, 400);
  }

  const paymentId = body.event?.startsWith("refund.") ? body.object?.payment_id : body.object?.id;
  if (!paymentId || typeof paymentId !== "string") return json({ ok: true, ignored: true });

  try {
    const payment = await getPayment(paymentId);
    const result = await applyPayment(payment);
    return json({ ok: true, result });
  } catch (e) {
    console.error("[webhook] ошибка обработки", body.event, paymentId, e);
    return json({ ok: false }, 500);
  }
}
