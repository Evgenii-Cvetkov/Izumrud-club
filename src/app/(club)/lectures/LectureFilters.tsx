"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const FORMATS = [
  { value: "", label: "Все форматы" },
  { value: "video", label: "Есть видео" },
  { value: "audio", label: "Есть аудио" },
];

export function LectureFilters({ topics }: { topics: { slug: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, startTransition] = useTransition();

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  // Поиск — с паузой, чтобы не дёргать сервер на каждую букву.
  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => update("q", q.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const topic = params.get("topic") ?? "";
  const format = params.get("format") ?? "";

  return (
    <div className="mt-5 space-y-4" aria-busy={pending}>
      <input
        type="search"
        className="field max-w-md"
        placeholder="Название, ведущий, тема"
        aria-label="Поиск по лекциям"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Тема">
        <Chip active={!topic} onClick={() => update("topic", "")}>Все темы</Chip>
        {topics.map((t) => (
          <Chip key={t.slug} active={topic === t.slug} onClick={() => update("topic", t.slug)}>
            {t.name}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Формат">
        {FORMATS.map((f) => (
          <Chip key={f.value} active={format === f.value} onClick={() => update("format", f.value)}>
            {f.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-10 rounded-full border px-4 text-[0.92rem] ${active ? "border-emerald bg-emerald text-white" : "border-line bg-paper text-ink hover:border-emerald"}`}
    >
      {children}
    </button>
  );
}
