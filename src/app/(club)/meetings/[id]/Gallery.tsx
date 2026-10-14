"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Photo {
  id: number;
  caption: string | null;
  url: string;
}

/** Сетка фото и полноэкранный просмотр со свайпом и стрелками. */
export function Gallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchX = useRef<number | null>(null);

  const show = (i: number) => {
    setOpen(i);
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();
  const step = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + photos.length) % photos.length)), [photos.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open === null) return;
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step]);

  if (!photos.length) return <p className="mt-8 text-muted">Фото ещё загружаются.</p>;
  const current = open !== null ? photos[open] : null;

  return (
    <>
      <ul className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button type="button" onClick={() => show(i)} className="block w-full" aria-label={p.caption ?? `Фото ${i + 1} из ${photos.length}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.caption ?? ""} loading="lazy" decoding="async" className="aspect-square w-full rounded-sm object-cover" />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(null)}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black"
        aria-label={title}
      >
        {current && (
          <div
            className="flex h-full flex-col"
            onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touchX.current === null) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
              touchX.current = null;
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="tabular-nums text-white/70">
                {open! + 1} / {photos.length}
              </span>
              <button type="button" onClick={close} className="min-h-11 px-3 text-base" aria-label="Закрыть">
                Закрыть
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.url} alt={current.caption ?? ""} className="max-h-full max-w-full object-contain" />
              <button type="button" onClick={() => step(-1)} className="absolute left-0 top-0 hidden h-full w-1/5 sm:block" aria-label="Предыдущее фото" />
              <button type="button" onClick={() => step(1)} className="absolute right-0 top-0 hidden h-full w-1/5 sm:block" aria-label="Следующее фото" />
            </div>
            {current.caption && <p className="px-4 py-4 text-center text-white/80">{current.caption}</p>}
          </div>
        )}
      </dialog>
    </>
  );
}
