import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getViewer } from "@/lib/member";
import { getAlbum } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { Paywall } from "@/components/Paywall";
import { Gallery } from "./Gallery";

export const metadata: Metadata = { title: "Встреча" };

export default async function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/meetings/${id}`);
  const { isMember, wasMember } = await getViewer();
  const albumId = Number(id);
  const album = Number.isInteger(albumId) ? await getAlbum(albumId, isMember) : null;
  if (!album) notFound();

  return (
    <>
      <Link href="/meetings" className="btn-quiet">Все встречи</Link>
      <h1 className="mt-3 text-[2rem] leading-tight">{album.title}</h1>
      <p className="mt-2 text-muted">{formatDate(album.eventDate)}</p>
      {album.description && <p className="mt-4 max-w-2xl">{album.description}</p>}
      {isMember ? (
        <Gallery photos={album.photos.filter((p): p is { id: number; caption: string | null; url: string } => !!p.url)} title={album.title} />
      ) : (
        <Paywall wasMember={wasMember} what="фото этой встречи" />
      )}
    </>
  );
}
