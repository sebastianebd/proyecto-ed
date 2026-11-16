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

  const classChanged = parsed.data.classId !== undefined && parsed.data.classId !== existing.classId;
  if (classChanged && parsed.data.classId) {
    const [cls] = await db.select({ id: classes.id }).from(classes).where(eq(classes.id, parsed.data.classId)).limit(1);
    if (!cls) return jsonError(400, "La nueva clase seleccionada no existe");
  }

  const uniqueParents = parsed.data.parents
    ? Array.from(new Map(parsed.data.parents.map((p) => [p.parentId, p])).values())
    : undefined;
  if (uniqueParents && uniqueParents.length > 0) {
    const parentIds = uniqueParents.map((p) => p.parentId);
    const found = await db.select({ id: users.id, role: users.role }).from(users).where(inArray(users.id, parentIds));
    if (found.length !== parentIds.length || found.some((u) => u.role !== "PARENT")) {
      return jsonError(400, "Todos los vínculos familiares deben corresponder a usuarios con rol Padre/Tutor");
    }
  }

  const deactivated = parsed.data.status === "INACTIVE" && existing.status !== "INACTIVE";
  const reactivated = parsed.data.status === "ACTIVE" && existing.status === "INACTIVE";

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(students)
      .set({
        ...(parsed.data.fullName !== undefined ? { fullName: parsed.data.fullName } : {}),
        ...(parsed.data.classId !== undefined ? { classId: parsed.data.classId } : {}),
        ...(parsed.data.birthDate !== undefined ? { birthDate: parsed.data.birthDate ?? null } : {}),
        ...(parsed.data.specialCare !== undefined ? { specialCare: parsed.data.specialCare ?? null } : {}),
        ...(parsed.data.preferences !== undefined ? { preferences: parsed.data.preferences ?? null } : {}),
        ...(parsed.data.preferencesNotes !== undefined ? { preferencesNotes: parsed.data.preferencesNotes ?? null } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      })
      .where(eq(students.id, id))
      .returning();

    if (classChanged && parsed.data.classId) {
      await tx
        .update(studentClassHistory)
        .set({ unassignedAt: sql`now()` })
        .where(and(eq(studentClassHistory.studentId, id), isNull(studentClassHistory.unassignedAt)));

      await tx.insert(studentClassHistory).values({
        studentId: id,
        classId: parsed.data.classId,
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
      // Si no tiene historial abierto al reactivarse, aseguramos continuidad en la clase vigente.
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

    if (!classChanged && !deactivated) {
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
