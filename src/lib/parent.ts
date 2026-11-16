import { and, asc, eq, inArray } from "drizzle-orm";
import type { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classes, lessonCompletions, lessons, parentStudents, studentClassHistory, students, units, users } from "@/db/schema";
import { requireAuth, type AuthUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import {
  getEligibleChildrenForUnit,
  isLessonUnlockedForParent,
  validateRequestedStudentIds,
  type ParentAccessContext,
  type ParentActiveChild,
} from "@/lib/parent-rules";
import { uuidV4Schema } from "@/lib/validators";

export { getEligibleChildrenForUnit, isLessonUnlockedForParent, validateRequestedStudentIds };
export type { ParentAccessContext, ParentActiveChild };

/** Carga hijos ACTIVE del padre y sus clases actuales + históricas (`student_class_history`). */
export async function loadParentAccessContext(parentId: string): Promise<ParentAccessContext | null> {
  const activeChildren = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      classId: students.classId,
      className: classes.name,
      relationship: parentStudents.relationship,
    })
    .from(parentStudents)
    .innerJoin(students, eq(parentStudents.studentId, students.id))
    .innerJoin(classes, eq(students.classId, classes.id))
    .where(and(eq(parentStudents.parentId, parentId), eq(students.status, "ACTIVE")))
    .orderBy(asc(students.fullName));

  if (activeChildren.length === 0) return null;

  const childIds = activeChildren.map((c) => c.id);
  const historyRows = await db
    .select({
      studentId: studentClassHistory.studentId,
      classId: studentClassHistory.classId,
    })
    .from(studentClassHistory)
    .where(inArray(studentClassHistory.studentId, childIds));

  const currentClassIds = new Set<string>(activeChildren.map((c) => c.classId));
  const historyClassIdsByChild = new Map<string, Set<string>>();
  const allAccessibleClassIds = new Set<string>(currentClassIds);

  for (const row of historyRows) {
    let set = historyClassIdsByChild.get(row.studentId);
    if (!set) {
      set = new Set<string>();
      historyClassIdsByChild.set(row.studentId, set);
    }
    set.add(row.classId);
    allAccessibleClassIds.add(row.classId);
  }

  return { activeChildren, currentClassIds, historyClassIdsByChild, allAccessibleClassIds };
}

export type AuthorizedParentLesson = {
  ok: true;
  user: AuthUser;
  ctx: ParentAccessContext;
  lesson: typeof lessons.$inferSelect;
  unit: typeof units.$inferSelect;
  className: string;
  eligibleChildren: ParentActiveChild[];
};

export type DeniedParentLesson = { ok: false; response: NextResponse };

/** Guard unificado para `GET /api/parent/lessons/:id`, `complete` y `uncomplete` (docs/03 §4.1). */
export async function authorizeParentLesson(
  req: NextRequest,
  lessonId: string,
  now: Date = new Date(),
): Promise<AuthorizedParentLesson | DeniedParentLesson> {
  const auth = await requireAuth(req, { allowedRoles: ["PARENT"] });
  if (!auth.ok) return { ok: false, response: auth.response };

  if (!uuidV4Schema.safeParse(lessonId).success) {
    return { ok: false, response: jsonError(400, "ID de lección inválido") };
  }

  const ctx = await loadParentAccessContext(auth.user.id);
  if (!ctx) {
    return { ok: false, response: jsonError(403, "No tienes alumnos activos vinculados a tu cuenta") };
  }

  const [row] = await db
    .select({
      lesson: lessons,
      unit: units,
      className: classes.name,
    })
    .from(lessons)
    .innerJoin(units, eq(lessons.unitId, units.id))
    .innerJoin(classes, eq(units.classId, classes.id))
    .where(eq(lessons.id, lessonId))
    .limit(1);

  if (!row) {
    return { ok: false, response: jsonError(404, "Lección no encontrada") };
  }

  if (row.unit.status !== "ACTIVE" && row.unit.status !== "FINISHED") {
    return { ok: false, response: jsonError(403, "Esta lección aún no está disponible para familias") };
  }

  const eligibleChildren = getEligibleChildrenForUnit(ctx, row.unit);
  if (eligibleChildren.length === 0) {
    return { ok: false, response: jsonError(403, "No tienes autorización para acceder a esta clase") };
  }

  if (!isLessonUnlockedForParent(row.lesson, now)) {
    return { ok: false, response: jsonError(403, "Esta lección aún se encuentra bloqueada") };
  }

  return {
    ok: true,
    user: auth.user,
    ctx,
    lesson: row.lesson,
    unit: row.unit,
    className: row.className,
    eligibleChildren,
  };
}

/** Retorna el estado de completado compartido por alumno para los hijos elegibles de la clase. */
export async function loadLessonCompletionState(lessonId: string, eligibleChildren: ParentActiveChild[]) {
  const eligibleIds = eligibleChildren.map((c) => c.id);
  const completionRows =
    eligibleIds.length > 0
      ? await db
          .select({
            studentId: lessonCompletions.studentId,
            completedByUserId: lessonCompletions.completedByUserId,
            completedByName: users.fullName,
            completedAt: lessonCompletions.completedAt,
          })
          .from(lessonCompletions)
          .innerJoin(users, eq(lessonCompletions.completedByUserId, users.id))
          .where(and(eq(lessonCompletions.lessonId, lessonId), inArray(lessonCompletions.studentId, eligibleIds)))
      : [];

  const byStudent = new Map(completionRows.map((c) => [c.studentId, c]));
  return eligibleChildren.map((c) => {
    const comp = byStudent.get(c.id);
    return {
      id: c.id,
      fullName: c.fullName,
      completed: Boolean(comp),
      completedByUserId: comp?.completedByUserId ?? null,
      completedByName: comp?.completedByName ?? null,
      completedAt: comp?.completedAt ?? null,
    };
  });
}
