import { getViewer } from "@/lib/member";
import { continueWatching, listAlbums, listArticles, listLectures } from "@/lib/content";
import { json, paymentRequired, unauthorized } from "@/lib/http";

export async function GET() {
  const { user, isMember } = await getViewer();
  if (!user) return unauthorized();
  if (!isMember) return paymentRequired();
  const [lectures, articles, albums, resume] = await Promise.all([
    listLectures(),
    listArticles(4),
    listAlbums(3),
    continueWatching(user.id),
  ]);
  return json({ continueWatching: resume, lectures: lectures.items.slice(0, 6), articles, albums });
}
