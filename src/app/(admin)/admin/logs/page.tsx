import { asc, desc, eq, sql } from "drizzle-orm";
import { AuditLogsViewer, type AuditLogItem } from "@/components/admin/AuditLogsViewer";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";

const INITIAL_LIMIT = 25;

export default async function AdminLogsPage() {
  const [rows, totalRows, userOptions] = await Promise.all([
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
      .orderBy(desc(auditLogs.createdAt))
      .limit(INITIAL_LIMIT),
    db.select({ count: sql<number>`count(*)::int` }).from(auditLogs),
    db.select({ id: users.id, fullName: users.fullName, role: users.role }).from(users).orderBy(asc(users.fullName)),
  ]);

  const total = Number(totalRows[0]?.count ?? 0);
  const initialItems: AuditLogItem[] = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <AuditLogsViewer
      initialItems={initialItems}
      initialTotal={total}
      initialTotalPages={Math.max(1, Math.ceil(total / INITIAL_LIMIT))}
      userOptions={userOptions}
    />
  );
}
