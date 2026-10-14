import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "./env";

let configured = false;
export const pushEnabled = () => !!(env.vapidPublicKey && env.vapidPrivateKey);

function ensureConfigured() {
  if (!configured && pushEnabled()) {
    webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
    configured = true;
  }
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

/** Отправляет push на все устройства пользователей. Устаревшие подписки удаляет. */
export async function sendPush(userIds: string[], payload: PushPayload): Promise<number> {
  if (!pushEnabled() || userIds.length === 0) return 0;
  ensureConfigured();
  const subs = await db.select().from(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.userId, userIds));
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 24 * 3600 });
      sent++;
    } catch (e: unknown) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
      } else {
        console.error("[push] ошибка отправки", code);
      }
    }
  }
  return sent;
}
