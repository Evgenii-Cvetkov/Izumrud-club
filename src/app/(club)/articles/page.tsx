import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listArticles } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { Cover } from "@/components/Cover";

export const metadata: Metadata = { title: "Статьи" };

export default async function ArticlesPage() {
  await requireUser("/articles");
  const articles = await listArticles();

  return (
    <>
      <h1 className="text-title">Статьи</h1>
      {articles.length === 0 ? (
        <p className="mt-6 text-muted">Статей пока нет. Они появляются после встреч — конспекты и списки литературы.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {articles.map((a) => (
            <li key={a.id}>
              <Link href={`/articles/${a.slug}`} className="group grid gap-4 py-6 text-ink no-underline sm:grid-cols-[1fr_12rem] sm:items-center">
                <div>
                  <h2 className="text-[1.35rem] leading-snug group-hover:text-emerald-deep">{a.title}</h2>
                  {a.excerpt && <p className="mt-2 max-w-2xl text-muted">{a.excerpt}</p>}
                  <p className="mt-2 text-sm text-muted">
                    {[a.topic, a.readingMinutes ? `${a.readingMinutes} мин чтения` : null, formatDate(a.publishedAt)].filter(Boolean).join(", ")}
                  </p>
                </div>
                <Cover url={a.coverUrl} seed={`article-${a.id}`} alt="" size="sm" className="order-first sm:order-none" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
