import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const hmac = (s: string) => createHmac("sha256", env.appSecret).update(s).digest("base64url");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** 6-значный код входа, с ведущими нулями. */
export const randomCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** Хэш кода привязан к email, чтобы один и тот же код не совпадал у разных людей. */
export const hashCode = (email: string, code: string) => hmac(`code:${email}:${code}`);
