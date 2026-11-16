import { asc, eq, inArray, sql } from "drizzle-orm";
import { ClassesManager } from "@/components/admin/ClassesManager";
import { db } from "@/db";
import { classes, classTeachers, students, users } from "@/db/schema";

export default async function AdminClassesPage() {
  const [classRows, teacherLinks, studentCounts, teacherOptions] = await Promise.all([
    db.select().from(classes).orderBy(asc(classes.createdAt)),
    db
      .select({
        classId: classTeachers.classId,
        id: users.id,
        fullName: users.fullName,
        rut: users.rut,
        status: users.status,
      })
      .from(classTeachers)
      .innerJoin(users, eq(classTeachers.teacherId, users.id)),
    db
      .select({ classId: students.classId, count: sql<number>`count(*)::int` })
      .from(students)
      .where(eq(students.status, "ACTIVE"))
      .groupBy(students.classId),
    db
      .select({ id: users.id, fullName: users.fullName, role: users.role, status: users.status })
      .from(users)
      .where(inArray(users.role, ["TEACHER", "SUPER_ADMIN"]))
      .orderBy(asc(users.fullName)),
  ]);

  const countMap = new Map(studentCounts.map((s) => [s.classId, Number(s.count)]));
  const initialClasses = classRows.map((c) => ({
    ...c,
    activeStudentsCount: countMap.get(c.id) ?? 0,
    teachers: teacherLinks.filter((t) => t.classId === c.id),
  }));

  return (
    <ClassesManager
      initialClasses={initialClasses}
      teacherOptions={teacherOptions.filter((t) => t.status !== "INACTIVE")}
    />
  );
}
