import { db, type DbOrTx } from "@/db";
import { auditLogs } from "@/db/schema";

// Catálogo unificado de docs/03-seguridad.md §8. `presence/ping` NO se audita.
export type AuditAction =
  | "OTP_REQUESTED" | "OTP_FAILED" | "LOGIN_OTP" | "ONBOARDING_COMPLETED" | "LOGOUT" | "SESSION_REVOKED"
  | "CLASS_CREATE" | "CLASS_UPDATE" | "USER_CREATE" | "USER_UPDATE" | "USER_EMAIL_CHANGED" | "USER_DEACTIVATE"
  | "STUDENT_CREATE" | "STUDENT_UPDATE" | "STUDENT_CLASS_CHANGE" | "STUDENT_DEACTIVATE"
  | "UNIT_PDF_UPLOAD" | "UNIT_ACTIVATE" | "UNIT_FINISH" | "UNIT_DELETE" | "LESSON_AI_GENERATE" | "LESSON_EDIT"
  | "UNIT_POSTPONE" | "UNIT_UNPOSTPONE" | "LESSON_STATUS_CHANGE"
  | "PDF_DOWNLOAD" | "ATTENDANCE_SAVE" | "ATTENDANCE_ADMIN_OVERRIDE" | "LESSON_VIEW" | "LESSON_COMPLETE" | "LESSON_UNCOMPLETE";

export type AuditEntry = {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  /** Nunca incluir códigos OTP, tokens de sesión ni suscripciones push completas. */
  details?: Record<string, unknown>;
};

export async function recordAuditLog(entry: AuditEntry, executor: DbOrTx = db): Promise<void> {
  await executor.insert(auditLogs).values({
    actorUserId: entry.actorUserId ?? null,
    actorRole: entry.actorRole ?? null,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    details: entry.details ?? null,
  });
}
