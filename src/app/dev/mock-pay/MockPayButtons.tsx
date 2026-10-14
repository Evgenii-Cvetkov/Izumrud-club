"use client";

import { useState } from "react";

export function MockPayButtons({ payment }: { payment: string }) {
  const [busy, setBusy] = useState(false);
  const act = async (outcome: "succeeded" | "canceled") => {
    setBusy(true);
    const res = await fetch("/api/dev/mock-pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment, outcome }),
    });
    const data = await res.json();
    window.location.assign(data.returnUrl ?? "/join");
  };
  return (
    <div className="mt-6 flex flex-col gap-3">
      <button className="btn btn-primary" disabled={busy} onClick={() => act("succeeded")}>
        Оплатить картой •• 4242
      </button>
      <button className="btn btn-secondary" disabled={busy} onClick={() => act("canceled")}>
        Отказаться от оплаты
      </button>
    </div>
  );
}
