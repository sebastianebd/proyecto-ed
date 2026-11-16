import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lessonViews } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { withErrorHandling } from "@/lib/http";
import { authorizeParentLesson, loadLessonCompletionState } from "@/lib/parent";

type RouteCtx = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const { id } = await ctx.params;
  const authz = await authorizeParentLesson(req, id);
  if (!authz.ok) return authz.response;

  const { user, lesson, unit, className, eligibleChildren } = authz;

  const viewRecord = await db.transaction(async (tx) => {
    const [view] = await tx
      .insert(lessonViews)
      .values({
        lessonId: lesson.id,
        parentId: user.id,
        firstViewedAt: sql`now()`,
        lastViewedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: [lessonViews.lessonId, lessonViews.parentId],
        set: { lastViewedAt: sql`now()` },
      })
      .returning();

    await recordAuditLog(
      {
        actorUserId: user.id,
        actorRole: user.role,
        action: "LESSON_VIEW",
        entityType: "lesson",
        entityId: lesson.id,
        details: { unitId: unit.id, lessonNumber: lesson.lessonNumber },
      },
      tx,
    );

    return view;
  });

  const childrenState = await loadLessonCompletionState(lesson.id, eligibleChildren);

  return NextResponse.json({
    item: {
      id: lesson.id,
      unitId: unit.id,
      unitOrderNumber: unit.orderNumber,
      unitTitle: unit.title,
      unitStatus: unit.status,
      classId: unit.classId,
      className,
      lessonNumber: lesson.lessonNumber,
      title: lesson.title,
      biblePassage: lesson.biblePassage,
      parentSummary: lesson.parentSummary ?? [],
      reinforcementQuestions: lesson.reinforcementQuestions ?? [],
      classSundayDate: lesson.classSundayDate,
      unlockAt: lesson.unlockAt,
      scheduleStatus: lesson.scheduleStatus,
      view: {
        firstViewedAt: viewRecord.firstViewedAt,
        lastViewedAt: viewRecord.lastViewedAt,
      },
      eligibleChildren: childrenState,
    },
  });
});
