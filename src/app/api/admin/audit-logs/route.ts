import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { withErrorHandling } from "@/lib/http";
import { santiagoDayEndUtc, santiagoDayStartUtc } from "@/lib/timezone";
import { auditLogsQuerySchema } from "@/lib/validators";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const rawParams = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = auditLogsQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    return NextResponse.json({ error: "Parámetros de consulta inválidos", fields }, { status: 400 });
  }

  const { page, limit, action, actorUserId, actorRole, from, to } = parsed.data;
  const conditions: SQL[] = [];
  if (action) conditions.push(eq(auditLogs.action, action));
  if (actorUserId) conditions.push(eq(auditLogs.actorUserId, actorUserId));
  if (actorRole) conditions.push(eq(auditLogs.actorRole, actorRole));
  if (from) conditions.push(gte(auditLogs.createdAt, santiagoDayStartUtc(from)));
  if (to) conditions.push(lte(auditLogs.createdAt, santiagoDayEndUtc(to)));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (page - 1) * limit;

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        actorUserId: auditLogs.actorUserId,
        actorRole: auditLogs.actorRole,
        actorName: users.fullName,
        actorRut: users.rut,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        details: auditLogs.details,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(whereClause),
  ]);

  const total = Number(totalRows[0]?.count ?? 0);
  return NextResponse.json({
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});
