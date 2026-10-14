import { and, eq, inArray, isNull, isNotNull, lte, lt, ne, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { applyPayment, chargeRenewal, expireSubscription, sendRenewalReminder } from "@/lib/billing";
import { dueAction, hasAccess } from "@/lib/subscription-rules";
import { getPayment } from "@/lib/yookassa";
import { sendPush } from "@/lib/push";
import { sendMail } from "@/lib/mail";

export interface Report {
  reminded: number;
  charged: number;
  pending: number;
  expired: number;
  synced: number;
  announced: number;
  errors: number;
}

export async function runOnce(now: Date): Promise<Report> {
  const r: Report = { reminded: 0, charged: 0, pending: 0, expired: 0, synced: 0, announced: 0, errors: 0 };
  await processSubscriptions(now, r);
  await syncPendingRenewals(now, r);
  await announceNewContent(now, r);
  return r;
}

async function processSubscriptions(now: Date, r: Report) {
  const rows = await db
    .select({ sub: schema.subscriptions, methodActive: schema.paymentMethods.isActive })
    .from(schema.subscriptions)
    .leftJoin(schema.paymentMethods, eq(schema.paymentMethods.id, schema.subscriptions.paymentMethodId))
    .where(inArray(schema.subscriptions.status, ["active", "past_due", "cancelled"]));

  for (const { sub, methodActive } of rows) {
    const action = dueAction(sub, now, !!methodActive);
    try {
      if (action === "remind") {
        await sendRenewalReminder(sub);
        r.reminded++;
      } else if (action === "expire") {
        await expireSubscription(sub.id);
        r.expired++;
      } else if (action === "charge") {
        const res = await chargeRenewal(sub);
        if (res === "charged") r.charged++;
        else if (res === "pending") r.pending++;
        else {
          // Списывать нечем (карта отключена) — закрываем по окончании периода.
          await expireSubscription(sub.id);
          r.expired++;
        }
      }
    } catch (e) {
      r.errors++;
      console.error(`[worker] подписка ${sub.id}: ${action}`, e);
    }
  }
}

/** Автоплатежи, по которым не дошёл вебхук: спрашиваем статус у ЮKassa сами. */
async function syncPendingRenewals(now: Date, r: Report) {
  if (env.paymentsMock) return;
  const stale = await db
    .select()
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.status, "pending"),
        isNull(schema.payments.appliedAt),
        isNotNull(schema.payments.yookassaId),
        lt(schema.payments.createdAt, new Date(now.getTime() - 5 * 60 * 1000)),
        dsql`${schema.payments.createdAt} > ${new Date(now.getTime() - 7 * 24 * 3600 * 1000)}`,
      ),
    )
    .limit(100);
  for (const p of stale) {
    try {
      const res = await applyPayment(await getPayment(p.yookassaId!));
      if (res === "applied") r.synced++;
    } catch (e) {
      r.errors++;
      console.error(`[worker] синхронизация платежа ${p.id}`, e);
    }
  }
}

/** Участники с открытым доступом — получатели уведомлений. */
async function memberIds(now: Date) {
  const subs = await db
    .select({ userId: schema.subscriptions.userId, status: schema.subscriptions.status, periodEnd: schema.subscriptions.periodEnd, graceUntil: schema.subscriptions.graceUntil, notifyEmail: schema.users.notifyEmail, email: schema.users.email })
    .from(schema.subscriptions)
    .innerJoin(schema.users, eq(schema.users.id, schema.subscriptions.userId))
    .where(and(ne(schema.subscriptions.status, "expired"), isNull(schema.users.deletedAt)));
  return subs.filter((s) => hasAccess(s, now));
}

async function announceNewContent(now: Date, r: Report) {
  const lectures = await db
    .select()
    .from(schema.lectures)
    .where(and(eq(schema.lectures.status, "published"), lte(schema.lectures.publishedAt, now), isNull(schema.lectures.notifiedAt)));
  const articles = await db
    .select()
    .from(schema.articles)
    .where(and(eq(schema.articles.status, "published"), lte(schema.articles.publishedAt, now), isNull(schema.articles.notifiedAt)));
  if (!lectures.length && !articles.length) return;

  const members = await memberIds(now);
  const ids = members.map((m) => m.userId);

  for (const l of lectures) {
    // Сначала отмечаем, потом рассылаем: лучше пропустить уведомление, чем отправить его дважды.
    await db.update(schema.lectures).set({ notifiedAt: now }).where(eq(schema.lectures.id, l.id));
    const url = `${env.appUrl}/lectures/${l.slug}`;
    await sendPush(ids, { title: "Новая лекция", body: l.title, url });
    for (const m of members.filter((m) => m.notifyEmail)) {
      await sendMail({
        to: m.email,
        subject: `Новая лекция: ${l.title}`,
        text: `${l.title}${l.speaker ? `\n${l.speaker}` : ""}\n\n${l.description ?? ""}\n\nСмотреть и слушать: ${url}\n\nОтключить письма о новых лекциях можно в профиле: ${env.appUrl}/profile`,
      });
    }
    r.announced++;
  }
  for (const a of articles) {
    await db.update(schema.articles).set({ notifiedAt: now }).where(eq(schema.articles.id, a.id));
    await sendPush(ids, { title: "Новая статья", body: a.title, url: `${env.appUrl}/articles/${a.slug}` });
    r.announced++;
  }
}
