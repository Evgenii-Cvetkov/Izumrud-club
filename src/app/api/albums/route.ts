import { getViewer } from "@/lib/member";
import { listAlbums } from "@/lib/content";
import { json, unauthorized } from "@/lib/http";

export async function GET() {
  const { user } = await getViewer();
  if (!user) return unauthorized();
  return json(await listAlbums());
}
