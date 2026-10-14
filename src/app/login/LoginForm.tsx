"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const { ok, data } = await post("/api/auth/code", { email });
    setBusy(false);
    if (!ok) return setError(data.message ?? "Не удалось отправить код");
    setDevCode(data.devCode ?? null);
    setStep("code");
    setResendIn(60);
    setTimeout(() => codeRef.current?.focus(), 0);
  };

  const verify = async (value = code) => {
    setBusy(true);
    setError(null);
    const { ok, data } = await post("/api/auth/verify", { email, code: value });
    if (!ok) {
      setBusy(false);
      return setError(data.message ?? "Код не подходит");
    }
    router.replace(next);
    router.refresh();
  };

  if (step === "email") {
    return (
      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void sendCode();
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Email</span>
          <input
            className="field"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "login-error" : undefined}
          />
        </label>
        {error && (
          <p id="login-error" role="alert" className="text-sm text-garnet">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || !email}>
          {busy ? "Отправляем…" : "Получить код"}
        </button>
      </form>
    );
  }

  return (
    <form
      className="mt-8 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void verify();
      }}
    >
      <p>
        Код отправлен на <span className="font-medium">{email}</span>.{" "}
        <button type="button" className="btn-quiet" onClick={() => { setStep("email"); setCode(""); setError(null); }}>
          Изменить
        </button>
      </p>
      {devCode && (
        <p className="rounded border border-dashed border-line bg-paper px-3 py-2 text-sm text-muted">
          Почта не настроена, поэтому код показан здесь: <span className="font-medium tabular-nums text-ink">{devCode}</span>
        </p>
      )}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Код из письма</span>
        <input
          ref={codeRef}
          className="field text-center text-2xl tracking-[0.4em] tabular-nums"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(v);
            if (v.length === 6) void verify(v);
          }}
          aria-invalid={!!error}
          aria-describedby={error ? "code-error" : undefined}
        />
      </label>
      {error && (
        <p id="code-error" role="alert" className="text-sm text-garnet">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={busy || code.length !== 6}>
        {busy ? "Проверяем…" : "Войти"}
      </button>
      <button type="button" className="btn-quiet" disabled={resendIn > 0 || busy} onClick={() => void sendCode()}>
        {resendIn > 0 ? `Отправить код повторно через ${resendIn} с` : "Отправить код повторно"}
      </button>
    </form>
  );
}
