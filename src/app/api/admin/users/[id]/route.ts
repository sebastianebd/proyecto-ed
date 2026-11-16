import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { invalidatePendingOtps, requireAuth, revokeAllSessions } from "@/lib/auth";
import { getPgErrorInfo, jsonError, parseBody, withErrorHandling } from "@/lib/http";
import { adminUpdateUserSchema, uuidV4Schema } from "@/lib/validators";

type RouteCtx = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonError(400, "ID de usuario inválido");

  const parsed = await parseBody(req, adminUpdateUserSchema);
  if (!parsed.ok) return parsed.response;

  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return jsonError(404, "Usuario no encontrado");

  // Protección del Super Admin único (docs/03 §4.3): no puede auto-desactivarse ni bajarse el rol.
  if (id === auth.user.id) {
    if (parsed.data.role !== undefined && parsed.data.role !== "SUPER_ADMIN") {
      return jsonError(403, "No puedes cambiar tu propio rol de Super Administrador");
    }
    if (parsed.data.status !== undefined && parsed.data.status !== "ACTIVE") {
      return jsonError(403, "No puedes desactivar tu propia cuenta");
    }
  }

  const emailChanged = parsed.data.email !== undefined && parsed.data.email !== existing.email;
  const roleChanged = parsed.data.role !== undefined && parsed.data.role !== existing.role;
  const deactivated = parsed.data.status === "INACTIVE" && existing.status !== "INACTIVE";
  const nextStatus =
    parsed.data.status === "ACTIVE" && existing.status === "INACTIVE" && !existing.onboardedAt
      ? "PENDING_ONBOARDING"
      : parsed.data.status;

  const patchValues: Partial<typeof users.$inferInsert> = {};
  if (parsed.data.fullName !== undefined) patchValues.fullName = parsed.data.fullName;
  if (parsed.data.email !== undefined) patchValues.email = parsed.data.email;
  if (parsed.data.phone !== undefined) patchValues.phone = parsed.data.phone ?? null;
  if (parsed.data.role !== undefined) patchValues.role = parsed.data.role;
  if (nextStatus !== undefined) patchValues.status = nextStatus;

  if (Object.keys(patchValues).length === 0) {
    return jsonError(400, "Debes enviar al menos un campo para actualizar");
  }

  try {
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(users).set(patchValues).where(eq(users.id, id)).returning();

      if (emailChanged || deactivated || roleChanged) {
        await revokeAllSessions(id, tx);
        await invalidatePendingOtps(id, tx);
      }

      if (emailChanged) {
        await recordAuditLog(
          {
            actorUserId: auth.user.id,
            actorRole: auth.user.role,
            action: "USER_EMAIL_CHANGED",
            entityType: "user",
            entityId: id,
            details: { beforeEmail: existing.email, afterEmail: row.email },
          },
          tx,
        );
      }

      if (deactivated) {
        await recordAuditLog(
          {
            actorUserId: auth.user.id,
            actorRole: auth.user.role,
            action: "USER_DEACTIVATE",
            entityType: "user",
            entityId: id,
            details: { rut: row.rut },
          },
          tx,
        );
      }

      if (!emailChanged && !deactivated) {
        await recordAuditLog(
          {
            actorUserId: auth.user.id,
            actorRole: auth.user.role,
            action: "USER_UPDATE",
            entityType: "user",
            entityId: id,
            details: { beforeRole: existing.role, afterRole: row.role, beforeStatus: existing.status, afterStatus: row.status },
          },
          tx,
        );
      }

      return row;
    });

    return NextResponse.json({ item: updated });
  } catch (err) {
    const pg = getPgErrorInfo(err);
    if (pg.code === "23505") {
      return jsonError(409, "Ya existe otro usuario registrado con ese correo");
    }
    throw err;
  }
});
