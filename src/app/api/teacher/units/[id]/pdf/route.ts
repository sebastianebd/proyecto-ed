import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classTeachers, units } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { jsonError, withErrorHandling } from "@/lib/http";
import { storage } from "@/lib/storage";
import { uuidV4Schema } from "@/lib/validators";

type RouteCtx = { params: Promise<{ id: string }> };

// Descarga segura para Profesores de la clase y Super Admin (nunca DRAFT ni PARENT).
export const GET = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const auth = await requireAuth(req, { allowedRoles: ["TEACHER", "SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonError(400, "ID de unidad inválido");

  const [unit] = await db.select().from(units).where(eq(units.id, id)).limit(1);
  if (!unit) return jsonError(404, "Unidad no encontrada");
  if (unit.status !== "ACTIVE" && unit.status !== "FINISHED") {
    return jsonError(403, "El PDF solo está disponible para unidades publicadas");
  }
  if (!unit.pdfStorageKey) {
    return jsonError(404, "La unidad no tiene un PDF adjunto");
  }

  if (auth.user.role === "TEACHER") {
    const [assigned] = await db
      .select({ classId: classTeachers.classId })
      .from(classTeachers)
      .where(and(eq(classTeachers.classId, unit.classId), eq(classTeachers.teacherId, auth.user.id)))
      .limit(1);
    if (!assigned) return jsonError(403, "No tienes acceso al PDF de una clase no asignada");
  }

  const url = await storage.createSignedDownloadUrl(unit.pdfStorageKey, 60);

  await recordAuditLog({
    actorUserId: auth.user.id,
    actorRole: auth.user.role,
    action: "PDF_DOWNLOAD",
    entityType: "unit",
    entityId: unit.id,
    details: { classId: unit.classId, title: unit.title },
  });

  return NextResponse.json({ url, title: unit.title });
});
