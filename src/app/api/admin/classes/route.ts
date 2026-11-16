import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classes, classTeachers, students, users } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { jsonError, parseBody, withErrorHandling } from "@/lib/http";
import { adminClassSchema } from "@/lib/validators";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const classRows = await db.select().from(classes).orderBy(asc(classes.createdAt));
  const teacherLinks = await db
    .select({
      classId: classTeachers.classId,
      teacherId: users.id,
      fullName: users.fullName,
      rut: users.rut,
      status: users.status,
    })
    .from(classTeachers)
    .innerJoin(users, eq(classTeachers.teacherId, users.id));

  const studentCounts = await db
    .select({ classId: students.classId, count: sql<number>`count(*)::int` })
    .from(students)
    .where(eq(students.status, "ACTIVE"))
    .groupBy(students.classId);

  const countMap = new Map(studentCounts.map((s) => [s.classId, Number(s.count)]));
  const items = classRows.map((c) => ({
    ...c,
    activeStudentsCount: countMap.get(c.id) ?? 0,
    teachers: teacherLinks.filter((t) => t.classId === c.id),
  }));

  return NextResponse.json({ items });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, adminClassSchema);
  if (!parsed.ok) return parsed.response;

  const teacherIds = [...new Set(parsed.data.teacherIds)];
  if (teacherIds.length > 0) {
    const eligibleTeachers = await db
      .select({ id: users.id, role: users.role, status: users.status })
      .from(users)
      .where(inArray(users.id, teacherIds));
    if (
      eligibleTeachers.length !== teacherIds.length ||
      eligibleTeachers.some((u) => u.status === "INACTIVE" || (u.role !== "TEACHER" && u.role !== "SUPER_ADMIN"))
    ) {
      return jsonError(400, "Solo puedes asignar usuarios activos o pendientes con rol Profesor o Super Admin");
    }
  }

  const created = await db.transaction(async (tx) => {
    const [cls] = await tx
      .insert(classes)
      .values({ name: parsed.data.name, ageRange: parsed.data.ageRange ?? null })
      .returning();

    if (teacherIds.length > 0) {
      await tx.insert(classTeachers).values(teacherIds.map((teacherId) => ({ classId: cls.id, teacherId })));
    }

    await recordAuditLog(
      {
        actorUserId: auth.user.id,
        actorRole: auth.user.role,
        action: "CLASS_CREATE",
        entityType: "class",
        entityId: cls.id,
        details: { name: cls.name, teacherCount: teacherIds.length },
      },
      tx,
    );
    return cls;
  });

  return NextResponse.json({ item: created }, { status: 201 });
});
