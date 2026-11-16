import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { withErrorHandling } from "@/lib/http";

// Presencia en vivo sin audit log (docs/02 §2.3, docs/03 §3.3 y §8).
// Requiere status === 'ACTIVE' (requireAuth sin allowOnboarding responde 403 en PENDING_ONBOARDING).
export const POST = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  await db
    .update(users)
    .set({ lastSeenAt: sql`now()` })
    .where(and(eq(users.id, auth.user.id), eq(users.status, "ACTIVE")));

  return NextResponse.json({ ok: true });
});
