import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lessons, units } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { jsonError, parseBody, withErrorHandling, getPgErrorInfo } from "@/lib/http";
import { storage } from "@/lib/storage";
import { activateUnit, assignConsecutiveSundays, DomainHttpError } from "@/lib/unit-schedule";
import { adminUpdateUnitSchema, uuidV4Schema } from "@/lib/validators";

type RouteCtx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonError(400, "ID de unidad inválido");

  const [unit] = await db.select().from(units).where(eq(units.id, id)).limit(1);
  if (!unit) return jsonError(404, "Unidad no encontrada");

  const unitLessons = await db.select().from(lessons).where(eq(lessons.unitId, id)).orderBy(asc(lessons.lessonNumber));
  return NextResponse.json({ item: { ...unit, lessons: unitLessons } });
});

export const PATCH = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonError(400, "ID de unidad inválido");

  const parsed = await parseBody(req, adminUpdateUnitSchema);
  if (!parsed.ok) return parsed.response;

  const [existing] = await db.select().from(units).where(eq(units.id, id)).limit(1);
  if (!existing) return jsonError(404, "Unidad no encontrada");

  const { title, orderNumber, status, startSundayDate } = parsed.data;
  if (title === undefined && orderNumber === undefined && status === undefined && startSundayDate === undefined) {
    return jsonError(400, "Debes enviar al menos un campo para actualizar");
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (title !== undefined || orderNumber !== undefined) {
        const patchValues: Partial<typeof units.$inferInsert> = {};
        if (title !== undefined) patchValues.title = title;
        if (orderNumber !== undefined) patchValues.orderNumber = orderNumber;
        await tx.update(units).set(patchValues).where(eq(units.id, id));
      }

      if (startSundayDate !== undefined) {
        if (existing.status === "FINISHED") {
          throw new DomainHttpError(409, "No se puede cambiar el calendario de una unidad finalizada");
        }
        await assignConsecutiveSundays(id, startSundayDate, tx);
      }

      let item = (await tx.select().from(units).where(eq(units.id, id)).limit(1))[0];
      if (status === "ACTIVE" && existing.status !== "ACTIVE") {
        item = await activateUnit(id, auth.user, tx);
      } else if (status === "FINISHED" && existing.status !== "FINISHED") {
        if (existing.status !== "ACTIVE") {
          throw new DomainHttpError(400, "Solo se puede finalizar una unidad activa");
        }
        const [u] = await tx.update(units).set({ status: "FINISHED" }).where(eq(units.id, id)).returning();
        await recordAuditLog(
          {
            actorUserId: auth.user.id,
            actorRole: auth.user.role,
            action: "UNIT_FINISH",
            entityType: "unit",
            entityId: id,
            details: { title: u.title },
          },
          tx,
        );
        item = u;
      } else if (status === "DRAFT" && existing.status !== "DRAFT") {
        throw new DomainHttpError(409, "No se puede devolver una unidad publicada a borrador");
      }

      const unitLessons = await tx.select().from(lessons).where(eq(lessons.unitId, id)).orderBy(asc(lessons.lessonNumber));
      return { ...item, lessons: unitLessons };
    });

    return NextResponse.json({ item: result });
  } catch (err) {
    if (err instanceof DomainHttpError) return jsonError(err.status, err.message);
    if (getPgErrorInfo(err).code === "23505") {
      return jsonError(409, "Ya existe una unidad con ese orden o estado activo en esta clase");
    }
    throw err;
  }
});

export const DELETE = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonError(400, "ID de unidad inválido");

  const [existing] = await db.select().from(units).where(eq(units.id, id)).limit(1);
  if (!existing) return jsonError(404, "Unidad no encontrada");
  if (existing.status !== "DRAFT") {
    return jsonError(409, "Solo se pueden eliminar unidades en estado borrador");
  }

  await db.transaction(async (tx) => {
    await tx.delete(units).where(eq(units.id, id));
    await recordAuditLog(
      {
        actorUserId: auth.user.id,
        actorRole: auth.user.role,
        action: "UNIT_DELETE",
        entityType: "unit",
        entityId: id,
        details: { title: existing.title, classId: existing.classId },
      },
      tx,
    );
  });

  if (existing.pdfStorageKey) {
    await storage.removeObject(existing.pdfStorageKey);
  }

  return NextResponse.json({ ok: true });
});
