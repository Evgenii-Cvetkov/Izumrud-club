import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, getSession } from "@/lib/auth";
import { getViewer } from "@/lib/member";
import { getActivePaymentMethod, listPayments } from "@/lib/billing";
import { accessUntil } from "@/lib/subscription-rules";
import { env } from "@/lib/env";
import { formatDate, formatRub } from "@/lib/format";
import { MembershipActions, NameForm, NotificationSettings, AccountActions } from "./ProfileClient";

export const metadata: Metadata = { title: "Профиль" };

const PAYMENT_STATUS: Record<string, string> = {
  succeeded: "Оплачен",
  pending: "Обрабатывается",
  canceled: "Не прошёл",
  refunded: "Возвращён",
};

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const session = await getSession();
  const { sub, isMember } = await getViewer();
  const [method, payments, devices] = await Promise.all([
    getActivePaymentMethod(user.id),
    listPayments(user.id),
    db.select().from(schema.sessions).where(eq(schema.sessions.userId, user.id)).orderBy(desc(schema.sessions.lastSeenAt)),
  ]);
  const until = sub ? accessUntil(sub) : null;

  let statusLine: string;
  if (!sub || sub.status === "pending" || (sub.status === "expired" && !sub.periodEnd)) statusLine = "Членство не оформлено";
  else if (sub.status === "active" && sub.autopayEnabled) statusLine = `Активно. Следующее списание ${formatRub(env.priceRub)} — ${formatDate(sub.periodEnd)}`;
  else if (sub.status === "active") statusLine = `Активно до ${formatDate(sub.periodEnd)}, без автопродления`;
  else if (sub.status === "cancelled") statusLine = `Автопродление отменено. Доступ открыт до ${formatDate(sub.periodEnd)}`;
  else if (sub.status === "past_due") statusLine = `Не удалось списать оплату. Доступ сохранится до ${formatDate(sub.graceUntil)}`;
  else statusLine = "Членство закончилось";

  return (
    <div className="max-w-2xl">
      <h1 className="text-title">Профиль</h1>

      <section className="mt-8" aria-labelledby="membership">
        <h2 id="membership" className="text-[1.35rem]">Членство</h2>
        <div className="panel mt-4 p-5">
          <p className={sub?.status === "past_due" ? "text-garnet" : ""}>{statusLine}</p>
          {method && sub?.autopayEnabled && <p className="mt-2 text-sm text-muted">Способ оплаты: {method.title}</p>}
          <MembershipActions
            canCancel={!!sub?.autopayEnabled && (sub.status === "active" || sub.status === "past_due")}
            hasCard={!!method}
            accessUntil={until ? formatDate(until) : null}
            isPastDue={sub?.status === "past_due"}
          />
          {(!isMember || !sub?.autopayEnabled) && (
            <Link href="/join" className="btn btn-primary mt-5">
              {isMember ? "Продлить на месяц" : sub?.periodEnd ? "Возобновить членство" : "Вступить в клуб"}
            </Link>
          )}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="me">
        <h2 id="me" className="text-[1.35rem]">О вас</h2>
        <p className="mt-3 text-muted">Email: <span className="text-ink">{user.email}</span></p>
        <NameForm initial={user.name ?? ""} />
      </section>

      <section className="mt-10" aria-labelledby="notify">
        <h2 id="notify" className="text-[1.35rem]">Уведомления о новых лекциях</h2>
        <NotificationSettings notifyEmail={user.notifyEmail} vapidKey={env.vapidPublicKey} />
      </section>

      {payments.length > 0 && (
        <section className="mt-10" aria-labelledby="payments">
          <h2 id="payments" className="text-[1.35rem]">История платежей</h2>
          <table className="mt-4 w-full text-left text-[0.95rem]">
            <thead className="text-sm text-muted">
              <tr className="border-b border-line">
                <th className="py-2 font-normal">Дата</th>
                <th className="py-2 font-normal">Сумма</th>
                <th className="py-2 font-normal">Статус</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-line">
                  <td className="py-3">{formatDate(p.createdAt)}</td>
                  <td className="py-3 tabular-nums">{formatRub(p.amountRub)}</td>
                  <td className="py-3">
                    {PAYMENT_STATUS[p.status] ?? p.status}
                    {p.refundedRub > 0 && p.status !== "refunded" ? `, возвращено ${formatRub(p.refundedRub)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-muted">Чеки приходят на email от платёжного сервиса.</p>
        </section>
      )}

      <section className="mt-10" aria-labelledby="devices">
        <h2 id="devices" className="text-[1.35rem]">Устройства</h2>
        <p className="mt-2 text-sm text-muted">Одновременно можно войти не больше чем на трёх устройствах.</p>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {devices.map((d) => (
            <li key={d.id} className="flex items-baseline justify-between gap-4 py-3">
              <span>{d.deviceLabel}</span>
              <span className="text-sm text-muted">{d.id === session?.sessionId ? "Это устройство" : `Был вход ${formatDate(d.lastSeenAt)}`}</span>
            </li>
          ))}
        </ul>
      </section>

      <AccountActions />
    </div>
  );
}
