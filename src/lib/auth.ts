import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, gte, isNull, sql as dsql, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "./env";
import { hashCode, randomCode, randomToken, safeEqual, sha256 } from "./crypto";
import { sendMail, mailDevMode } from "./mail";
import { normalizeEmail } from "./format";

export const SESSION_COOKIE = "izumrud_session";
const SESSION_DAYS = 30;
export const MAX_SESSIONS = 3;
const CODE_TTL_MIN = 10;
const CODE_MAX_ATTEMPTS = 5;
const CODES_PER_EMAIL_10MIN = 3;
const CODES_PER_IP_10MIN = 10;

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || "unknown";
}

export function deviceLabel(ua: string | null): string {
  if (!ua) return "Неизвестное устройство";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Устройство";
  const br = /YaBrowser/.test(ua) ? "Яндекс Браузер" : /Edg\//.test(ua) ? "Edge" : /Firefox/.test(ua) ? "Firefox"
    : /Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "браузер";
  return `${os}, ${br}`;
}

export type RequestCodeResult =
  | { ok: true; devCode?: string }
  | { ok: false; error: "invalid_email" | "too_many_requests" };

/** Отправляет одноразовый код на email. */
export async function requestCode(rawEmail: string, ip: string): Promise<RequestCodeResult> {
  const email = normalizeEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { ok: false, error: "invalid_email" };

  const since = new Date(Date.now() - 10 * 60 * 1000);
  const [{ byEmail }] = await db
    .select({ byEmail: dsql<number>`count(*)::int` })
    .from(schema.authCodes)
    .where(and(eq(schema.authCodes.email, email), gte(schema.authCodes.createdAt, since)));
  const [{ byIp }] = await db
    .select({ byIp: dsql<number>`count(*)::int` })
    .from(schema.authCodes)
    .where(and(eq(schema.authCodes.ip, ip), gte(schema.authCodes.createdAt, since)));
  if (byEmail >= CODES_PER_EMAIL_10MIN || byIp >= CODES_PER_IP_10MIN) return { ok: false, error: "too_many_requests" };

  const code = randomCode();
  await db.insert(schema.authCodes).values({
    email,
    codeHash: hashCode(email, code),
    ip,
    expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60 * 1000),
  });

  await sendMail({
    to: email,
    subject: `Код для входа: ${code}`,
    text: `Ваш код для входа в клуб «Изумруд»: ${code}\n\nКод действует ${CODE_TTL_MIN} минут. Если вы не пытались войти, просто проигнорируйте это письмо.`,
  });

  // В разработке без почты код показывается прямо в форме.
  return mailDevMode() && !env.isProd ? { ok: true, devCode: code } : { ok: true };
}

export type VerifyResult =
  | { ok: true; userId: string; isNew: boolean }
  | { ok: false; error: "invalid_code" | "expired" | "too_many_attempts" };

export async function verifyCode(rawEmail: string, code: string): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  const [row] = await db
    .select()
    .from(schema.authCodes)
    .where(and(eq(schema.authCodes.email, email), gt(schema.authCodes.expiresAt, new Date())))
    .orderBy(desc(schema.authCodes.createdAt))
    .limit(1);
  if (!row) return { ok: false, error: "expired" };
  if (row.attempts >= CODE_MAX_ATTEMPTS) return { ok: false, error: "too_many_attempts" };

  if (!safeEqual(row.codeHash, hashCode(email, code.trim()))) {
    await db
      .update(schema.authCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(schema.authCodes.id, row.id));
    return { ok: false, error: row.attempts + 1 >= CODE_MAX_ATTEMPTS ? "too_many_attempts" : "invalid_code" };
  }

  await db.delete(schema.authCodes).where(eq(schema.authCodes.email, email));

  // Удалённые аккаунты обезличены (email заменён), поэтому сюда попадают только живые.
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (existing) return { ok: true, userId: existing.id, isNew: false };
  const [created] = await db.insert(schema.users).values({ email }).returning({ id: schema.users.id });
  return { ok: true, userId: created.id, isNew: true };
}

/** Создаёт сессию и ставит cookie. Сверх трёх устройств завершает самые старые сессии. */
export async function startSession(userId: string) {
  const h = await headers();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(schema.sessions).values({
    userId,
    tokenHash: sha256(token),
    ip: await clientIp(),
    deviceLabel: deviceLabel(h.get("user-agent")),
    expiresAt,
  });

  const all = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, userId))
    .orderBy(desc(schema.sessions.lastSeenAt));
  const extra = all.slice(MAX_SESSIONS).map((s) => s.id);
  if (extra.length) await db.delete(schema.sessions).where(inArray(schema.sessions.id, extra));

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

export interface CurrentSession {
  sessionId: string;
  user: typeof schema.users.$inferSelect;
}

/** Текущая сессия (один запрос к базе на HTTP-запрос). */
export const getSession = cache(async (): Promise<CurrentSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, sha256(token)), gt(schema.sessions.expiresAt, new Date()), isNull(schema.users.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (Date.now() - row.session.lastSeenAt.getTime() > 10 * 60 * 1000) {
    await db.update(schema.sessions).set({ lastSeenAt: new Date() }).where(eq(schema.sessions.id, row.session.id));
  }
  return { sessionId: row.session.id, user: row.user };
});

export async function getUser() {
  return (await getSession())?.user ?? null;
}

/** Для страниц: без входа — на /login с возвратом. */
export async function requireUser(next: string) {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
