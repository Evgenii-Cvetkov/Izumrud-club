import { z } from "zod";
import { getViewer } from "@/lib/member";
import { getLectureById, saveProgress } from "@/lib/content";
import { fail, forbiddenOrigin, json, parseBody, paymentRequired, sameOrigin, unauthorized } from "@/lib/http";

const Body = z.object({ positionSec: z.number().min(0).max(24 * 3600), durationSec: z.number().min(0).max(24 * 3600).optional() });

export async function PUT(req: Request, ctx: { params: Promise<{ lectureId: string }> }) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const { user, isMember } = await getViewer();
  if (!user) return unauthorized();
  if (!isMember) return paymentRequired();
  const body = await parseBody(req, Body);
  const id = Number((await ctx.params).lectureId);
  if (!body || !Number.isInteger(id)) return fail(400, "bad_request", "Неверные данные");
  const lecture = await getLectureById(id);
  if (!lecture) return fail(404, "not_found", "Лекция не найдена");
  // Длительность из админки надёжнее, но если её не заполнили — берём у плеера.
  return json(await saveProgress(user.id, id, body.positionSec, lecture.durationSec ?? body.durationSec ?? null));
}
