import { getUser } from "@/lib/auth";
import { cancelAutopay } from "@/lib/billing";
import { forbiddenOrigin, json, sameOrigin, unauthorized } from "@/lib/http";

/** Удалить карту. По 376-ФЗ после этого по ней нельзя списывать — автопродление выключается. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const user = await getUser();
  if (!user) return unauthorized();
  const sub = await cancelAutopay(user.id);
  return json({ ok: true, status: sub?.status ?? null });
}
