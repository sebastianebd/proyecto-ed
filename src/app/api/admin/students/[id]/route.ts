import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classes, parentStudents, studentClassHistory, students, users } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { jsonError, parseBody, withErrorHandling } from "@/lib/http";
import { adminUpdateStudentSchema, uuidV4Schema } from "@/lib/validators";

type RouteCtx = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonError(400, "ID de alumno inválido");

  const parsed = await parseBody(req, adminUpdateStudentSchema);
  if (!parsed.ok) return parsed.response;

  const [existing] = await db.select().from(students).where(eq(students.id, id)).limit(1);
  if (!existing) return jsonError(404, "Alumno no encontrado");

  const deactivated = parsed.data.status === "INACTIVE" && existing.status !== "INACTIVE";
  const reactivated = parsed.data.status === "ACTIVE" && existing.status === "INACTIVE";
  const classChanged = parsed.data.classId !== undefined && parsed.data.classId !== existing.classId;
  const targetClassId = parsed.data.classId ?? existing.classId;

  if (classChanged || reactivated) {
    const [cls] = await db
      .select({ id: classes.id, status: classes.status })
      .from(classes)
      .where(eq(classes.id, targetClassId))
      .limit(1);
    if (!cls || cls.status !== "ACTIVE") {
      return jsonError(400, "La clase destino no existe o está archivada");
    }
  }

  const uniqueParents = parsed.data.parents
    ? Array.from(new Map(parsed.data.parents.map((p) => [p.parentId, p])).values())
    : undefined;
  if (uniqueParents && uniqueParents.length > 0) {
    const parentIds = uniqueParents.map((p) => p.parentId);
    const found = await db
      .select({ id: users.id, role: users.role, status: users.status })
      .from(users)
      .where(inArray(users.id, parentIds));
    if (found.length !== parentIds.length || found.some((u) => u.role !== "PARENT" || u.status === "INACTIVE")) {
      return jsonError(400, "Todos los vínculos familiares deben corresponder a padres activos o pendientes");
    }
  }

  const patchValues: Partial<typeof students.$inferInsert> = {};
  if (parsed.data.fullName !== undefined) patchValues.fullName = parsed.data.fullName;
  if (parsed.data.classId !== undefined) patchValues.classId = parsed.data.classId;
  if (parsed.data.birthDate !== undefined) patchValues.birthDate = parsed.data.birthDate ?? null;
  if (parsed.data.specialCare !== undefined) patchValues.specialCare = parsed.data.specialCare ?? null;
  if (parsed.data.preferences !== undefined) patchValues.preferences = parsed.data.preferences ?? null;
  if (parsed.data.preferencesNotes !== undefined) patchValues.preferencesNotes = parsed.data.preferencesNotes ?? null;
  if (parsed.data.status !== undefined) patchValues.status = parsed.data.status;

  if (Object.keys(patchValues).length === 0 && uniqueParents === undefined) {
    return jsonError(400, "Debes enviar al menos un campo para actualizar");
  }

  const updated = await db.transaction(async (tx) => {
    const row =
      Object.keys(patchValues).length > 0
        ? (await tx.update(students).set(patchValues).where(eq(students.id, id)).returning())[0]
        : existing;

    if (classChanged && parsed.data.classId) {
      await tx
        .update(studentClassHistory)
        .set({ unassignedAt: sql`now()` })
        .where(and(eq(studentClassHistory.studentId, id), isNull(studentClassHistory.unassignedAt)));

      const willStayInactive = row.status === "INACTIVE";
      await tx.insert(studentClassHistory).values({
        studentId: id,
        classId: parsed.data.classId,
        ...(willStayInactive ? { unassignedAt: sql`now()` as unknown as Date } : {}),
      });

      await recordAuditLog(
        {
          actorUserId: auth.user.id,
          actorRole: auth.user.role,
          action: "STUDENT_CLASS_CHANGE",
          entityType: "student",
          entityId: id,
          details: { fromClassId: existing.classId, toClassId: parsed.data.classId },
        },
        tx,
      );
    } else if (reactivated) {
      const openRows = await tx
        .select({ id: studentClassHistory.id })
        .from(studentClassHistory)
        .where(and(eq(studentClassHistory.studentId, id), isNull(studentClassHistory.unassignedAt)))
        .limit(1);
      if (openRows.length === 0) {
        await tx.insert(studentClassHistory).values({ studentId: id, classId: row.classId });
      }
    }

    if (uniqueParents !== undefined) {
      await tx.delete(parentStudents).where(eq(parentStudents.studentId, id));
      if (uniqueParents.length > 0) {
        await tx.insert(parentStudents).values(
          uniqueParents.map((p) => ({
            parentId: p.parentId,
            studentId: id,
            relationship: p.relationship ?? null,
          })),
        );
      }
    }

    if (deactivated) {
      await recordAuditLog(
        {
          actorUserId: auth.user.id,
          actorRole: auth.user.role,
          action: "STUDENT_DEACTIVATE",
          entityType: "student",
          entityId: id,
          details: { fullName: row.fullName },
        },
        tx,
      );
    }

    const hasOtherUpdates =
      uniqueParents !== undefined ||
      parsed.data.fullName !== undefined ||
      parsed.data.birthDate !== undefined ||
      parsed.data.specialCare !== undefined ||
      parsed.data.preferences !== undefined ||
      parsed.data.preferencesNotes !== undefined ||
      reactivated;

    if ((!classChanged && !deactivated) || (deactivated && hasOtherUpdates)) {
      await recordAuditLog(
        {
          actorUserId: auth.user.id,
          actorRole: auth.user.role,
          action: "STUDENT_UPDATE",
          entityType: "student",
          entityId: id,
          details: { fullName: row.fullName, status: row.status },
        },
        tx,
      );
    }

    return row;
  });

  return NextResponse.json({ item: updated });
});
