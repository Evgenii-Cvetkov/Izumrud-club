import { z } from "zod";
import { requestCode, clientIp } from "@/lib/auth";
import { fail, forbiddenOrigin, json, parseBody, sameOrigin } from "@/lib/http";

const Body = z.object({ email: z.string().max(254) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const body = await parseBody(req, Body);
  if (!body) return fail(400, "invalid_email", "Введите email");

  const r = await requestCode(body.email, await clientIp());
  if (!r.ok) {
    return r.error === "invalid_email"
      ? fail(400, r.error, "Проверьте email: похоже, в нём опечатка")
      : fail(429, r.error, "Слишком много запросов кода. Попробуйте через 10 минут");
  }
  return json(r);
}
