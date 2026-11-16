import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { requireAuth, revokeSession, sessionCookieName, sessionCookieOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/http";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowOnboarding: true });
  if (!auth.ok) return auth.response;

  // Endpoint push opcional enviado por el cliente para desvincular este navegador al salir.
  let pushEndpoint: string | undefined;
  try {
    const body = (await req.json()) as { pushEndpoint?: unknown };
    if (typeof body?.pushEndpoint === "string" && body.pushEndpoint.length > 0 && body.pushEndpoint.length <= 2000) {
      pushEndpoint = body.pushEndpoint;
    }
  } catch {
    // Cuerpo vacío o sin JSON es válido en logout.
  }

  await db.transaction(async (tx) => {
    await revokeSession(auth.sessionId, tx);
    if (pushEndpoint) {
      await tx
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, auth.user.id), eq(pushSubscriptions.endpoint, pushEndpoint)));
    }
    await recordAuditLog(
      {
        actorUserId: auth.user.id,
        actorRole: auth.user.role,
        action: "LOGOUT",
        entityType: "session",
        entityId: auth.sessionId,
      },
      tx,
    );
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookieName(), "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
});
