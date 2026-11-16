import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classes, lessons, units } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { jsonError, withErrorHandling } from "@/lib/http";
import { getTeacherClassFilterIds } from "@/lib/teacher";
import { uuidV4Schema } from "@/lib/validators";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["TEACHER", "SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const requestedClassId = new URL(req.url).searchParams.get("classId") || undefined;
  if (requestedClassId && !uuidV4Schema.safeParse(requestedClassId).success) {
    return jsonError(400, "classId inválido");
  }

  const filterResult = await getTeacherClassFilterIds(auth.user, requestedClassId);
  if (!Array.isArray(filterResult)) return filterResult;
  if (filterResult.length === 0) return NextResponse.json({ units: [] });

  // Nunca expone unidades DRAFT al profesor (docs/02 §6, docs/03 §4.2).
  const unitRows = await db
    .select({
      id: units.id,
      classId: units.classId,
      className: classes.name,
      orderNumber: units.orderNumber,
      title: units.title,
      status: units.status,
      pdfStorageKey: units.pdfStorageKey,
      createdAt: units.createdAt,
    })
    .from(units)
    .innerJoin(classes, eq(units.classId, classes.id))
    .where(and(inArray(units.classId, filterResult), inArray(units.status, ["ACTIVE", "FINISHED"])))
    .orderBy(desc(units.orderNumber), desc(units.createdAt));

  unitRows.sort((a, b) => {
    if (a.status === "ACTIVE" && b.status !== "ACTIVE") return -1;
    if (a.status !== "ACTIVE" && b.status === "ACTIVE") return 1;
    return b.orderNumber - a.orderNumber;
  });

  const unitIds = unitRows.map((u) => u.id);
  const lessonRows =
    unitIds.length > 0
      ? await db
          .select({
            id: lessons.id,
            unitId: lessons.unitId,
            lessonNumber: lessons.lessonNumber,
            title: lessons.title,
            biblePassage: lessons.biblePassage,
            parentSummary: lessons.parentSummary,
            reinforcementQuestions: lessons.reinforcementQuestions,
            classSundayDate: lessons.classSundayDate,
            unlockAt: lessons.unlockAt,
            scheduleStatus: lessons.scheduleStatus,
          })
          .from(lessons)
          .where(inArray(lessons.unitId, unitIds))
          .orderBy(asc(lessons.lessonNumber))
      : [];

  const lessonsByUnit = new Map<string, typeof lessonRows>();
  for (const l of lessonRows) {
    const arr = lessonsByUnit.get(l.unitId) ?? [];
    arr.push(l);
    lessonsByUnit.set(l.unitId, arr);
  }

  return NextResponse.json({
    units: unitRows.map((u) => ({
      id: u.id,
      classId: u.classId,
      className: u.className,
      orderNumber: u.orderNumber,
      title: u.title,
      status: u.status,
      hasPdf: Boolean(u.pdfStorageKey),
      createdAt: u.createdAt,
      lessons: (lessonsByUnit.get(u.id) ?? []).map((l) => ({
        ...l,
        parentSummary: l.parentSummary ?? [],
        reinforcementQuestions: l.reinforcementQuestions ?? [],
      })),
    })),
  });
});
