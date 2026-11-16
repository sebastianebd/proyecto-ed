import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classes, classTeachers, parentStudents, users } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { getPgErrorInfo, jsonError, parseBody, withErrorHandling } from "@/lib/http";
import { adminCreateUserSchema } from "@/lib/validators";

const ONLINE_WINDOW_MS = 90_000;

export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const nowMs = Date.now();
  const [userRows, teacherClasses, parentLinks] = await Promise.all([
    db.select().from(users).orderBy(desc(users.createdAt)),
    db
      .select({ teacherId: classTeachers.teacherId, classId: classes.id, className: classes.name })
      .from(classTeachers)
      .innerJoin(classes, eq(classTeachers.classId, classes.id)),
    db.select({ parentId: parentStudents.parentId, studentId: parentStudents.studentId }).from(parentStudents),
  ]);

  const items = userRows.map((u) => ({
    ...u,
    isOnline:
      u.status === "ACTIVE" && u.lastSeenAt !== null && nowMs - new Date(u.lastSeenAt).getTime() <= ONLINE_WINDOW_MS,
    classes: teacherClasses.filter((tc) => tc.teacherId === u.id).map((tc) => ({ id: tc.classId, name: tc.className })),
    childrenCount: parentLinks.filter((pl) => pl.parentId === u.id).length,
  }));

  return NextResponse.json({ items });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, adminCreateUserSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          rut: parsed.data.rut,
          fullName: parsed.data.fullName,
          email: parsed.data.email,
          phone: parsed.data.phone ?? null,
          role: parsed.data.role,
          status: "PENDING_ONBOARDING",
        })
        .returning();

      await recordAuditLog(
        {
          actorUserId: auth.user.id,
          actorRole: auth.user.role,
          action: "USER_CREATE",
          entityType: "user",
          entityId: user.id,
          details: { rut: user.rut, role: user.role },
        },
        tx,
      );
      return user;
    });

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    const pg = getPgErrorInfo(err);
    if (pg.code === "23505") {
      const isEmail = pg.constraint?.includes("email");
      return jsonError(
        409,
        isEmail ? "Ya existe un usuario registrado con ese correo" : "Ya existe un usuario registrado con ese RUT",
      );
    }
    throw err;
  }
});
