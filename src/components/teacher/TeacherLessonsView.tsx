"use client";

import { ArrowLeft, BookOpen, CheckCircle2, Clock, Download, Eye, EyeOff, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatSantiagoDate, formatSantiagoDateTime } from "@/lib/timezone";
import type { TeacherClassItem, TeacherLessonTrackingResponse, TeacherUnitItem } from "./types";

const SCHEDULE_BADGE: Record<string, string> = {
  SCHEDULED: "Programada",
  PAUSED: "Pausada para padres",
  FORCE_UNLOCKED: "Desbloqueada manual",
  FORCE_LOCKED: "Bloqueada para padres",
};

export function TeacherLessonsView() {
  const [classes, setClasses] = useState<TeacherClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("ALL");
  const [units, setUnits] = useState<TeacherUnitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingUnitId, setDownloadingUnitId] = useState<string | null>(null);

  const [tracking, setTracking] = useState<TeacherLessonTrackingResponse | null>(null);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [detailTab, setDetailTab] = useState<"content" | "tracking">("content");

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [clsRes, unitRes] = await Promise.all([fetch("/api/teacher/classes"), fetch("/api/teacher/units")]);
      const clsBody = (await clsRes.json().catch(() => ({}))) as { classes?: TeacherClassItem[]; error?: string };
      const unitBody = (await unitRes.json().catch(() => ({}))) as { units?: TeacherUnitItem[]; error?: string };

      if (!clsRes.ok || !clsBody.classes) {
        setError(clsBody.error ?? "No se pudieron cargar tus clases");
        return;
      }
      if (!unitRes.ok || !unitBody.units) {
        setError(unitBody.error ?? "No se pudieron cargar las unidades");
        return;
      }

      setClasses(clsBody.classes);
      setUnits(unitBody.units);
      if (clsBody.classes.length === 1) {
        setSelectedClassId(clsBody.classes[0].id);
      }
    } catch {
      setError("Error de conexión al cargar lecciones");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  async function handleDownloadPdf(unitId: string) {
    setDownloadingUnitId(unitId);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/units/${unitId}/pdf`);
      const body = (await res.json().catch(() => ({}))) as { url?: string; title?: string; error?: string };
      if (!res.ok || !body.url) {
        setError(body.error ?? "No se pudo obtener el enlace del PDF");
        return;
      }
      const link = document.createElement("a");
      link.href = body.url;
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError("Error de conexión al descargar el PDF");
    } finally {
      setDownloadingUnitId(null);
    }
  }

  async function openLesson(lessonId: string, initialTab: "content" | "tracking" = "content") {
    setLoadingTracking(true);
    setDetailTab(initialTab);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/lessons/${lessonId}/tracking`);
      const body = (await res.json().catch(() => ({}))) as TeacherLessonTrackingResponse & { error?: string };
      if (!res.ok || !body.lesson) {
        setError(body.error ?? "No se pudo cargar la lección");
        return;
      }
      setTracking(body);
    } catch {
      setError("Error de conexión al cargar la lección");
    } finally {
      setLoadingTracking(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-2xl bg-border/60" />
        <div className="h-48 animate-pulse rounded-2xl bg-border/60" />
      </div>
    );
  }

  if (loadingTracking || tracking) {
    const lesson = tracking?.lesson;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setTracking(null)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold text-fg hover:border-primary/40"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a lecciones
          </button>
        </div>

        {loadingTracking || !lesson || !tracking ? (
          <div className="h-56 animate-pulse rounded-2xl bg-border/60" />
        ) : (
          <>
            <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">
                {lesson.className} · Unidad {lesson.unitOrderNumber} · Lección {lesson.lessonNumber}
              </p>
              <h1 className="mt-1 text-lg font-bold text-fg">{lesson.title || `Lección ${lesson.lessonNumber}`}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                {lesson.classSundayDate && (
                  <span className="tabular-nums">Clase domingo {formatSantiagoDate(lesson.classSundayDate)}</span>
                )}
                <span className="rounded-full bg-muted-bg px-2 py-0.5 font-medium text-fg">
                  {SCHEDULE_BADGE[lesson.scheduleStatus] ?? lesson.scheduleStatus}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDetailTab("content")}
                  className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors ${
                    detailTab === "content" ? "bg-primary text-white" : "border border-border bg-bg text-fg-muted"
                  }`}
                >
                  <BookOpen className="h-4 w-4" />
                  Contenido
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab("tracking")}
                  className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors ${
                    detailTab === "tracking" ? "bg-primary text-white" : "border border-border bg-bg text-fg-muted"
                  }`}
                >
                  <Users className="h-4 w-4" />
                  Seguimiento Padres
                </button>
              </div>
            </section>

            {detailTab === "content" ? (
              <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                <div className="rounded-xl border border-tint-border bg-tint p-3.5">
                  <p className="text-xs font-bold uppercase tracking-wide text-tint-text">Pasaje Bíblico Base</p>
                  <p className="mt-0.5 text-sm font-bold text-fg">{lesson.biblePassage || "Sin pasaje"}</p>
                </div>

                <div className="space-y-2.5">
                  <h2 className="text-sm font-bold text-fg">Resumen para familias</h2>
                  {lesson.parentSummary.length > 0 ? (
                    lesson.parentSummary.map((p, idx) => (
                      <p key={idx} className="text-sm leading-relaxed text-fg">
                        {p}
                      </p>
                    ))
                  ) : (
                    <p className="text-xs text-fg-muted">Sin resumen cargado.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <h2 className="text-sm font-bold text-fg">Preguntas de refuerzo</h2>
                  <ol className="list-inside list-decimal space-y-1.5 text-sm text-fg">
                    {lesson.reinforcementQuestions.map((q, idx) => (
                      <li key={idx}>{q}</li>
                    ))}
                  </ol>
                </div>
              </section>
            ) : (
              <div className="space-y-4">
                <section className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-border bg-surface p-4">
                    <p className="text-xs font-semibold text-fg-muted">Apertura (Visto)</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{tracking.kpis.openPct}%</p>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {tracking.kpis.openViewed} de {tracking.kpis.openExpected} apoderados
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-surface p-4">
                    <p className="text-xs font-semibold text-fg-muted">Refuerzo (Completado)</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-success">{tracking.kpis.completionPct}%</p>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {tracking.kpis.completionDone} de {tracking.kpis.completionExpected} alumnos
                    </p>
                  </div>
                </section>

                <section className="space-y-2.5 rounded-2xl border border-border bg-surface p-4">
                  <h2 className="text-sm font-bold text-fg">Completado por alumno</h2>
                  {tracking.students.length === 0 ? (
                    <p className="text-xs text-fg-muted">No hay alumnos activos en esta clase.</p>
                  ) : (
                    <ul className="space-y-2">
                      {tracking.students.map((s) => (
                        <li
                          key={s.studentId}
                          className="flex items-center justify-between gap-2 rounded-xl border border-border bg-bg px-3.5 py-2.5"
                        >
                          <div>
                            <p className="text-sm font-semibold text-fg">{s.fullName}</p>
                            {s.completed ? (
                              <p className="text-xs text-success">
                                Completado por {s.completedByName}
                                {s.completedAt ? ` · ${formatSantiagoDateTime(s.completedAt)}` : ""}
                              </p>
                            ) : (
                              <p className="text-xs text-fg-muted">
                                {s.hasActiveParent ? "Pendiente" : "Sin apoderado activo vinculado"}
                              </p>
                            )}
                          </div>
                          {s.completed ? (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                          ) : (
                            <Clock className="h-5 w-5 shrink-0 text-fg-muted" />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="space-y-2.5 rounded-2xl border border-border bg-surface p-4">
                  <h2 className="text-sm font-bold text-fg">Visto por apoderado</h2>
                  {tracking.parents.length === 0 ? (
                    <p className="text-xs text-fg-muted">No hay apoderados activos vinculados a esta clase.</p>
                  ) : (
                    <ul className="space-y-2">
                      {tracking.parents.map((p) => (
                        <li
                          key={p.parentId}
                          className="flex items-center justify-between gap-2 rounded-xl border border-border bg-bg px-3.5 py-2.5"
                        >
                          <div>
                            <p className="text-sm font-semibold text-fg">{p.fullName}</p>
                            <p className="text-xs text-fg-muted">{p.studentNames.join(", ")}</p>
                            <p className={`text-xs ${p.viewed ? "text-success" : "text-fg-muted"}`}>
                              {p.viewed && p.firstViewedAt
                                ? `Visto el ${formatSantiagoDateTime(p.firstViewedAt)}`
                                : "No visto"}
                            </p>
                          </div>
                          {p.viewed ? (
                            <Eye className="h-5 w-5 shrink-0 text-success" />
                          ) : (
                            <EyeOff className="h-5 w-5 shrink-0 text-fg-muted" />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  const visibleUnits =
    selectedClassId === "ALL" ? units : units.filter((u) => u.classId === selectedClassId);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <h1 className="text-lg font-bold text-fg">Lecciones y PDF</h1>
        <p className="mt-1 text-xs text-fg-muted">
          Accede a las 14 lecciones sin bloqueo semanal, descarga el PDF original y revisa el seguimiento de padres.
        </p>

        {classes.length > 1 && (
          <select
            aria-label="Filtrar unidades por clase"
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="mt-3 min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm font-medium text-fg"
          >
            <option value="ALL">Todas mis clases</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </section>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {visibleUnits.length === 0 ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm text-fg-muted">Aún no hay unidades publicadas o finalizadas para mostrar.</p>
        </section>
      ) : (
        visibleUnits.map((unit) => (
          <section key={unit.id} className="space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      unit.status === "ACTIVE" ? "bg-tint text-tint-text" : "bg-muted-bg text-fg-muted"
                    }`}
                  >
                    {unit.status === "ACTIVE" ? "Unidad Activa" : "Finalizada"}
                  </span>
                  <span className="text-xs font-medium text-fg-muted">{unit.className}</span>
                </div>
                <h2 className="mt-1 text-base font-bold text-fg">
                  Unidad {unit.orderNumber}: {unit.title}
                </h2>
              </div>

              {unit.hasPdf && (
                <button
                  type="button"
                  disabled={downloadingUnitId === unit.id}
                  onClick={() => void handleDownloadPdf(unit.id)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {downloadingUnitId === unit.id ? "Generando..." : "Descargar PDF de la Unidad"}
                </button>
              )}
            </div>

            <ul className="space-y-2">
              {unit.lessons.map((lesson) => (
                <li key={lesson.id} className="rounded-xl border border-border bg-bg p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-primary">Lección {lesson.lessonNumber}</p>
                      <p className="font-semibold text-fg">{lesson.title || `Lección ${lesson.lessonNumber}`}</p>
                      <p className="text-xs text-fg-muted">
                        {lesson.biblePassage || "Sin pasaje"}
                        {lesson.classSundayDate ? ` · Dom ${formatSantiagoDate(lesson.classSundayDate)}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => void openLesson(lesson.id, "content")}
                        className="min-h-10 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-fg hover:border-primary/40"
                      >
                        Contenido
                      </button>
                      <button
                        type="button"
                        onClick={() => void openLesson(lesson.id, "tracking")}
                        className="min-h-10 rounded-xl bg-tint px-3 text-xs font-semibold text-tint-text hover:opacity-90"
                      >
                        Seguimiento
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
