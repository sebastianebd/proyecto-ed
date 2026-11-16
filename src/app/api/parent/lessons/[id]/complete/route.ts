import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lessonCompletions } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { jsonError, parseBody, withErrorHandling } from "@/lib/http";
import { authorizeParentLesson, loadLessonCompletionState, validateRequestedStudentIds } from "@/lib/parent";
import { parentCompleteLessonSchema } from "@/lib/validators";

type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const { id } = await ctx.params;
  const authz = await authorizeParentLesson(req, id);
  if (!authz.ok) return authz.response;

  const parsed = await parseBody(req, parentCompleteLessonSchema);
  if (!parsed.ok) return parsed.response;

  const { user, lesson, unit, eligibleChildren } = authz;
  const uniqueStudentIds = validateRequestedStudentIds(eligibleChildren, parsed.data.studentIds);
  if (!uniqueStudentIds) {
    return jsonError(403, "Uno o más alumnos seleccionados no corresponden a tus hijos activos en esta clase");
  }

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(lessonCompletions)
      .values(
        uniqueStudentIds.map((studentId) => ({
          lessonId: lesson.id,
          studentId,
          completedByUserId: user.id,
        })),
      )
      .onConflictDoNothing({ target: [lessonCompletions.lessonId, lessonCompletions.studentId] })
      .returning({ studentId: lessonCompletions.studentId });

    if (inserted.length > 0) {
      await recordAuditLog(
        {
          actorUserId: user.id,
          actorRole: user.role,
          action: "LESSON_COMPLETE",
          entityType: "lesson",
          entityId: lesson.id,
          details: { unitId: unit.id, lessonNumber: lesson.lessonNumber, studentIds: inserted.map((r) => r.studentId) },
        },
        tx,
      );
    }
  });

  const childrenState = await loadLessonCompletionState(lesson.id, eligibleChildren);
  return NextResponse.json({ eligibleChildren: childrenState });
});
