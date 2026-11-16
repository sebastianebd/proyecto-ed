import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classes, students } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { jsonError, withErrorHandling } from "@/lib/http";
import { assertTeacherClassAccess } from "@/lib/teacher";
import { computeAgeYears } from "@/lib/teacher-rules";
import { todayInSantiago } from "@/lib/timezone";
import { uuidV4Schema } from "@/lib/validators";

type RouteCtx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const auth = await requireAuth(req, { allowedRoles: ["TEACHER", "SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!uuidV4Schema.safeParse(id).success) {
    return jsonError(400, "ID de alumno inválido");
  }

  const [row] = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      classId: students.classId,
      className: classes.name,
      birthDate: students.birthDate,
      specialCare: students.specialCare,
      preferences: students.preferences,
      preferencesNotes: students.preferencesNotes,
      status: students.status,
    })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
    .where(eq(students.id, id))
    .limit(1);

  if (!row) return jsonError(404, "Alumno no encontrado");

  const access = await assertTeacherClassAccess(auth.user, row.classId);
  if (!access.ok) return access.response;

  return NextResponse.json({
    student: {
      ...row,
      preferences: row.preferences ?? [],
      ageYears: computeAgeYears(row.birthDate, todayInSantiago()),
    },
  });
});
