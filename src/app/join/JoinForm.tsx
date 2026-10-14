"use client";

import Link from "next/link";
import { useState } from "react";

interface Props {
  priceLabel: string;
  texts: { pdn: string; offer: string; autopay: string };
  demo: boolean;
}

/** Три отдельных согласия, ни одно не отмечено заранее (376-ФЗ, 152-ФЗ). */
export function JoinForm({ priceLabel, texts, demo }: Props) {
  const [pdn, setPdn] = useState(false);
  const [offer, setOffer] = useState(false);
  const [autopay, setAutopay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/subscription/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdn, offer, autopay }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setError(data.message ?? "Не удалось перейти к оплате");
    }
    window.location.assign(data.confirmationUrl);
  };

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Check checked={pdn} onChange={setPdn} required>
        {texts.pdn.replace("политикой обработки персональных данных", "")}
        <Link href="/legal/privacy" target="_blank" className="text-emerald underline underline-offset-2">
          политикой обработки персональных данных
        </Link>
      </Check>
      <Check checked={offer} onChange={setOffer} required>
        Принимаю условия{" "}
        <Link href="/legal/offer" target="_blank" className="text-emerald underline underline-offset-2">оферты</Link> и{" "}
        <Link href="/legal/rules" target="_blank" className="text-emerald underline underline-offset-2">правила клуба</Link>
      </Check>
      <Check checked={autopay} onChange={setAutopay}>
        {texts.autopay}
      </Check>
      {!autopay && <p className="pl-9 text-sm text-muted">Без этой галочки оплатите один месяц, а продлите вручную, когда захотите.</p>}

      {error && (
        <p role="alert" className="text-sm text-garnet">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={!pdn || !offer || busy}>
        {busy ? "Переходим к оплате…" : `Оплатить ${priceLabel}`}
      </button>
      <p className="text-sm text-muted">
        {demo
          ? "Демо-режим: ЮKassa не подключена, деньги не списываются."
          : "Оплата на защищённой странице ЮKassa картой или через СБП. Данные карты сайт не получает."}
      </p>
    </form>
  );
}

function Check({ checked, onChange, required, children }: { checked: boolean; onChange: (v: boolean) => void; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer gap-3">
      <input
        type="checkbox"
        checked={checked}
        required={required}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--color-emerald)]"
      />
      <span className="text-[0.95rem] leading-snug">{children}</span>
    </label>
  );
}
