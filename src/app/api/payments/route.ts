import { getUser } from "@/lib/auth";
import { listPayments } from "@/lib/billing";
import { json, unauthorized } from "@/lib/http";

export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  const rows = await listPayments(user.id);
  return json(
    rows.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      amountRub: p.amountRub,
      refundedRub: p.refundedRub,
      status: p.status,
      kind: p.kind,
    })),
  );
}
