import { desc, eq } from "drizzle-orm";
import { UsersManager, type AdminUserItem } from "@/components/admin/UsersManager";
import { db } from "@/db";
import { classes, classTeachers, parentStudents, users } from "@/db/schema";
import { getServerSessionUser } from "@/lib/session-server";

const ONLINE_WINDOW_MS = 90_000;

export default async function AdminUsersPage() {
  const nowMs = Date.now();
  const [me, userRows, teacherClasses, parentLinks] = await Promise.all([
    getServerSessionUser(),
    db.select().from(users).orderBy(desc(users.createdAt)),
    db
      .select({ teacherId: classTeachers.teacherId, classId: classes.id, className: classes.name })
      .from(classTeachers)
      .innerJoin(classes, eq(classTeachers.classId, classes.id)),
    db.select({ parentId: parentStudents.parentId, studentId: parentStudents.studentId }).from(parentStudents),
  ]);

  const initialUsers: AdminUserItem[] = userRows.map((u) => ({
    id: u.id,
    rut: u.rut,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    role: u.role as AdminUserItem["role"],
    status: u.status as AdminUserItem["status"],
    lastSeenAt: u.lastSeenAt,
    isOnline:
      u.status === "ACTIVE" && u.lastSeenAt !== null && nowMs - new Date(u.lastSeenAt).getTime() <= ONLINE_WINDOW_MS,
    classes: teacherClasses.filter((tc) => tc.teacherId === u.id).map((tc) => ({ id: tc.classId, name: tc.className })),
    childrenCount: parentLinks.filter((pl) => pl.parentId === u.id).length,
  }));

  return <UsersManager initialUsers={initialUsers} currentUserId={me?.id ?? ""} />;
}
