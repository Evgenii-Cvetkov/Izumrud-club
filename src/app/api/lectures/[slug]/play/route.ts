import { z } from "zod";
import { getViewer } from "@/lib/member";
import { getLecture } from "@/lib/content";
import { signFiles, TTL } from "@/lib/storage";
import { videoSourceFor } from "@/lib/video";
import { fail, forbiddenOrigin, json, parseBody, paymentRequired, sameOrigin, unauthorized } from "@/lib/http";

const Body = z.object({ format: z.enum(["video", "audio"]) });

/** Выдаёт ссылку на видео или аудио только участнику с открытым доступом. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const { user, isMember } = await getViewer();
  if (!user) return unauthorized();
  if (!isMember) return paymentRequired();
  const body = await parseBody(req, Body);
  if (!body) return fail(400, "bad_request", "Укажите формат");

  const lecture = await getLecture((await ctx.params).slug);
  if (!lecture) return fail(404, "not_found", "Лекция не найдена");

  if (body.format === "video") {
    if (!lecture.videoId) return fail(404, "no_video", "У этой лекции нет видео");
    return json({ format: "video", ...videoSourceFor(lecture.videoId), watermark: user.email, expiresIn: TTL.media });
  }
  if (!lecture.audioFile) return fail(404, "no_audio", "У этой лекции нет аудиоверсии");
  const urls = await signFiles([lecture.audioFile], TTL.media);
  const src = urls.get(lecture.audioFile);
  if (!src) return fail(404, "no_audio", "Аудиофайл не найден");
  return json({ format: "audio", type: "file", src, expiresIn: TTL.media });
}
