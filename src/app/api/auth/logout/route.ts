import { endSession } from "@/lib/auth";
import { forbiddenOrigin, json, sameOrigin } from "@/lib/http";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  await endSession();
  return json({ ok: true });
}
