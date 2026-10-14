import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getViewer } from "@/lib/member";
import { getArticle } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { Paywall } from "@/components/Paywall";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const a = await getArticle((await params).slug);
  return { title: a?.title ?? "Статья" };
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  await requireUser(`/articles/${slug}`);
  const article = await getArticle(slug);
  if (!article) notFound();
  const { isMember, wasMember } = await getViewer();
  const meta = [article.topic, article.readingMinutes ? `${article.readingMinutes} мин чтения` : null, formatDate(article.publishedAt)].filter(Boolean).join(", ");

  return (
    <article className="mx-auto max-w-[38rem]">
      <Link href="/articles" className="btn-quiet">Все статьи</Link>
      <h1 className="mt-3 text-[2rem] leading-tight sm:text-[2.4rem]">{article.title}</h1>
      <p className="mt-2 text-muted">{meta}</p>
      {article.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={article.coverUrl} alt="" className="facet facet-lg mt-6 aspect-[16/10] w-full object-cover" />
      )}
      {isMember ? (
        <>
          {/* HTML пишут только администраторы в Directus. */}
          <div className="reading mt-8" dangerouslySetInnerHTML={{ __html: article.body }} />
          {article.lecture && (
            <p className="mt-10 border-t border-line pt-6">
              Лекция к статье:{" "}
              <Link href={`/lectures/${article.lecture.slug}`} className="text-emerald underline underline-offset-2">
                {article.lecture.title}
              </Link>
            </p>
          )}
        </>
      ) : (
        <>
          {article.excerpt && <p className="reading mt-8">{article.excerpt}</p>}
          <Paywall wasMember={wasMember} what="эту статью" />
        </>
      )}
    </article>
  );
}
