import { getViewer } from "@/lib/member";
import { getArticle } from "@/lib/content";
import { fail, json, paymentRequired, unauthorized } from "@/lib/http";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { user, isMember } = await getViewer();
  if (!user) return unauthorized();
  if (!isMember) return paymentRequired();
  const article = await getArticle((await ctx.params).slug);
  if (!article) return fail(404, "not_found", "Статья не найдена");
  return json(article);
}
