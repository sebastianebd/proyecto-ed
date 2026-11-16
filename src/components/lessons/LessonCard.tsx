"use client";

import { CheckCircle2, ChevronRight, Eye, Lock } from "lucide-react";
import Link from "next/link";
import { formatSantiagoDate } from "@/lib/timezone";
import type { ParentLessonSummaryItem } from "./types";

function lockedHint(lesson: ParentLessonSummaryItem): string {
  if (lesson.scheduleStatus === "PAUSED") return "Clase pausada temporalmente";
  if (lesson.scheduleStatus === "FORCE_LOCKED") return "Bloqueada temporalmente por coordinación";
  if (lesson.unlockAt) return `Se desbloquea el lunes ${formatSantiagoDate(lesson.unlockAt)}`;
  return "Próximamente";
}

export function LessonCard({
  lesson,
  eligibleCount,
}: {
  lesson: ParentLessonSummaryItem;
  eligibleCount: number;
}) {
  if (!lesson.unlocked) {
    return (
      <div
        aria-disabled="true"
        className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border bg-locked-bg px-3.5 py-3 opacity-75"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-locked">
            <Lock className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-fg">
              L{lesson.lessonNumber}: {lesson.title ?? `Lección ${lesson.lessonNumber}`}
            </p>
            <p className="text-xs text-locked">{lockedHint(lesson)}</p>
          </div>
        </div>
      </div>
    );
  }

  const completedCount = lesson.completions.length;
  const allCompleted = eligibleCount > 0 && completedCount >= eligibleCount;
  const partialCompleted = completedCount > 0 && !allCompleted;

  const completerNames = Array.from(new Set(lesson.completions.map((c) => c.completedByName)));
  const completionLabel = allCompleted
    ? `Completada por ${completerNames.join(", ")}`
    : partialCompleted
      ? `${completedCount}/${eligibleCount} completado`
      : null;

  return (
    <Link
      href={`/lecciones/${lesson.id}`}
      className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
        allCompleted
          ? "border-success/30 bg-success-bg hover:border-success/50"
          : "border-border border-l-4 border-l-primary bg-surface hover:bg-tint/40"
      }`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-fg-muted">Lección {lesson.lessonNumber}</span>
          {allCompleted ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-success">
              <CheckCircle2 className="h-3 w-3" /> {completionLabel}
            </span>
          ) : (
            <>
              <span className="rounded-full bg-tint px-2 py-0.5 text-[11px] font-semibold text-tint-text">
                {partialCompleted ? completionLabel : "Disponible"}
              </span>
              {lesson.viewed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-fg-muted">
                  <Eye className="h-3 w-3" /> Vista
                </span>
              )}
            </>
          )}
        </div>
        <p className="truncate text-sm font-bold text-fg">{lesson.title ?? `Lección ${lesson.lessonNumber}`}</p>
        {lesson.biblePassage && <p className="truncate text-xs font-medium text-fg-muted">{lesson.biblePassage}</p>}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-fg-muted" />
    </Link>
  );
}
