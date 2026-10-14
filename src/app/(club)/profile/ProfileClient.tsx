"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Не получилось. Попробуйте ещё раз");
  return data;
}

/** Отмена автопродления и удаление карты — по одному подтверждению (376-ФЗ). */
export function MembershipActions({ canCancel, hasCard, accessUntil, isPastDue }: { canCancel: boolean; hasCard: boolean; accessUntil: string | null; isPastDue: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<null | "cancel" | "card">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canCancel && !hasCard) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (confirm === "cancel") await call("/api/subscription/cancel", "POST");
      else await call("/api/subscription/payment-method", "DELETE");
      setConfirm(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (confirm) {
    return (
      <div className="mt-5 border-t border-line pt-4" role="alertdialog" aria-labelledby="confirm-title">
        <p id="confirm-title" className="font-medium">
          {confirm === "cancel" ? "Отменить автопродление?" : "Удалить карту?"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {isPastDue
            ? "Доступ закроется сразу, потому что оплата за текущий месяц не прошла."
            : `Больше ничего не спишем. Доступ сохранится до ${accessUntil}.`}
          {confirm === "card" ? " Автопродление тоже выключится." : ""}
        </p>
        {error && <p role="alert" className="mt-2 text-sm text-garnet">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="btn btn-secondary btn-danger" disabled={busy} onClick={run}>
            {busy ? "Отменяем…" : confirm === "cancel" ? "Отменить автопродление" : "Удалить карту"}
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirm(null)}>
            Оставить как есть
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4">
      {canCancel && (
        <button type="button" className="btn-quiet btn-danger" onClick={() => setConfirm("cancel")}>
          Отменить автопродление
        </button>
      )}
      {hasCard && (
        <button type="button" className="btn-quiet btn-danger" onClick={() => setConfirm("card")}>
          Удалить карту
        </button>
      )}
    </div>
  );
}

export function NameForm({ initial }: { initial: string }) {
  const [name, setName] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  return (
    <form
      className="mt-4 flex max-w-md items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("saving");
        try {
          await call("/api/me/settings", "PATCH", { name });
          setState("saved");
        } catch {
          setState("error");
        }
      }}
    >
      <label className="flex-1">
        <span className="mb-1.5 block text-sm font-medium">Как к вам обращаться</span>
        <input className="field" value={name} maxLength={80} autoComplete="given-name" onChange={(e) => { setName(e.target.value); setState("idle"); }} />
      </label>
      <button type="submit" className="btn btn-secondary" disabled={state === "saving" || name === initial}>
        {state === "saved" ? "Сохранено" : "Сохранить"}
      </button>
      {state === "error" && <span role="alert" className="text-sm text-garnet">Не сохранилось</span>}
    </form>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function NotificationSettings({ notifyEmail, vapidKey }: { notifyEmail: boolean; vapidKey: string }) {
  const [email, setEmail] = useState(notifyEmail);
  const [push, setPush] = useState<"unsupported" | "off" | "on" | "denied" | "busy">("off");
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return setPush("unsupported");
    if (Notification.permission === "denied") return setPush("denied");
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setPush(sub ? "on" : "off");
    });
  }, [vapidKey]);

  const enablePush = async () => {
    setPush("busy");
    setHint(null);
    try {
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setPush(perm === "denied" ? "denied" : "off");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
      await call("/api/push/subscribe", "POST", sub.toJSON());
      setPush("on");
    } catch {
      setPush("off");
      setHint("Не удалось включить уведомления. На iPhone сначала добавьте сайт на экран «Домой».");
    }
  };

  const disablePush = async () => {
    setPush("busy");
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await call("/api/push/subscribe", "DELETE", { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
    setPush("off");
  };

  return (
    <div className="mt-4 space-y-4">
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          className="h-6 w-6 accent-[var(--color-emerald)]"
          checked={email}
          onChange={async (e) => {
            setEmail(e.target.checked);
            await call("/api/me/settings", "PATCH", { notifyEmail: e.target.checked }).catch(() => setEmail(!e.target.checked));
          }}
        />
        Письмом на email
      </label>
      {push === "unsupported" ? (
        <p className="text-sm text-muted">Push-уведомления в этом браузере недоступны.</p>
      ) : push === "denied" ? (
        <p className="text-sm text-muted">Уведомления запрещены в настройках браузера. Разрешите их для этого сайта, чтобы включить.</p>
      ) : (
        <div className="flex items-center gap-4">
          <span>На это устройство: {push === "on" ? "включены" : "выключены"}</span>
          <button type="button" className="btn-quiet" disabled={push === "busy"} onClick={push === "on" ? disablePush : enablePush}>
            {push === "on" ? "Выключить" : "Включить"}
          </button>
        </div>
      )}
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function AccountActions() {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <section className="mt-12 border-t border-line pt-6" aria-label="Аккаунт">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <button
          type="button"
          className="btn-quiet"
          onClick={async () => {
            await call("/api/auth/logout", "POST");
            router.replace("/");
            router.refresh();
          }}
        >
          Выйти
        </button>
        {!confirmDelete && (
          <button type="button" className="btn-quiet btn-danger" onClick={() => setConfirmDelete(true)}>
            Удалить аккаунт
          </button>
        )}
      </div>
      {confirmDelete && (
        <div className="mt-4" role="alertdialog" aria-labelledby="delete-title">
          <p id="delete-title" className="font-medium">Удалить аккаунт?</p>
          <p className="mt-1 text-sm text-muted">
            Автопродление выключится, доступ закроется сразу, прогресс просмотра удалится. История платежей хранится по закону о
            бухучёте, но без вашего email.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn btn-secondary btn-danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await call("/api/me", "DELETE");
                router.replace("/");
                router.refresh();
              }}
            >
              {busy ? "Удаляем…" : "Удалить аккаунт"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
              Оставить
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
