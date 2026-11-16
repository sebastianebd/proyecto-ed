import { asc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classes, lessons, units } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { jsonError, withErrorHandling } from "@/lib/http";
import { uuidV4Schema } from "@/lib/validators";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const classId = new URL(req.url).searchParams.get("classId") || undefined;
  if (classId && !uuidV4Schema.safeParse(classId).success) {
    return jsonError(400, "classId inválido");
  }

  const unitRows = await db
    .select({
      id: units.id,
      classId: units.classId,
      className: classes.name,
      orderNumber: units.orderNumber,
      title: units.title,
      pdfStorageKey: units.pdfStorageKey,
      status: units.status,
      createdAt: units.createdAt,
    })
    .from(units)
    .innerJoin(classes, eq(units.classId, classes.id))
    .where(classId ? eq(units.classId, classId) : undefined)
    .orderBy(asc(units.classId), asc(units.orderNumber), asc(units.createdAt));

  const unitIds = unitRows.map((u) => u.id);
  const lessonRows =
    unitIds.length > 0
      ? await db
          .select()
          .from(lessons)
          .where(inArray(lessons.unitId, unitIds))
          .orderBy(asc(lessons.lessonNumber))
      : [];

  const items = unitRows.map((u) => ({
    ...u,
    lessons: lessonRows.filter((l) => l.unitId === u.id),
  }));

  return NextResponse.json({ items });
});
