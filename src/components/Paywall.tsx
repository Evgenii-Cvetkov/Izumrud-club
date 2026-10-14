import Link from "next/link";
import { GemMark } from "./Gem";
import { formatRub } from "@/lib/format";
import { env } from "@/lib/env";

/** Показывается вместо закрытого контента тем, у кого нет активного членства. */
export function Paywall({ wasMember, what = "этот материал" }: { wasMember: boolean; what?: string }) {
  return (
    <section className="panel mx-auto mt-6 max-w-xl p-6 sm:p-8">
      <GemMark size={40} />
      <h2 className="mt-5 text-title">{wasMember ? "Членство закончилось" : "Только для участников клуба"}</h2>
      <p className="mt-3 text-muted">
        {wasMember
          ? `Чтобы открыть ${what} и остальные лекции, возобновите членство. Ваш прогресс просмотра сохранён.`
          : `Членство открывает ${what}, все лекции в видео и аудио, статьи и фото встреч.`}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Link href="/join" className="btn btn-primary">
          {wasMember ? "Возобновить членство" : "Вступить в клуб"}
        </Link>
        <span className="text-sm text-muted">{formatRub(env.priceRub)} в месяц</span>
      </div>
    </section>
  );
}
