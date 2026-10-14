"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type State = "checking" | "succeeded" | "canceled" | "slow";

/** После возврата из ЮKassa ждём вебхук: опрашиваем статус платежа до 2 минут. */
export function PaymentStatus({ paymentId }: { paymentId: string | null }) {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let stop = false;
    const started = Date.now();
    const poll = async () => {
      if (stop) return;
      try {
        const res = await fetch("/api/payments", { cache: "no-store" });
        const list: { id: string; status: string }[] = res.ok ? await res.json() : [];
        const p = paymentId ? list.find((x) => x.id === paymentId) : list[0];
        if (p?.status === "succeeded") return setState("succeeded");
        if (p?.status === "canceled") return setState("canceled");
      } catch {}
      if (Date.now() - started > 120_000) return setState("slow");
      setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      stop = true;
    };
  }, [paymentId]);

  if (state === "succeeded") {
    return (
      <div role="status">
        <h1 className="text-title">Добро пожаловать в клуб</h1>
        <p className="mt-3 text-muted">Оплата прошла, всё открыто. Чек придёт на email.</p>
        <Link href="/feed" className="btn btn-primary mt-8">Перейти к лекциям</Link>
      </div>
    );
  }
  if (state === "canceled") {
    return (
      <div role="status">
        <h1 className="text-title">Оплата не прошла</h1>
        <p className="mt-3 text-muted">Деньги не списаны. Попробуйте ещё раз или выберите другой способ оплаты.</p>
        <Link href="/join" className="btn btn-primary mt-8">Попробовать снова</Link>
      </div>
    );
  }
  if (state === "slow") {
    return (
      <div role="status">
        <h1 className="text-title">Платёж ещё обрабатывается</h1>
        <p className="mt-3 text-muted">
          Обычно это занимает секунды. Если деньги списаны, доступ откроется автоматически — мы пришлём письмо.
        </p>
        <Link href="/profile" className="btn btn-secondary mt-8">Открыть профиль</Link>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite">
      <h1 className="text-title">Проверяем оплату</h1>
      <p className="mt-3 text-muted">Это займёт несколько секунд, не закрывайте страницу.</p>
      <div className="mt-8 h-1 w-48 overflow-hidden rounded-full bg-tint">
        <div className="h-full w-1/3 animate-[slide_1.2s_ease-in-out_infinite] bg-emerald" />
      </div>
      <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}
