import { NextResponse } from "next/server";
import type { z } from "zod";

export const json = <T>(data: T, status = 200) => NextResponse.json(data, { status });

export const fail = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S> | null> {
  try {
    const parsed = schema.safeParse(await req.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Защита от CSRF для изменяющих запросов: запрос должен прийти с нашего же сайта. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // не браузерный запрос (curl, мобильный клиент) — cookie там не уходят сами
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const forbiddenOrigin = () => fail(403, "bad_origin", "Запрос пришёл с другого сайта");
export const unauthorized = () => fail(401, "unauthorized", "Войдите в аккаунт");
export const paymentRequired = () => fail(402, "membership_required", "Членство в клубе не активно");
