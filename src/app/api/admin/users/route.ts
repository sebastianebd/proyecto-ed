import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { listAdminUsers } from "@/lib/admin-users";
import { recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { getPgErrorInfo, jsonError, parseBody, withErrorHandling } from "@/lib/http";
import { adminCreateUserSchema } from "@/lib/validators";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const { items, nowMs } = await listAdminUsers();
  return NextResponse.json({ items, serverNowMs: nowMs });
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
        .returning({
          id: users.id,
          rut: users.rut,
          fullName: users.fullName,
          email: users.email,
          phone: users.phone,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt,
        });

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
