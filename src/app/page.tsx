import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { Footer } from "@/components/Footer";
import { Cover } from "@/components/Cover";
import { getViewer } from "@/lib/member";
import { listLectures, listTopics } from "@/lib/content";
import { formatDuration, formatRub } from "@/lib/format";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const INCLUDED = [
  { title: "Встречи клуба", text: "Живые встречи в Петербурге: доклад, разбор, спор по существу." },
  { title: "Лекции в видео и аудио", text: "Записи всех встреч. Слушайте в дороге — аудио играет при заблокированном экране." },
  { title: "Статьи", text: "Конспекты, списки литературы и тексты ведущих к каждой теме." },
  { title: "Фото встреч", text: "Альбомы со всех встреч клуба." },
];

const FAQ = [
  {
    q: "Как отменить подписку?",
    a: "В профиле одной кнопкой «Отменить автопродление». Доступ сохранится до конца оплаченного месяца, карта больше не используется.",
  },
  {
    q: "Можно ли оплатить без автопродления?",
    a: "Да. При оформлении не ставьте галочку автосписания — оплатите один месяц, а продлить можно вручную.",
  },
  { q: "Как смотреть с телефона?", a: "Откройте сайт в браузере и добавьте его на экран «Домой» — он будет работать как приложение." },
  { q: "Как оплатить?", a: "Банковской картой или через СБП. Чек приходит на email." },
];

export default async function Home() {
  const [{ user, isMember }, latest, topics] = await Promise.all([getViewer(), listLectures(), listTopics()]);
  const lead = latest.items[0];
  const more = latest.items.slice(1, 4);

  return (
    <>
      <PublicHeader signedIn={!!user} isMember={isMember} />
      <main>
        <section className="mx-auto grid max-w-5xl gap-10 px-4 pb-16 pt-10 md:grid-cols-[1.05fr_1fr] md:items-center md:pt-16">
          <div>
            <h1 className="text-[2.4rem] leading-[1.08] sm:text-display">Клуб, где учатся думать яснее</h1>
            <p className="mt-5 max-w-[34rem] text-[1.125rem] text-muted">
              «Изумруд» — клуб развития мышления в Петербурге. Мы встречаемся, разбираем идеи и аргументы, а записи встреч
              и статьи собираем здесь, чтобы к ним можно было вернуться.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href={isMember ? "/feed" : "/join"} className="btn btn-primary">
                {isMember ? "Открыть клуб" : "Вступить в клуб"}
              </Link>
              <span className="text-muted">{formatRub(env.priceRub)} в месяц, отмена в один клик</span>
            </div>
          </div>

          {lead && (
            <figure>
              <Cover url={lead.coverUrl} seed={lead.topicSlug ?? lead.slug} alt="" size="lg" />
              <figcaption className="mt-4">
                <span className="text-sm text-muted">Последняя лекция</span>
                <p className="mt-1 font-serif text-[1.35rem] leading-snug">{lead.title}</p>
                <p className="mt-1 text-sm text-muted">{[lead.speaker, formatDuration(lead.durationSec)].filter(Boolean).join(", ")}</p>
              </figcaption>
            </figure>
          )}
        </section>

        <section className="border-y border-line bg-paper">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="text-title">Что входит в членство</h2>
            <dl className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2">
              {INCLUDED.map((it) => (
                <div key={it.title} className="border-t border-line pt-4">
                  <dt className="font-serif text-[1.2rem]">{it.title}</dt>
                  <dd className="mt-1.5 text-muted">{it.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {(more.length > 0 || topics.length > 0) && (
          <section className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="text-title">О чём лекции</h2>
            {topics.length > 0 && (
              <p className="mt-4 max-w-2xl text-[1.125rem] text-muted">{topics.map((t) => t.name).join(", ")}.</p>
            )}
            {more.length > 0 && (
              <ul className="mt-8 divide-y divide-line border-y border-line">
                {more.map((l) => (
                  <li key={l.id} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                    <span className="font-serif text-[1.15rem]">{l.title}</span>
                    <span className="shrink-0 text-sm text-muted">{[l.speaker, formatDuration(l.durationSec)].filter(Boolean).join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="mx-auto max-w-5xl px-4 pb-14">
          <h2 className="text-title">Как вступить</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              ["Войдите по email", "Пришлём код из 6 цифр — пароль не нужен."],
              ["Оплатите членство", `${formatRub(env.priceRub)} картой или через СБП.`],
              ["Смотрите и слушайте", "Доступ открывается сразу после оплаты."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="facet facet-sm grid h-10 w-10 shrink-0 place-items-center bg-tint font-serif text-lg text-emerald-deep">{i + 1}</span>
                <div>
                  <p className="font-medium">{t}</p>
                  <p className="mt-1 text-muted">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-line bg-paper">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="text-title">Вопросы</h2>
            <div className="mt-6 max-w-3xl divide-y divide-line border-y border-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {f.q}
                    <span className="text-emerald transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="mt-2 text-muted">{f.a}</p>
                </details>
              ))}
            </div>
            <Link href={isMember ? "/feed" : "/join"} className="btn btn-primary mt-10">
              {isMember ? "Открыть клуб" : "Вступить в клуб"}
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
