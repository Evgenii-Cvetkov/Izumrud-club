import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getViewer } from "@/lib/member";
import { continueWatching, getProgressMap, listAlbums, listArticles, listLectures } from "@/lib/content";
import { formatDate, formatDateShort } from "@/lib/format";
import { LectureCard } from "@/components/LectureCard";
import { Cover } from "@/components/Cover";
import { Paywall } from "@/components/Paywall";
import { InstallHint } from "@/components/InstallHint";

export const metadata: Metadata = { title: "Главная" };

export default async function FeedPage() {
  const user = await requireUser("/feed");
  const { isMember, wasMember, sub } = await getViewer();
  const greeting = user.name ? `Здравствуйте, ${user.name}` : "Здравствуйте";

  if (!isMember) {
    return (
      <>
        <h1 className="text-title">{greeting}</h1>
        <Paywall wasMember={wasMember} what="лекции, статьи и фото встреч" />
      </>
    );
  }

  const [lectures, articles, albums, resume] = await Promise.all([listLectures(), listArticles(3), listAlbums(3), continueWatching(user.id)]);
  const latest = lectures.items.slice(0, 6);
  const progress = await getProgressMap(user.id, latest.map((l) => l.id));

  return (
    <>
      <h1 className="text-title">{greeting}</h1>
      {sub?.status === "past_due" && (
        <p role="alert" className="panel mt-4 border-garnet/40 p-4 text-[0.95rem]">
          Не удалось списать оплату за следующий месяц. Доступ сохранится до {formatDate(sub.graceUntil)}.{" "}
          <Link href="/join" className="text-emerald underline underline-offset-2">Оплатить другой картой</Link>
        </p>
      )}
      <InstallHint />

      {resume.length > 0 && (
        <section className="mt-10" aria-labelledby="resume">
          <h2 id="resume" className="text-[1.35rem]">Продолжить</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {resume.map((l) => (
              <li key={l.id}>
                <Link href={`/lectures/${l.slug}`} className="panel flex items-center gap-4 p-3 text-ink no-underline hover:border-emerald">
                  <Cover url={l.coverUrl} seed={l.topicSlug ?? l.slug} alt="" size="sm" className="w-28 shrink-0" />
                  <span className="min-w-0">
                    <span className="line-clamp-2 font-serif text-[1.05rem] leading-snug">{l.title}</span>
                    {l.durationSec ? (
                      <span className="mt-1 block text-sm text-muted">
                        Осталось {Math.max(1, Math.round((l.durationSec - l.positionSec) / 60))} мин
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12" aria-labelledby="new-lectures">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="new-lectures" className="text-[1.35rem]">Новые лекции</h2>
          <Link href="/lectures" className="btn-quiet">Все лекции</Link>
        </div>
        {latest.length ? (
          <div className="mt-5 grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {latest.map((l) => (
              <LectureCard key={l.id} l={l} progress={progress.get(l.id)} />
            ))}
          </div>
        ) : (
          <p className="mt-4 text-muted">Первая лекция появится после ближайшей встречи.</p>
        )}
      </section>

      <div className="mt-14 grid gap-12 lg:grid-cols-2">
        <section aria-labelledby="new-articles">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="new-articles" className="text-[1.35rem]">Статьи</h2>
            <Link href="/articles" className="btn-quiet">Все статьи</Link>
          </div>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {articles.map((a) => (
              <li key={a.id}>
                <Link href={`/articles/${a.slug}`} className="block py-4 text-ink no-underline hover:text-emerald-deep">
                  <span className="font-serif text-[1.1rem] leading-snug">{a.title}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {[a.readingMinutes ? `${a.readingMinutes} мин чтения` : null, formatDateShort(a.publishedAt)].filter(Boolean).join(", ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="meetings">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="meetings" className="text-[1.35rem]">Фото встреч</h2>
            <Link href="/meetings" className="btn-quiet">Все встречи</Link>
          </div>
          <ul className="mt-4 grid grid-cols-3 gap-3">
            {albums.map((a) => (
              <li key={a.id}>
                <Link href={`/meetings/${a.id}`} className="block text-ink no-underline">
                  <Cover url={a.coverUrl} seed={`album-${a.id}`} alt="" size="sm" />
                  <span className="mt-2 line-clamp-2 block text-sm">{a.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
