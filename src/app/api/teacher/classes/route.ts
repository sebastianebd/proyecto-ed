import { and, asc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { students } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { withErrorHandling } from "@/lib/http";
import { listAccessibleClasses } from "@/lib/teacher";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["TEACHER", "SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const accessibleClasses = await listAccessibleClasses(auth.user);
  if (accessibleClasses.length === 0) {
    return NextResponse.json({ classes: [] });
  }

  const classIds = accessibleClasses.map((c) => c.id);
  const activeStudents = await db
    .select({
      id: students.id,
      classId: students.classId,
      fullName: students.fullName,
    })
    .from(students)
    .where(and(inArray(students.classId, classIds), eq(students.status, "ACTIVE")))
    .orderBy(asc(students.fullName));

  const studentsByClass = new Map<string, { id: string; fullName: string }[]>();
  for (const s of activeStudents) {
    const list = studentsByClass.get(s.classId) ?? [];
    list.push({ id: s.id, fullName: s.fullName });
    studentsByClass.set(s.classId, list);
  }

  return NextResponse.json({
    classes: accessibleClasses.map((c) => ({
      ...c,
      students: studentsByClass.get(c.id) ?? [],
    })),
  });
});
