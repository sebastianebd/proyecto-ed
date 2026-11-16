import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classes, lessonCompletions, lessonViews, lessons, units, users } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { jsonError, withErrorHandling } from "@/lib/http";
import { getEligibleChildrenForUnit, isLessonUnlockedForParent, loadParentAccessContext } from "@/lib/parent";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["PARENT"] });
  if (!auth.ok) return auth.response;

  const ctx = await loadParentAccessContext(auth.user.id);
  if (!ctx) {
    return jsonError(403, "No tienes alumnos activos vinculados a tu cuenta");
  }

  const currentClassList = Array.from(ctx.currentClassIds);
  const allClassList = Array.from(ctx.allAccessibleClassIds);

  // Unidades ACTIVE únicamente de las clases actuales; FINISHED de clases actuales o historial (`student_class_history`).
  const unitCondition =
    currentClassList.length > 0
      ? or(
          and(inArray(units.classId, currentClassList), eq(units.status, "ACTIVE")),
          and(inArray(units.classId, allClassList), eq(units.status, "FINISHED")),
        )
      : and(inArray(units.classId, allClassList), eq(units.status, "FINISHED"));

  const visibleUnits = await db
    .select({
      id: units.id,
      classId: units.classId,
      className: classes.name,
      orderNumber: units.orderNumber,
      title: units.title,
      status: units.status,
      createdAt: units.createdAt,
    })
    .from(units)
    .innerJoin(classes, eq(units.classId, classes.id))
    .where(unitCondition)
    .orderBy(asc(units.orderNumber), desc(units.createdAt));

  // Ordenar poniendo ACTIVE primero y FINISHED recientes después
  visibleUnits.sort((a, b) => {
    if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
    if (a.status !== "ACTIVE" && b.status === "ACTIVE") return 1;
    return b.orderNumber - a.orderNumber;
  });

  const unitIds = visibleUnits.map((u) => u.id);
  const now = new Date();
  const childIds = ctx.activeChildren.map((c) => c.id);

  const unitLessons =
    unitIds.length > 0
      ? await db
          .select({
            id: lessons.id,
            unitId: lessons.unitId,
            lessonNumber: lessons.lessonNumber,
            title: lessons.title,
            biblePassage: lessons.biblePassage,
            classSundayDate: lessons.classSundayDate,
            unlockAt: lessons.unlockAt,
            scheduleStatus: lessons.scheduleStatus,
          })
          .from(lessons)
          .where(inArray(lessons.unitId, unitIds))
          .orderBy(asc(lessons.lessonNumber))
      : [];

  const lessonIds = unitLessons.map((l) => l.id);

  const [viewsRows, completionRows] =
    lessonIds.length > 0
      ? await Promise.all([
          db
            .select({
              lessonId: lessonViews.lessonId,
              firstViewedAt: lessonViews.firstViewedAt,
              lastViewedAt: lessonViews.lastViewedAt,
            })
            .from(lessonViews)
            .where(and(inArray(lessonViews.lessonId, lessonIds), eq(lessonViews.parentId, auth.user.id))),
          db
            .select({
              lessonId: lessonCompletions.lessonId,
              studentId: lessonCompletions.studentId,
              completedByUserId: lessonCompletions.completedByUserId,
              completedByName: users.fullName,
              completedAt: lessonCompletions.completedAt,
            })
            .from(lessonCompletions)
            .innerJoin(users, eq(lessonCompletions.completedByUserId, users.id))
            .where(and(inArray(lessonCompletions.lessonId, lessonIds), inArray(lessonCompletions.studentId, childIds))),
        ])
      : [[], []];

  const viewsByLesson = new Map(viewsRows.map((v) => [v.lessonId, v]));
  const completionsByLesson = new Map<string, typeof completionRows>();
  for (const c of completionRows) {
    const arr = completionsByLesson.get(c.lessonId) ?? [];
    arr.push(c);
    completionsByLesson.set(c.lessonId, arr);
  }

  const unitMap = new Map(visibleUnits.map((u) => [u.id, u]));
  const lessonsByUnit = new Map<string, unknown[]>();

  for (const l of unitLessons) {
    const parentUnit = unitMap.get(l.unitId);
    if (!parentUnit) continue;
    const eligibleChildren = getEligibleChildrenForUnit(ctx, parentUnit);
    const eligibleIdSet = new Set(eligibleChildren.map((c) => c.id));
    const childNameById = new Map(eligibleChildren.map((c) => [c.id, c.fullName]));

    const unlocked = isLessonUnlockedForParent(l, now);
    const view = unlocked ? viewsByLesson.get(l.id) ?? null : null;
    const completions = unlocked
      ? (completionsByLesson.get(l.id) ?? [])
          .filter((c) => eligibleIdSet.has(c.studentId))
          .map((c) => ({
            studentId: c.studentId,
            studentName: childNameById.get(c.studentId) ?? "Alumno",
            completedByUserId: c.completedByUserId,
            completedByName: c.completedByName,
            completedAt: c.completedAt,
          }))
      : [];

    const arr = lessonsByUnit.get(l.unitId) ?? [];
    arr.push({
      id: l.id,
      lessonNumber: l.lessonNumber,
      title: l.title,
      // Contenido protegido: no exponer pasaje si está bloqueada
      biblePassage: unlocked ? l.biblePassage : null,
      classSundayDate: l.classSundayDate,
      unlockAt: l.unlockAt,
      scheduleStatus: l.scheduleStatus,
      unlocked,
      viewed: view ? { firstViewedAt: view.firstViewedAt, lastViewedAt: view.lastViewedAt } : null,
      completions,
    });
    lessonsByUnit.set(l.unitId, arr);
  }

  // Lista de clases visibles para selector UI (clases actuales + históricas con unidades FINISHED)
  const visibleClassesMap = new Map<string, { classId: string; className: string; childNames: string[]; isHistoricalOnly: boolean }>();
  for (const c of ctx.activeChildren) {
    const entry = visibleClassesMap.get(c.classId) ?? {
      classId: c.classId,
      className: c.className,
      childNames: [],
      isHistoricalOnly: false,
    };
    entry.childNames.push(c.fullName);
    visibleClassesMap.set(c.classId, entry);
  }
  for (const u of visibleUnits) {
    if (!visibleClassesMap.has(u.classId)) {
      const eligibleNames = getEligibleChildrenForUnit(ctx, u).map((c) => c.fullName);
      visibleClassesMap.set(u.classId, {
        classId: u.classId,
        className: u.className,
        childNames: eligibleNames,
        isHistoricalOnly: true,
      });
    }
  }

  return NextResponse.json({
    children: ctx.activeChildren.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      classId: c.classId,
      className: c.className,
      relationship: c.relationship,
    })),
    classes: Array.from(visibleClassesMap.values()),
    units: visibleUnits.map((u) => {
      const eligible = getEligibleChildrenForUnit(ctx, u);
      return {
        id: u.id,
        classId: u.classId,
        className: u.className,
        orderNumber: u.orderNumber,
        title: u.title,
        status: u.status,
        eligibleChildren: eligible.map((c) => ({ id: c.id, fullName: c.fullName })),
        lessons: lessonsByUnit.get(u.id) ?? [],
      };
    }),
  });
});
