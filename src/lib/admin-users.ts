import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { classes, classTeachers, parentStudents, users } from "@/db/schema";

const ONLINE_WINDOW_MS = 90_000;

export type AdminUserListItem = {
  id: string;
  rut: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: "SUPER_ADMIN" | "TEACHER" | "PARENT";
  status: "PENDING_ONBOARDING" | "ACTIVE" | "INACTIVE";
  lastSeenAt: string | null;
  isOnline: boolean;
  classes: { id: string; name: string }[];
  childrenCount: number;
};

/** Consulta compartida con proyección explícita (reutilizada por SSR y GET /api/admin/users). */
export async function listAdminUsers(nowMs: number = Date.now()): Promise<{ items: AdminUserListItem[]; nowMs: number }> {
  const [userRows, teacherClasses, parentLinks] = await Promise.all([
    db
      .select({
        id: users.id,
        rut: users.rut,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        role: users.role,
        status: users.status,
        lastSeenAt: users.lastSeenAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt)),
    db
      .select({ teacherId: classTeachers.teacherId, classId: classes.id, className: classes.name })
      .from(classTeachers)
      .innerJoin(classes, eq(classTeachers.classId, classes.id)),
    db.select({ parentId: parentStudents.parentId, studentId: parentStudents.studentId }).from(parentStudents),
  ]);

  const items: AdminUserListItem[] = userRows.map((u) => ({
    id: u.id,
    rut: u.rut,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    role: u.role as AdminUserListItem["role"],
    status: u.status as AdminUserListItem["status"],
    lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
    isOnline:
      u.status === "ACTIVE" && u.lastSeenAt !== null && nowMs - new Date(u.lastSeenAt).getTime() <= ONLINE_WINDOW_MS,
    classes: teacherClasses.filter((tc) => tc.teacherId === u.id).map((tc) => ({ id: tc.classId, name: tc.className })),
    childrenCount: parentLinks.filter((pl) => pl.parentId === u.id).length,
  }));

  return { items, nowMs };
}
