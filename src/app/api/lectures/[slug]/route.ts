import { getViewer } from "@/lib/member";
import { articlesForLecture, getLecture, getProgressMap } from "@/lib/content";
import { fail, json, paymentRequired, unauthorized } from "@/lib/http";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { user, isMember } = await getViewer();
  if (!user) return unauthorized();
  if (!isMember) return paymentRequired();
  const lecture = await getLecture((await ctx.params).slug);
  if (!lecture) return fail(404, "not_found", "Лекция не найдена");
  const [articles, progress] = await Promise.all([articlesForLecture(lecture.id), getProgressMap(user.id, [lecture.id])]);
  const { videoId: _v, audioFile: _a, ...card } = lecture;
  return json({ ...card, articles, progress: progress.get(lecture.id) ?? null });
}
