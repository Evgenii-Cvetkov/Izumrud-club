import { z } from "zod";
import { clientIp, getUser } from "@/lib/auth";
import { startCheckout } from "@/lib/billing";
import { fail, forbiddenOrigin, json, parseBody, sameOrigin, unauthorized } from "@/lib/http";

const Body = z.object({ pdn: z.boolean(), offer: z.boolean(), autopay: z.boolean() });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const user = await getUser();
  if (!user) return unauthorized();
  const body = await parseBody(req, Body);
  if (!body) return fail(400, "consents_required", "Отметьте согласия");

  const r = await startCheckout(user, { ...body, ip: await clientIp() });
  if (!r.ok) return fail(r.error === "payment_error" ? 502 : 400, r.error, r.message);
  return json({ confirmationUrl: r.confirmationUrl });
}
