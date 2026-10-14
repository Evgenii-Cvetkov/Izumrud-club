import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { getViewer } from "@/lib/member";
import { getProgressMap, listLectures, listTopics } from "@/lib/content";
import { LectureCard } from "@/components/LectureCard";
import { LectureFilters } from "./LectureFilters";

export const metadata: Metadata = { title: "Лекции" };

type SP = { topic?: string; format?: string; q?: string; page?: string };

export default async function LecturesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("/lectures");
  const sp = await searchParams;
  const format = sp.format === "video" || sp.format === "audio" ? sp.format : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ isMember }, topics, result] = await Promise.all([
    getViewer(),
    listTopics(),
    listLectures({ topic: sp.topic, format, q: sp.q, page }),
  ]);
  const progress = isMember ? await getProgressMap(user.id, result.items.map((l) => l.id)) : new Map();
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (sp.topic) u.set("topic", sp.topic);
    if (format) u.set("format", format);
    if (sp.q) u.set("q", sp.q);
    u.set("page", String(p));
    return `?${u}`;
  };

  return (
    <>
      <h1 className="text-title">Лекции</h1>
      <Suspense>
        <LectureFilters topics={topics.map((t) => ({ slug: t.slug, name: t.name }))} />
      </Suspense>

      {result.items.length ? (
        <div className="mt-8 grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {result.items.map((l) => (
            <LectureCard key={l.id} l={l} progress={progress.get(l.id)} />
          ))}
        </div>
      ) : (
        <div className="mt-10">
          <p className="text-muted">По этим условиям лекций нет.</p>
          <Link href="/lectures" className="btn-quiet">Сбросить фильтры</Link>
        </div>
      )}

      {(page > 1 || result.hasMore) && (
        <nav className="mt-12 flex justify-between" aria-label="Страницы">
          {page > 1 ? <Link href={qs(page - 1)} className="btn btn-secondary">Назад</Link> : <span />}
          {result.hasMore && <Link href={qs(page + 1)} className="btn btn-secondary">Ещё лекции</Link>}
        </nav>
      )}
    </>
  );
}
