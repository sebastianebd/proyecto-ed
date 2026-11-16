import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { jsonError, parseBody, withErrorHandling } from "@/lib/http";
import { getVapidPublicKey, isPushConfigured } from "@/lib/push";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@/lib/validators";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowOnboarding: true });
  if (!auth.ok) return auth.response;

  const subs = await db
    .select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, auth.user.id));

  const endpointParam = new URL(req.url).searchParams.get("endpoint") || undefined;
  const endpointRegistered = endpointParam ? subs.some((s) => s.endpoint === endpointParam) : false;

  return NextResponse.json({
    configured: isPushConfigured(),
    publicKey: getVapidPublicKey(),
    subscriptionsCount: subs.length,
    endpointRegistered,
  });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowOnboarding: true });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, pushSubscribeSchema);
  if (!parsed.ok) return parsed.response;

  const { endpoint, keys, platform } = parsed.data;

  // UPSERT por endpoint: si otro usuario usa el mismo navegador luego de logout/login, reasigna userId.
  const [saved] = await db
    .insert(pushSubscriptions)
    .values({
      userId: auth.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      platform,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: auth.user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        platform,
      },
    })
    .returning({ id: pushSubscriptions.id, userId: pushSubscriptions.userId, platform: pushSubscriptions.platform });

  return NextResponse.json({ ok: true, subscription: saved });
});

export const DELETE = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowOnboarding: true });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, pushUnsubscribeSchema);
  if (!parsed.ok) return parsed.response;

  const deleted = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, auth.user.id), eq(pushSubscriptions.endpoint, parsed.data.endpoint)))
    .returning({ id: pushSubscriptions.id });

  if (deleted.length === 0) {
    return jsonError(404, "Suscripción no encontrada para este usuario");
  }

  return NextResponse.json({ ok: true, removed: deleted.length });
});
