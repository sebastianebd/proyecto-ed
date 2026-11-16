import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { jsonError, parseBody, withErrorHandling } from "@/lib/http";
import { computeUnlockAtFromSunday } from "@/lib/timezone";
import { adminUpdateLessonSchema, uuidV4Schema } from "@/lib/validators";

type RouteCtx = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonError(400, "ID de lección inválido");

  const parsed = await parseBody(req, adminUpdateLessonSchema);
  if (!parsed.ok) return parsed.response;

  const [existing] = await db.select().from(lessons).where(eq(lessons.id, id)).limit(1);
  if (!existing) return jsonError(404, "Lección no encontrada");

  const patchValues: Partial<typeof lessons.$inferInsert> = {};
  if (parsed.data.title !== undefined) patchValues.title = parsed.data.title;
  if (parsed.data.biblePassage !== undefined) patchValues.biblePassage = parsed.data.biblePassage;
  if (parsed.data.parentSummary !== undefined) patchValues.parentSummary = parsed.data.parentSummary;
  if (parsed.data.reinforcementQuestions !== undefined) {
    patchValues.reinforcementQuestions = parsed.data.reinforcementQuestions;
  }
  if (parsed.data.classSundayDate !== undefined) {
    patchValues.classSundayDate = parsed.data.classSundayDate;
    patchValues.unlockAt = computeUnlockAtFromSunday(parsed.data.classSundayDate);
  }
  if (parsed.data.scheduleStatus !== undefined) patchValues.scheduleStatus = parsed.data.scheduleStatus;

  if (Object.keys(patchValues).length === 0) {
    return jsonError(400, "Debes enviar al menos un campo para actualizar");
  }

  const statusChanged =
    parsed.data.scheduleStatus !== undefined && parsed.data.scheduleStatus !== existing.scheduleStatus;
  const contentEdited =
    parsed.data.title !== undefined ||
    parsed.data.biblePassage !== undefined ||
    parsed.data.parentSummary !== undefined ||
    parsed.data.reinforcementQuestions !== undefined ||
    parsed.data.classSundayDate !== undefined;

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(lessons).set(patchValues).where(eq(lessons.id, id)).returning();

    if (statusChanged) {
      await recordAuditLog(
        {
          actorUserId: auth.user.id,
          actorRole: auth.user.role,
          action: "LESSON_STATUS_CHANGE",
          entityType: "lesson",
          entityId: id,
          details: { before: existing.scheduleStatus, after: row.scheduleStatus },
        },
        tx,
      );
    }

    if (contentEdited || !statusChanged) {
      await recordAuditLog(
        {
          actorUserId: auth.user.id,
          actorRole: auth.user.role,
          action: "LESSON_EDIT",
          entityType: "lesson",
          entityId: id,
          details: { lessonNumber: row.lessonNumber, title: row.title },
        },
        tx,
      );
    }
    return row;
  });

  return NextResponse.json({ item: updated });
});
