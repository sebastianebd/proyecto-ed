"use client";

import { Baby, ChevronRight, HeartHandshake, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatSantiagoDate } from "@/lib/timezone";
import type { TeacherClassItem, TeacherStudentDetail } from "./types";

export function TeacherStudentsView() {
  const [classes, setClasses] = useState<TeacherClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<TeacherStudentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadClasses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/teacher/classes");
      const body = (await res.json().catch(() => ({}))) as { classes?: TeacherClassItem[]; error?: string };
      if (!res.ok || !body.classes) {
        setError(body.error ?? "No se pudieron cargar tus alumnos");
        return;
      }
      setClasses(body.classes);
      const preferred = body.classes.find((c) => c.status === "ACTIVE") ?? body.classes[0];
      if (preferred) setSelectedClassId((prev) => prev || preferred.id);
    } catch {
      setError("Error de conexión al cargar alumnos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  async function openStudent(studentId: string) {
    setLoadingDetail(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/students/${studentId}`);
      const body = (await res.json().catch(() => ({}))) as { student?: TeacherStudentDetail; error?: string };
      if (!res.ok || !body.student) {
        setError(body.error ?? "No se pudo cargar la ficha del alumno");
        return;
      }
      setDetail(body.student);
    } catch {
      setError("Error de conexión al cargar ficha");
    } finally {
      setLoadingDetail(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-2xl bg-border/60" />
        <div className="h-44 animate-pulse rounded-2xl bg-border/60" />
      </div>
    );
  }

  const currentClass = classes.find((c) => c.id === selectedClassId) ?? null;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <h1 className="text-lg font-bold text-fg">Alumnos y Ficha Interna</h1>
        <p className="mt-1 text-xs text-fg-muted">
          Toca un niño para consultar cuidados especiales, alergias y preferencias de aprendizaje.
        </p>

        {classes.length > 0 && (
          <select
            aria-label="Seleccionar clase"
            value={selectedClassId}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setDetail(null);
            }}
            className="mt-3 min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm font-medium text-fg"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.students.length} activos)
              </option>
            ))}
          </select>
        )}
      </section>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {currentClass && (
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          {currentClass.students.length === 0 ? (
            <p className="text-sm text-fg-muted">No hay alumnos activos en esta clase.</p>
          ) : (
            <ul className="space-y-2">
              {currentClass.students.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => void openStudent(s.id)}
                    className="flex min-h-12 w-full items-center justify-between rounded-xl border border-border bg-bg px-3.5 py-2.5 text-left transition-colors hover:border-primary/40"
                  >
                    <span className="flex items-center gap-2.5 font-semibold text-fg">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tint text-primary">
                        <Baby className="h-4 w-4" />
                      </span>
                      {s.fullName}
                    </span>
                    <ChevronRight className="h-4 w-4 text-fg-muted" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(loadingDetail || detail) && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary">Ficha Interna</p>
                <h2 className="mt-0.5 text-lg font-bold text-fg">
                  {loadingDetail ? "Cargando..." : detail?.fullName}
                </h2>
                {detail && <p className="text-xs text-fg-muted">{detail.className}</p>}
              </div>
              <button
                type="button"
                aria-label="Cerrar ficha"
                onClick={() => setDetail(null)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-bg text-fg-muted hover:text-fg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!loadingDetail && detail && (
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-xl border border-border bg-bg p-3">
                  <p className="text-xs font-semibold text-fg-muted">Edad / Nacimiento</p>
                  <p className="mt-0.5 font-medium tabular-nums text-fg">
                    {detail.birthDate
                      ? `${detail.ageYears ?? "—"} años (${formatSantiagoDate(detail.birthDate)})`
                      : "Sin fecha registrada"}
                  </p>
                </div>

                <div className="rounded-xl border border-tint-border bg-tint p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-tint-text">
                    <HeartHandshake className="h-4 w-4" />
                    Cuidados especiales / Alergias
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-fg">
                    {detail.specialCare || "Sin cuidados especiales registrados."}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-bg p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-fg-muted">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Preferencias de aprendizaje
                  </p>
                  {detail.preferences.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {detail.preferences.map((pref) => (
                        <span
                          key={pref}
                          className="rounded-full border border-tint-border bg-tint px-2.5 py-0.5 text-xs font-semibold text-tint-text"
                        >
                          {pref}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-fg-muted">Sin etiquetas registradas.</p>
                  )}
                  {detail.preferencesNotes && (
                    <p className="mt-2 whitespace-pre-line text-xs text-fg">{detail.preferencesNotes}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
