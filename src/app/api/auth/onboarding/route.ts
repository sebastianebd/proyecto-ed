import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { parseBody, withErrorHandling } from "@/lib/http";
import { onboardingSchema } from "@/lib/validators";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowOnboarding: true });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, onboardingSchema);
  if (!parsed.ok) return parsed.response;

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({
        fullName: parsed.data.fullName,
        phone: parsed.data.phone ?? null,
        status: "ACTIVE",
        onboardedAt: sql`COALESCE(onboarded_at, now())`,
        lastSeenAt: sql`now()`,
      })
      .where(and(eq(users.id, auth.user.id), eq(users.status, "PENDING_ONBOARDING")))
      .returning({
        id: users.id,
        rut: users.rut,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        role: users.role,
        status: users.status,
      });

    if (!row) return null;

    await recordAuditLog(
      {
        actorUserId: auth.user.id,
        actorRole: auth.user.role,
        action: "ONBOARDING_COMPLETED",
        entityType: "user",
        entityId: auth.user.id,
      },
      tx,
    );
    return row;
  });

  if (!updated) {
    return NextResponse.json({ ok: true, user: auth.user });
  }
  return NextResponse.json({ ok: true, user: updated });
});
