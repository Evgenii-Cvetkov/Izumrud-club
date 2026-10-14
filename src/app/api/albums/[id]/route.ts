import { getViewer } from "@/lib/member";
import { getAlbum } from "@/lib/content";
import { fail, json, paymentRequired, unauthorized } from "@/lib/http";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, isMember } = await getViewer();
  if (!user) return unauthorized();
  if (!isMember) return paymentRequired();
  const id = Number((await ctx.params).id);
  const album = Number.isInteger(id) ? await getAlbum(id, true) : null;
  if (!album) return fail(404, "not_found", "Альбом не найден");
  return json(album);
}
