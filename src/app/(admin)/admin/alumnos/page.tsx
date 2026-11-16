import { asc, desc, eq } from "drizzle-orm";
import { StudentsManager, type AdminStudentItem } from "@/components/admin/StudentsManager";
import { db } from "@/db";
import { classes, parentStudents, studentClassHistory, students, users } from "@/db/schema";

export default async function AdminStudentsPage() {
  const [studentRows, parentLinks, historyRows, classOptions, parentOptions] = await Promise.all([
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
    db.select({ id: classes.id, name: classes.name, status: classes.status }).from(classes).orderBy(asc(classes.createdAt)),
    db
      .select({ id: users.id, fullName: users.fullName, rut: users.rut, status: users.status })
      .from(users)
      .where(eq(users.role, "PARENT"))
      .orderBy(asc(users.fullName)),
  ]);

  const initialStudents: AdminStudentItem[] = studentRows.map((s) => ({
    ...s,
    parents: parentLinks.filter((p) => p.studentId === s.id),
    classHistory: historyRows
      .filter((h) => h.studentId === s.id)
      .map((h) => ({
        id: h.id,
        classId: h.classId,
        className: h.className,
        assignedAt: h.assignedAt.toISOString(),
        unassignedAt: h.unassignedAt ? h.unassignedAt.toISOString() : null,
      })),
  }));

  return (
    <StudentsManager
      initialStudents={initialStudents}
      classOptions={classOptions}
      parentOptions={parentOptions.filter((p) => p.status !== "INACTIVE")}
    />
  );
}
