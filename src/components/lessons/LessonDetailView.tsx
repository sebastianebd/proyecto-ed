"use client";

import { ArrowLeft, BookOpenText, CheckCircle2, Eye, HelpCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatSantiagoDate, formatSantiagoDateTime } from "@/lib/timezone";
import { CompleteModal } from "./CompleteModal";
import type { ParentLessonChildState, ParentLessonDetail } from "./types";

export function LessonDetailView({ lessonId }: { lessonId: string }) {
  const [lesson, setLesson] = useState<ParentLessonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"complete" | "uncomplete" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/parent/lessons/${lessonId}`);
        const body = (await res.json().catch(() => ({}))) as { item?: ParentLessonDetail; error?: string };
        if (cancelled) return;
        if (!res.ok || !body.item) {
          setError(body.error ?? "No tienes acceso a esta lección");
          return;
        }
        setLesson(body.item);
      } catch {
        if (!cancelled) setError("Error de conexión al cargar la lección");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  async function handleModalConfirm(studentIds: string[]) {
    if (!lesson || !modalMode) return;
    const endpoint =
      modalMode === "complete"
        ? `/api/parent/lessons/${lesson.id}/complete`
        : `/api/parent/lessons/${lesson.id}/uncomplete`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentIds }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      eligibleChildren?: ParentLessonChildState[];
      error?: string;
    };
    if (!res.ok || !body.eligibleChildren) {
      throw new Error(body.error ?? "No se pudo guardar el cambio");
    }

    setLesson({ ...lesson, eligibleChildren: body.eligibleChildren });
    setNotice(
      modalMode === "complete"
        ? "Lección marcada como completada en casa."
        : "Lección devuelta a estado pendiente.",
    );
    setModalMode(null);
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Cargando lección">
        <div className="h-10 w-36 animate-pulse rounded-xl bg-surface" />
        <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" />
        <div className="h-48 animate-pulse rounded-2xl border border-border bg-surface" />
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm font-semibold text-danger">{error ?? "Lección no disponible"}</p>
        <Link
          href="/"
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-fg hover:bg-bg"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a unidades
        </Link>
      </section>
    );
  }

  const hasPending = lesson.eligibleChildren.some((c) => !c.completed);
  const hasCompleted = lesson.eligibleChildren.some((c) => c.completed);

  return (
    <div className="space-y-4">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-primary hover:bg-tint"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a unidades
      </Link>

      <header className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs font-semibold text-fg-muted">
          {lesson.className} · Unidad {lesson.unitOrderNumber} · Lección {lesson.lessonNumber}
          {lesson.classSundayDate ? ` · Clase ${formatSantiagoDate(lesson.classSundayDate)}` : ""}
        </p>
        <h1 className="mt-1 text-xl font-bold text-fg">{lesson.title ?? `Lección ${lesson.lessonNumber}`}</h1>

        {lesson.biblePassage && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-tint-border bg-tint px-3.5 py-2.5 text-sm font-semibold text-tint-text">
            <BookOpenText className="h-4 w-4 shrink-0" />
            <span>Pasaje bíblico base: {lesson.biblePassage}</span>
          </div>
        )}
      </header>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-bold text-fg">Resumen para conversar en familia</h2>
        <div className="mt-3 space-y-3">
          {lesson.parentSummary.map((paragraph, idx) => (
            <p key={idx} className="text-sm leading-relaxed text-fg">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
          <HelpCircle className="h-4 w-4 text-primary" /> Preguntas de refuerzo
        </h2>
        <ol className="mt-3 space-y-2.5">
          {lesson.reinforcementQuestions.map((question, idx) => (
            <li key={idx} className="rounded-xl bg-bg px-3.5 py-2.5 text-sm leading-relaxed text-fg">
              <span className="mr-1.5 font-bold text-primary">{idx + 1}.</span>
              {question}
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Eye className="h-4 w-4 text-primary" />
            Vista el {formatSantiagoDateTime(lesson.view.firstViewedAt)}
          </span>
        </div>

        <ul className="space-y-2">
          {lesson.eligibleChildren.map((child) => (
            <li
              key={child.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${
                child.completed
                  ? "border-success/30 bg-success-bg text-success"
                  : "border-border bg-bg text-fg-muted"
              }`}
            >
              <span className="font-bold">{child.fullName}</span>
              {child.completed ? (
                <span className="inline-flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="h-4 w-4" /> Completada por {child.completedByName}
                  {child.completedAt ? ` · ${formatSantiagoDateTime(child.completedAt)}` : ""}
                </span>
              ) : (
                <span>Pendiente de reforzar en casa</span>
              )}
            </li>
          ))}
        </ul>

        {notice && <p className="rounded-xl bg-success-bg px-3.5 py-2.5 text-xs font-semibold text-success">{notice}</p>}

        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          {hasPending && (
            <button
              type="button"
              onClick={() => setModalMode("complete")}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              <CheckCircle2 className="h-4 w-4" /> Marcar como completada
            </button>
          )}
          {hasCompleted && (
            <button
              type="button"
              onClick={() => setModalMode("uncomplete")}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-fg hover:bg-bg"
            >
              <RotateCcw className="h-4 w-4" /> Desmarcar completado
            </button>
          )}
        </div>
      </section>

      {modalMode && (
        <CompleteModal
          mode={modalMode}
          lessonTitle={lesson.title ?? `Lección ${lesson.lessonNumber}`}
          eligibleChildren={lesson.eligibleChildren}
          onClose={() => setModalMode(null)}
          onConfirm={handleModalConfirm}
        />
      )}
    </div>
  );
}
