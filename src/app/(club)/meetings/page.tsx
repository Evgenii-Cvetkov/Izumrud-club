import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listAlbums } from "@/lib/content";
import { formatDate, plural } from "@/lib/format";
import { Cover } from "@/components/Cover";

export const metadata: Metadata = { title: "Встречи" };

export default async function MeetingsPage() {
  await requireUser("/meetings");
  const albums = await listAlbums();

  return (
    <>
      <h1 className="text-title">Встречи</h1>
      {albums.length === 0 ? (
        <p className="mt-6 text-muted">Фото появятся после первой встречи клуба.</p>
      ) : (
        <ul className="mt-6 grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {albums.map((a) => (
            <li key={a.id}>
              <Link href={`/meetings/${a.id}`} className="group block text-ink no-underline">
                <Cover url={a.coverUrl} seed={`album-${a.id}`} alt="" />
                <h2 className="mt-3 text-[1.2rem] leading-snug group-hover:text-emerald-deep">{a.title}</h2>
                <p className="mt-1 text-sm text-muted">
                  {[formatDate(a.eventDate), `${a.photoCount} ${plural(a.photoCount, "фото", "фото", "фото")}`].filter(Boolean).join(", ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
