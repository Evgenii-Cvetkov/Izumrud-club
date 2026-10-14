import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getViewer } from "@/lib/member";
import { articlesForLecture, getLecture, getProgressMap } from "@/lib/content";
import { formatDate, formatDuration } from "@/lib/format";
import { Cover } from "@/components/Cover";
import { Paywall } from "@/components/Paywall";
import { LecturePlayer } from "./LecturePlayer";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const l = await getLecture((await params).slug);
  return { title: l?.title ?? "Лекция" };
}

export default async function LecturePage({ params }: Params) {
  const { slug } = await params;
  const user = await requireUser(`/lectures/${slug}`);
  const lecture = await getLecture(slug);
  if (!lecture) notFound();
  const { isMember, wasMember } = await getViewer();
  const meta = [lecture.speaker, formatDuration(lecture.durationSec), formatDate(lecture.publishedAt)].filter(Boolean).join(", ");

  if (!isMember) {
    return (
      <article>
        <Link href="/lectures" className="btn-quiet">Все лекции</Link>
        <h1 className="mt-3 max-w-3xl text-[2rem] leading-tight sm:text-[2.4rem]">{lecture.title}</h1>
        <p className="mt-2 text-muted">{meta}</p>
        <Cover url={lecture.coverUrl} seed={lecture.topicSlug ?? lecture.slug} alt="" size="lg" className="mt-6 max-w-3xl" />
        <Paywall wasMember={wasMember} what="эту лекцию" />
      </article>
    );
  }

  const [articles, progress] = await Promise.all([articlesForLecture(lecture.id), getProgressMap(user.id, [lecture.id])]);
  const p = progress.get(lecture.id);

  return (
    <article>
      <Link href="/lectures" className="btn-quiet">Все лекции</Link>
      <h1 className="mt-3 max-w-3xl text-[2rem] leading-tight sm:text-[2.4rem]">{lecture.title}</h1>
      <p className="mt-2 text-muted">{meta}</p>

      <LecturePlayer
        lecture={{
          id: lecture.id,
          slug: lecture.slug,
          title: lecture.title,
          speaker: lecture.speaker,
          coverUrl: lecture.coverUrl,
          seed: lecture.topicSlug ?? lecture.slug,
          hasVideo: lecture.hasVideo,
          hasAudio: lecture.hasAudio,
          durationSec: lecture.durationSec,
        }}
        startAt={p && !p.completed ? p.positionSec : 0}
      />

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_18rem]">
        {lecture.description && (
          <div className="reading whitespace-pre-line">{lecture.description}</div>
        )}
        {(articles.length > 0 || lecture.topic) && (
          <aside className="space-y-6">
            {lecture.topic && (
              <div>
                <h2 className="text-sm font-medium text-muted">Тема</h2>
                <Link href={`/lectures?topic=${lecture.topicSlug}`} className="mt-1 inline-block text-emerald underline underline-offset-2">
                  {lecture.topic}
                </Link>
              </div>
            )}
            {articles.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted">Читать к лекции</h2>
                <ul className="mt-2 space-y-3">
                  {articles.map((a) => (
                    <li key={a.slug}>
                      <Link href={`/articles/${a.slug}`} className="font-serif text-[1.05rem] text-ink underline-offset-4 hover:underline">
                        {a.title}
                      </Link>
                      {a.readingMinutes ? <span className="block text-sm text-muted">{a.readingMinutes} мин чтения</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>
    </article>
  );
}
