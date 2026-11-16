import { eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classes, classTeachers, users } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { jsonError, parseBody, withErrorHandling } from "@/lib/http";
import { adminUpdateClassSchema, uuidV4Schema } from "@/lib/validators";

type RouteCtx = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonError(400, "ID de clase inválido");

  const parsed = await parseBody(req, adminUpdateClassSchema);
  if (!parsed.ok) return parsed.response;

  const [existing] = await db.select().from(classes).where(eq(classes.id, id)).limit(1);
  if (!existing) return jsonError(404, "Clase no encontrada");

  const teacherIds = parsed.data.teacherIds ? [...new Set(parsed.data.teacherIds)] : undefined;
  if (teacherIds && teacherIds.length > 0) {
    const valid = await db
      .select({ id: users.id, role: users.role, status: users.status })
      .from(users)
      .where(inArray(users.id, teacherIds));
    if (
      valid.length !== teacherIds.length ||
      valid.some((u) => u.status === "INACTIVE" || (u.role !== "TEACHER" && u.role !== "SUPER_ADMIN"))
    ) {
      return jsonError(400, "Profesores asignados inválidos o inactivos");
    }
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(classes)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.ageRange !== undefined ? { ageRange: parsed.data.ageRange ?? null } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      })
      .where(eq(classes.id, id))
      .returning();

    if (teacherIds !== undefined) {
      await tx.delete(classTeachers).where(eq(classTeachers.classId, id));
      if (teacherIds.length > 0) {
        await tx.insert(classTeachers).values(teacherIds.map((teacherId) => ({ classId: id, teacherId })));
      }
    }

    await recordAuditLog(
      {
        actorUserId: auth.user.id,
        actorRole: auth.user.role,
        action: "CLASS_UPDATE",
        entityType: "class",
        entityId: id,
        details: {
          before: { name: existing.name, status: existing.status },
          after: { name: row.name, status: row.status, teacherCount: teacherIds?.length },
        },
      },
      tx,
    );
    return row;
  });

  return NextResponse.json({ item: updated });
});
