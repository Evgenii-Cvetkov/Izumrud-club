import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { fail, forbiddenOrigin, json, parseBody, sameOrigin, unauthorized } from "@/lib/http";

const Body = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const user = await getUser();
  if (!user) return unauthorized();
  const body = await parseBody(req, Body);
  if (!body) return fail(400, "bad_request", "Неверная подписка");
  await db
    .insert(schema.pushSubscriptions)
    .values({ userId: user.id, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth },
    });
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const user = await getUser();
  if (!user) return unauthorized();
  const body = await parseBody(req, z.object({ endpoint: z.string() }));
  if (body) {
    await db
      .delete(schema.pushSubscriptions)
      .where(and(eq(schema.pushSubscriptions.endpoint, body.endpoint), eq(schema.pushSubscriptions.userId, user.id)));
  }
  return json({ ok: true });
}
