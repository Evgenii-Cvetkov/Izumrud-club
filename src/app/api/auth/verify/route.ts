import { z } from "zod";
import { startSession, verifyCode } from "@/lib/auth";
import { fail, forbiddenOrigin, json, parseBody, sameOrigin } from "@/lib/http";

const Body = z.object({ email: z.string().max(254), code: z.string().regex(/^\s*\d{6}\s*$/) });

const messages = {
  invalid_code: "Код не подходит. Проверьте цифры или запросите новый",
  expired: "Код устарел. Запросите новый",
  too_many_attempts: "Слишком много неверных попыток. Запросите новый код",
} as const;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const body = await parseBody(req, Body);
  if (!body) return fail(400, "invalid_code", "Введите 6 цифр из письма");

  const r = await verifyCode(body.email, body.code);
  if (!r.ok) return fail(400, r.error, messages[r.error]);
  await startSession(r.userId);
  return json({ ok: true, isNew: r.isNew });
}
