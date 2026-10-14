import Link from "next/link";
import { Cover } from "./Cover";
import { formatDateShort, formatDuration } from "@/lib/format";
import type { LectureCard as Card } from "@/lib/content";

export function LectureCard({ l, progress }: { l: Card; progress?: { positionSec: number; completed: boolean } }) {
  const pct = progress && l.durationSec ? Math.min(100, Math.round((progress.positionSec / l.durationSec) * 100)) : 0;
  const formats = [l.hasVideo && "видео", l.hasAudio && "аудио"].filter(Boolean).join(" и ");
  return (
    <article className="group">
      <Link href={`/lectures/${l.slug}`} className="block text-ink no-underline">
        <div className="relative">
          <Cover url={l.coverUrl} seed={l.topicSlug ?? l.slug} alt="" />
          {pct > 0 && (
            <div className="absolute inset-x-3 bottom-3 h-1 rounded-full bg-white/40" aria-hidden>
              <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <h3 className="mt-3 text-[1.2rem] leading-snug group-hover:text-emerald-deep">{l.title}</h3>
      </Link>
      <p className="mt-1 text-sm text-muted">
        {[l.speaker, formatDuration(l.durationSec), formats].filter(Boolean).join(", ")}
      </p>
      {progress?.completed ? (
        <p className="mt-1 text-sm text-emerald">Просмотрено</p>
      ) : l.publishedAt ? (
        <p className="mt-1 text-sm text-muted">{formatDateShort(l.publishedAt)}</p>
      ) : null}
    </article>
  );
}
