import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { fail, forbiddenOrigin, json, parseBody, sameOrigin, unauthorized } from "@/lib/http";

const Body = z.object({ name: z.string().trim().max(80).optional(), notifyEmail: z.boolean().optional() });

export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const user = await getUser();
  if (!user) return unauthorized();
  const body = await parseBody(req, Body);
  if (!body) return fail(400, "bad_request", "Неверные данные");
  await db
    .update(schema.users)
    .set({
      ...(body.name !== undefined ? { name: body.name || null } : {}),
      ...(body.notifyEmail !== undefined ? { notifyEmail: body.notifyEmail } : {}),
    })
    .where(eq(schema.users.id, user.id));
  return json({ ok: true });
}
