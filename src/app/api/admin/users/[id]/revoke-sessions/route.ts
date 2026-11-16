import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { invalidatePendingOtps, requireAuth, revokeAllSessions } from "@/lib/auth";
import { jsonError, withErrorHandling } from "@/lib/http";
import { uuidV4Schema } from "@/lib/validators";

type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonError(400, "ID de usuario inválido");

  const [target] = await db.select({ id: users.id, rut: users.rut }).from(users).where(eq(users.id, id)).limit(1);
  if (!target) return jsonError(404, "Usuario no encontrado");

  await db.transaction(async (tx) => {
    await revokeAllSessions(id, tx);
    await invalidatePendingOtps(id, tx);
    await recordAuditLog(
      {
        actorUserId: auth.user.id,
        actorRole: auth.user.role,
        action: "SESSION_REVOKED",
        entityType: "user",
        entityId: id,
        details: { rut: target.rut },
      },
      tx,
    );
  });

  return NextResponse.json({ ok: true });
});
