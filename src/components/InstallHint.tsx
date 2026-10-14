"use client";

import { useEffect, useState } from "react";

const KEY = "izumrud-install-hint-hidden";

/**
 * Подсказка для iPhone: push и фоновое аудио лучше работают, если сайт добавлен на экран «Домой».
 * Показывается только в Safari на iOS вне установленного приложения.
 */
export function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const ios = /iPhone|iPad/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    let hidden = false;
    try {
      hidden = localStorage.getItem(KEY) === "1";
    } catch {}
    setShow(ios && !standalone && !hidden);
  }, []);

  if (!show) return null;
  return (
    <aside className="panel mt-4 flex items-start justify-between gap-4 p-4 text-[0.95rem]">
      <p>
        Добавьте клуб на экран «Домой»: нажмите «Поделиться» в Safari, затем «На экран „Домой“». Так придут уведомления о новых
        лекциях.
      </p>
      <button
        type="button"
        className="min-h-11 shrink-0 px-2 text-muted"
        aria-label="Скрыть подсказку"
        onClick={() => {
          try {
            localStorage.setItem(KEY, "1");
          } catch {}
          setShow(false);
        }}
      >
        ✕
      </button>
    </aside>
  );
}
