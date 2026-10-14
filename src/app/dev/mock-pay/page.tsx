import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatRub } from "@/lib/format";
import { MockPayButtons } from "./MockPayButtons";

export const metadata = { title: "Демо-оплата", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Заглушка страницы ЮKassa для разработки. Без ключей ЮKassa — единственный способ «оплатить». */
export default async function MockPayPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  if (!env.paymentsMock || !env.mockPaymentsAllowed) notFound();
  const user = await requireUser("/join");
  const { payment: ykId } = await searchParams;
  const payment = ykId ? await db.query.payments.findFirst({ where: eq(schema.payments.yookassaId, ykId) }) : null;
  if (!payment || payment.userId !== user.id) notFound();

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <div className="panel p-6">
        <p className="text-sm text-muted">Демо-страница вместо ЮKassa — деньги не списываются</p>
        <h1 className="mt-3 text-title">{formatRub(payment.amountRub)}</h1>
        <p className="mt-1 text-muted">Членство в клубе «Изумруд», 1 месяц</p>
        {payment.autopayRequested && <p className="mt-3 text-sm text-muted">Карта будет сохранена для автопродления.</p>}
        <MockPayButtons payment={ykId!} />
      </div>
    </main>
  );
}
