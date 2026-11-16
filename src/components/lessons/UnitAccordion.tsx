"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { LessonCard } from "./LessonCard";
import type { ParentUnitItem } from "./types";

export function UnitAccordion({ unit, showClassBadge }: { unit: ParentUnitItem; showClassBadge: boolean }) {
  // Unidad activa desplegada por defecto; unidades finalizadas colapsadas (docs/01 RF-15)
  const [open, setOpen] = useState(unit.status === "ACTIVE");

  const unlockedCount = unit.lessons.filter((l) => l.unlocked).length;
  const completedLessons = unit.lessons.filter(
    (l) => unit.eligibleChildren.length > 0 && l.completions.length >= unit.eligibleChildren.length,
  ).length;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-bg"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                unit.status === "ACTIVE" ? "bg-tint text-tint-text" : "bg-locked-bg text-fg-muted"
              }`}
            >
              {unit.status === "ACTIVE" ? "Unidad activa" : "Historial"}
            </span>
            {showClassBadge && (
              <span className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-fg-muted">
                {unit.className}
              </span>
            )}
          </div>
          <h2 className="truncate text-base font-bold text-fg">
            Unidad {unit.orderNumber}: {unit.title}
          </h2>
          <p className="text-xs text-fg-muted">
            {unlockedCount}/14 disponibles · {completedLessons} completadas
          </p>
        </div>
        {open ? (
          <ChevronDown className="h-5 w-5 shrink-0 text-primary" />
        ) : (
          <ChevronRight className="h-5 w-5 shrink-0 text-fg-muted" />
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t border-border bg-bg/50 p-3">
          {unit.lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} eligibleCount={unit.eligibleChildren.length} />
          ))}
        </div>
      )}
    </section>
  );
}
