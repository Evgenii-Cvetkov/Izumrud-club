import "server-only";
import { cache } from "react";
import { getUser } from "./auth";
import { getSubscription } from "./billing";
import { hasAccess } from "./subscription-rules";

/** Кто смотрит страницу: гость, вошедший без членства или участник. */
export const getViewer = cache(async () => {
  const user = await getUser();
  if (!user) return { user: null, sub: null, isMember: false, wasMember: false } as const;
  const sub = await getSubscription(user.id);
  const isMember = hasAccess(sub);
  const wasMember = !isMember && !!sub?.periodEnd;
  return { user, sub, isMember, wasMember } as const;
});
