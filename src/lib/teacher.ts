import { and, asc, eq, inArray } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { db, type DbOrTx } from "@/db";
import { classes, classTeachers } from "@/db/schema";
import type { AuthUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { uuidV4Schema } from "@/lib/validators";

export type AuthorizedClassResult =
  | { ok: true; classRow: typeof classes.$inferSelect }
  | { ok: false; response: NextResponse };

/** Verifica existencia de clase y acceso del profesor (`class_teachers`) o `SUPER_ADMIN` sin restricción. */
export async function assertTeacherClassAccess(
  user: AuthUser,
  classId: string,
  executor: DbOrTx = db,
): Promise<AuthorizedClassResult> {
  if (!uuidV4Schema.safeParse(classId).success) {
    return { ok: false, response: jsonError(400, "ID de clase inválido") };
  }

  const [classRow] = await executor.select().from(classes).where(eq(classes.id, classId)).limit(1);
  if (!classRow) {
    return { ok: false, response: jsonError(404, "Clase no encontrada") };
  }

  if (user.role === "TEACHER") {
    const [assigned] = await executor
      .select({ classId: classTeachers.classId })
      .from(classTeachers)
      .where(and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, user.id)))
      .limit(1);

    if (!assigned) {
      return { ok: false, response: jsonError(403, "No tienes acceso a una clase no asignada") };
    }
  }

  return { ok: true, classRow };
}

/** Obtiene las clases accesibles para el actor (`TEACHER`: asignadas; `SUPER_ADMIN`: todas). */
export async function listAccessibleClasses(user: AuthUser) {
  if (user.role === "SUPER_ADMIN") {
    return db
      .select({
        id: classes.id,
        name: classes.name,
        ageRange: classes.ageRange,
        status: classes.status,
      })
      .from(classes)
      .orderBy(asc(classes.status), asc(classes.createdAt));
  }

  return db
    .select({
      id: classes.id,
      name: classes.name,
      ageRange: classes.ageRange,
      status: classes.status,
    })
    .from(classTeachers)
    .innerJoin(classes, eq(classTeachers.classId, classes.id))
    .where(eq(classTeachers.teacherId, user.id))
    .orderBy(asc(classes.status), asc(classes.createdAt));
}

export async function getTeacherAssignedClassIds(teacherId: string): Promise<string[]> {
  const rows = await db
    .select({ classId: classTeachers.classId })
    .from(classTeachers)
    .where(eq(classTeachers.teacherId, teacherId));
  return rows.map((r) => r.classId);
}

/** Carga nombres de usuario por lista de IDs sin consultas redundantes. */
export async function getTeacherClassFilterIds(user: AuthUser, requestedClassId?: string): Promise<string[] | NextResponse> {
  if (requestedClassId) {
    const access = await assertTeacherClassAccess(user, requestedClassId);
    if (!access.ok) return access.response;
    return [requestedClassId];
  }
  if (user.role === "TEACHER") {
    return getTeacherAssignedClassIds(user.id);
  }
  const all = await db.select({ id: classes.id }).from(classes);
  return all.map((c) => c.id);
}

export { inArray };
