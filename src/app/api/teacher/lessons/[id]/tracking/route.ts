import { and, asc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  classes,
  lessonCompletions,
  lessons,
  lessonViews,
  parentStudents,
  students,
  units,
  users,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { jsonError, withErrorHandling } from "@/lib/http";
import { computePercentage } from "@/lib/kpi-math";
import { assertTeacherClassAccess } from "@/lib/teacher";
import { uuidV4Schema } from "@/lib/validators";

type RouteCtx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const auth = await requireAuth(req, { allowedRoles: ["TEACHER", "SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!uuidV4Schema.safeParse(id).success) {
    return jsonError(400, "ID de lección inválido");
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
    .where(eq(lessons.id, id))
    .limit(1);

  if (!row) return jsonError(404, "Lección no encontrada");

  if (row.unit.status !== "ACTIVE" && row.unit.status !== "FINISHED") {
    return jsonError(403, "El seguimiento solo está disponible para unidades publicadas");
  }

  const access = await assertTeacherClassAccess(auth.user, row.unit.classId);
  if (!access.ok) return access.response;

  const activeStudents = await db
    .select({
      id: students.id,
      fullName: students.fullName,
    })
    .from(students)
    .where(and(eq(students.classId, row.unit.classId), eq(students.status, "ACTIVE")))
    .orderBy(asc(students.fullName));

  const studentIds = activeStudents.map((s) => s.id);

  const [parentLinks, completionRows] =
    studentIds.length > 0
      ? await Promise.all([
          db
            .select({
              studentId: parentStudents.studentId,
              parentId: users.id,
              parentName: users.fullName,
            })
            .from(parentStudents)
            .innerJoin(users, eq(parentStudents.parentId, users.id))
            .where(
              and(
                inArray(parentStudents.studentId, studentIds),
                eq(users.status, "ACTIVE"),
                eq(users.role, "PARENT"),
              ),
            )
            .orderBy(asc(users.fullName)),
          db
            .select({
              studentId: lessonCompletions.studentId,
              completedAt: lessonCompletions.completedAt,
              completedByName: users.fullName,
            })
            .from(lessonCompletions)
            .innerJoin(users, eq(lessonCompletions.completedByUserId, users.id))
            .where(and(eq(lessonCompletions.lessonId, id), inArray(lessonCompletions.studentId, studentIds))),
        ])
      : [[], []];

  const studentNameMap = new Map(activeStudents.map((s) => [s.id, s.fullName]));
  const studentsWithActiveParent = new Set(parentLinks.map((p) => p.studentId));
  const completionByStudent = new Map(completionRows.map((c) => [c.studentId, c]));

  const parentMap = new Map<string, { parentId: string; fullName: string; studentNames: string[] }>();
  for (const link of parentLinks) {
    const existing = parentMap.get(link.parentId) ?? {
      parentId: link.parentId,
      fullName: link.parentName,
      studentNames: [],
    };
    const childName = studentNameMap.get(link.studentId);
    if (childName && !existing.studentNames.includes(childName)) {
      existing.studentNames.push(childName);
    }
    parentMap.set(link.parentId, existing);
  }

  const parentIds = Array.from(parentMap.keys());
  const viewRows =
    parentIds.length > 0
      ? await db
          .select({
            parentId: lessonViews.parentId,
            firstViewedAt: lessonViews.firstViewedAt,
            lastViewedAt: lessonViews.lastViewedAt,
          })
          .from(lessonViews)
          .where(and(eq(lessonViews.lessonId, id), inArray(lessonViews.parentId, parentIds)))
      : [];

  const viewByParent = new Map(viewRows.map((v) => [v.parentId, v]));

  const studentsTracking = activeStudents.map((s) => {
    const comp = completionByStudent.get(s.id);
    return {
      studentId: s.id,
      fullName: s.fullName,
      hasActiveParent: studentsWithActiveParent.has(s.id),
      completed: Boolean(comp),
      completedByName: comp?.completedByName ?? null,
      completedAt: comp?.completedAt ?? null,
    };
  });

  const parentsTracking = Array.from(parentMap.values()).map((p) => {
    const view = viewByParent.get(p.parentId);
    return {
      parentId: p.parentId,
      fullName: p.fullName,
      studentNames: p.studentNames,
      viewed: Boolean(view),
      firstViewedAt: view?.firstViewedAt ?? null,
      lastViewedAt: view?.lastViewedAt ?? null,
    };
  });

  const openExpected = parentsTracking.length;
  const openViewed = parentsTracking.filter((p) => p.viewed).length;
  const completionExpected = studentsTracking.filter((s) => s.hasActiveParent).length;
  const completionDone = studentsTracking.filter((s) => s.hasActiveParent && s.completed).length;

  return NextResponse.json({
    lesson: {
      id: row.lesson.id,
      unitId: row.unit.id,
      unitOrderNumber: row.unit.orderNumber,
      unitTitle: row.unit.title,
      unitStatus: row.unit.status,
      classId: row.unit.classId,
      className: row.className,
      lessonNumber: row.lesson.lessonNumber,
      title: row.lesson.title,
      biblePassage: row.lesson.biblePassage,
      parentSummary: row.lesson.parentSummary ?? [],
      reinforcementQuestions: row.lesson.reinforcementQuestions ?? [],
      classSundayDate: row.lesson.classSundayDate,
      unlockAt: row.lesson.unlockAt,
      scheduleStatus: row.lesson.scheduleStatus,
    },
    kpis: {
      openViewed,
      openExpected,
      openPct: computePercentage(openViewed, openExpected),
      completionDone,
      completionExpected,
      completionPct: computePercentage(completionDone, completionExpected),
    },
    students: studentsTracking,
    parents: parentsTracking,
  });
});
