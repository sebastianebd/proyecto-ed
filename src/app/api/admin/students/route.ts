import { asc, desc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classes, parentStudents, studentClassHistory, students, users } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { jsonError, parseBody, withErrorHandling } from "@/lib/http";
import { adminCreateStudentSchema } from "@/lib/validators";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const [studentRows, parentLinks, historyRows] = await Promise.all([
    db
      .select({
        id: students.id,
        classId: students.classId,
        className: classes.name,
        fullName: students.fullName,
        birthDate: students.birthDate,
        specialCare: students.specialCare,
        preferences: students.preferences,
        preferencesNotes: students.preferencesNotes,
        status: students.status,
        createdAt: students.createdAt,
      })
      .from(students)
      .innerJoin(classes, eq(students.classId, classes.id))
      .orderBy(asc(students.fullName)),
    db
      .select({
        studentId: parentStudents.studentId,
        parentId: users.id,
        fullName: users.fullName,
        rut: users.rut,
        status: users.status,
        relationship: parentStudents.relationship,
      })
      .from(parentStudents)
      .innerJoin(users, eq(parentStudents.parentId, users.id)),
    db
      .select({
        id: studentClassHistory.id,
        studentId: studentClassHistory.studentId,
        classId: studentClassHistory.classId,
        className: classes.name,
        assignedAt: studentClassHistory.assignedAt,
        unassignedAt: studentClassHistory.unassignedAt,
      })
      .from(studentClassHistory)
      .innerJoin(classes, eq(studentClassHistory.classId, classes.id))
      .orderBy(desc(studentClassHistory.assignedAt)),
  ]);

  const items = studentRows.map((s) => ({
    ...s,
    parents: parentLinks.filter((p) => p.studentId === s.id),
    classHistory: historyRows.filter((h) => h.studentId === s.id),
  }));

  return NextResponse.json({ items });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, adminCreateStudentSchema);
  if (!parsed.ok) return parsed.response;

  const [cls] = await db
    .select({ id: classes.id, status: classes.status })
    .from(classes)
    .where(eq(classes.id, parsed.data.classId))
    .limit(1);
  if (!cls || cls.status !== "ACTIVE") {
    return jsonError(400, "La clase seleccionada no existe o está archivada");
  }

  const uniqueParents = Array.from(new Map(parsed.data.parents.map((p) => [p.parentId, p])).values());
  if (uniqueParents.length > 0) {
    const parentIds = uniqueParents.map((p) => p.parentId);
    const foundParents = await db
      .select({ id: users.id, role: users.role, status: users.status })
      .from(users)
      .where(inArray(users.id, parentIds));
    if (
      foundParents.length !== parentIds.length ||
      foundParents.some((u) => u.role !== "PARENT" || u.status === "INACTIVE")
    ) {
      return jsonError(400, "Todos los vínculos familiares deben corresponder a padres activos o pendientes");
    }
  }

  const created = await db.transaction(async (tx) => {
    const [student] = await tx
      .insert(students)
      .values({
        classId: parsed.data.classId,
        fullName: parsed.data.fullName,
        birthDate: parsed.data.birthDate ?? null,
        specialCare: parsed.data.specialCare ?? null,
        preferences: parsed.data.preferences ?? null,
        preferencesNotes: parsed.data.preferencesNotes ?? null,
      })
      .returning();

    // Registro inicial en student_class_history desde el alta (docs/02 §3, docs/05 §3 Hito 2).
    await tx.insert(studentClassHistory).values({
      studentId: student.id,
      classId: parsed.data.classId,
    });

    if (uniqueParents.length > 0) {
      await tx.insert(parentStudents).values(
        uniqueParents.map((p) => ({
          parentId: p.parentId,
          studentId: student.id,
          relationship: p.relationship ?? null,
        })),
      );
    }

    await recordAuditLog(
      {
        actorUserId: auth.user.id,
        actorRole: auth.user.role,
        action: "STUDENT_CREATE",
        entityType: "student",
        entityId: student.id,
        details: { fullName: student.fullName, classId: student.classId, parentsCount: uniqueParents.length },
      },
      tx,
    );

    return student;
  });

  return NextResponse.json({ item: created }, { status: 201 });
});
