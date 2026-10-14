import { getUser } from "@/lib/auth";
import { cancelAutopay } from "@/lib/billing";
import { forbiddenOrigin, json, sameOrigin, unauthorized } from "@/lib/http";

/** Отменить автопродление. Доступ остаётся до конца оплаченного периода. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const user = await getUser();
  if (!user) return unauthorized();
  const sub = await cancelAutopay(user.id);
  return json({ ok: true, status: sub?.status ?? null, periodEnd: sub?.periodEnd ?? null });
}
