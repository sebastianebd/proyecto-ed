import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classes, classTeachers, parentStudents, students } from "@/db/schema";
import type { AuthUser } from "@/lib/auth";

export type LinkedChild = {
  id: string;
  fullName: string;
  classId: string;
  className: string;
  status: string;
  relationship: string | null;
};

export type AssignedClass = {
  id: string;
  name: string;
  ageRange: string | null;
  status: string;
};

export type UserProfile = AuthUser & {
  children: LinkedChild[];
  classes: AssignedClass[];
};

/** Enriquece la sesión con hijos vinculados (PARENT) y clases asignadas (TEACHER / SUPER_ADMIN). */
export async function loadUserProfile(user: AuthUser): Promise<UserProfile> {
  const [children, assigned] = await Promise.all([
    user.role === "PARENT"
      ? db
          .select({
            id: students.id,
            fullName: students.fullName,
            classId: students.classId,
            className: classes.name,
            status: students.status,
            relationship: parentStudents.relationship,
          })
          .from(parentStudents)
          .innerJoin(students, eq(parentStudents.studentId, students.id))
          .innerJoin(classes, eq(students.classId, classes.id))
          .where(eq(parentStudents.parentId, user.id))
      : Promise.resolve([]),
    user.role === "TEACHER" || user.role === "SUPER_ADMIN"
      ? db
          .select({
            id: classes.id,
            name: classes.name,
            ageRange: classes.ageRange,
            status: classes.status,
          })
          .from(classTeachers)
          .innerJoin(classes, eq(classTeachers.classId, classes.id))
          .where(eq(classTeachers.teacherId, user.id))
      : Promise.resolve([]),
  ]);

  return { ...user, children, classes: assigned };
}
