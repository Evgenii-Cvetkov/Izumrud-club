import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getViewer } from "@/lib/member";
import { consentTexts } from "@/lib/consents";
import { env } from "@/lib/env";
import { formatDate, formatRub } from "@/lib/format";
import { Logo } from "@/components/Logo";
import { JoinForm } from "./JoinForm";

export const metadata: Metadata = { title: "Членство" };

export default async function JoinPage() {
  await requireUser("/join");
  const { sub, isMember, wasMember } = await getViewer();
  const autopayOn = isMember && sub?.autopayEnabled;

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <Logo />
      <div className="py-10">
        {autopayOn ? (
          <>
            <h1 className="text-title">Членство уже активно</h1>
            <p className="mt-3 text-muted">Следующее списание {formatDate(sub!.periodEnd)}. Управлять подпиской можно в профиле.</p>
            <div className="mt-6 flex gap-4">
              <Link href="/feed" className="btn btn-primary">Открыть клуб</Link>
              <Link href="/profile" className="btn btn-secondary">Профиль</Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-title">{wasMember || isMember ? "Возобновить членство" : "Членство в клубе"}</h1>
            {isMember && sub?.periodEnd && (
              <p className="mt-3 text-muted">
                Сейчас доступ открыт до {formatDate(sub.periodEnd)}. Новая оплата продлит его ещё на месяц от этой даты.
              </p>
            )}
            <div className="panel mt-6 p-5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-serif text-[1.2rem]">1 месяц</span>
                <span className="font-serif text-[1.6rem]">{formatRub(env.priceRub)}</span>
              </div>
              <p className="mt-2 text-sm text-muted">Встречи, все лекции в видео и аудио, статьи и фото встреч.</p>
            </div>
            <JoinForm
              priceLabel={formatRub(env.priceRub)}
              texts={{ pdn: consentTexts.pdn(), offer: consentTexts.offer(), autopay: consentTexts.autopay() }}
              demo={env.paymentsMock}
            />
          </>
        )}
      </div>
    </main>
  );
}
