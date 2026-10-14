import { getViewer } from "@/lib/member";
import { listLectures } from "@/lib/content";
import { json, unauthorized } from "@/lib/http";

/** Каталог видят все вошедшие — бывшие участники тоже, но без доступа к медиа. */
export async function GET(req: Request) {
  const { user } = await getViewer();
  if (!user) return unauthorized();
  const p = new URL(req.url).searchParams;
  const format = p.get("format");
  return json(
    await listLectures({
      topic: p.get("topic") ?? undefined,
      format: format === "video" || format === "audio" ? format : undefined,
      q: p.get("q") ?? undefined,
      page: Number(p.get("page") ?? 1) || 1,
    }),
  );
}
