import { getViewer } from "@/lib/member";
import { deleteAccount, getActivePaymentMethod } from "@/lib/billing";
import { endSession } from "@/lib/auth";
import { accessUntil } from "@/lib/subscription-rules";
import { forbiddenOrigin, json, sameOrigin, unauthorized } from "@/lib/http";

export async function GET() {
  const { user, sub, isMember } = await getViewer();
  if (!user) return unauthorized();
  const method = await getActivePaymentMethod(user.id);
  return json({
    user: { id: user.id, email: user.email, name: user.name, notifyEmail: user.notifyEmail },
    membership: {
      active: isMember,
      status: sub?.status ?? null,
      accessUntil: sub ? accessUntil(sub) : null,
      autopay: !!sub?.autopayEnabled,
      nextChargeAt: sub?.autopayEnabled && sub.status === "active" ? sub.periodEnd : null,
      paymentMethod: method ? { title: method.title } : null,
    },
  });
}

/** Удаление аккаунта: автоплатёж отключается, данные обезличиваются. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const { user } = await getViewer();
  if (!user) return unauthorized();
  await deleteAccount(user.id);
  await endSession();
  return json({ ok: true });
}
