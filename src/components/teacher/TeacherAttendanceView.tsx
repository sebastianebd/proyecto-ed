"use client";

import { Calendar, Check, Clock, History, Lock, MessageSquare, Save, ShieldAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/auth";
import { addCalendarDays, formatSantiagoDate, formatSantiagoDateTime, isSundayYmd } from "@/lib/timezone";
import type { AttendanceStudentRow, HistoryStudentOption, TeacherAttendanceResponse, TeacherClassItem } from "./types";

function checkSelectedSunday(dateYmd: string, defaultSundayYmd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return "Selecciona una fecha de domingo válida.";
  if (!isSundayYmd(dateYmd)) return "La fecha seleccionada debe corresponder estrictamente a un domingo.";
  if (dateYmd > defaultSundayYmd) return "No se puede registrar asistencia en un domingo futuro.";
  return null;
}

type DraftEntry = { isPresent: boolean | null; observation: string; showNote: boolean };

export function TeacherAttendanceView({
  userRole,
  defaultSundayYmd,
}: {
  userRole: Role;
  defaultSundayYmd: string;
}) {
  const [classes, setClasses] = useState<TeacherClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedDate, setSelectedDate] = useState(defaultSundayYmd);
  const [tab, setTab] = useState<"take" | "history">("take");
  const [historyMode, setHistoryMode] = useState<"dates" | "student">("dates");
  const [selectedStudentId, setSelectedStudentId] = useState("");

  const [attendanceData, setAttendanceData] = useState<TeacherAttendanceResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>({});
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    setError(null);
    try {
      const res = await fetch("/api/teacher/classes");
      const body = (await res.json().catch(() => ({}))) as { classes?: TeacherClassItem[]; error?: string };
      if (!res.ok || !body.classes) {
        setError(body.error ?? "No se pudieron cargar tus clases");
        return;
      }
      setClasses(body.classes);
      const preferred = body.classes.find((c) => c.status === "ACTIVE") ?? body.classes[0];
      if (preferred) {
        setSelectedClassId((prev) => prev || preferred.id);
        if (preferred.students[0]) {
          setSelectedStudentId((prev) => prev || preferred.students[0].id);
        }
      }
    } catch {
      setError("Error de conexión al cargar clases");
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  const loadAttendance = useCallback(
    async (classId: string, dateYmd: string, studentId?: string, includeDate = true) => {
      if (!classId) return;
      if (includeDate) {
        const dateError = checkSelectedSunday(dateYmd, defaultSundayYmd);
        if (dateError) {
          fetchAbortRef.current?.abort();
          setDrafts({});
          setAttendanceData((prev) => (prev ? { ...prev, selectedDate: null } : null));
          setError(dateError);
          return;
        }
      }

      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;

      setLoadingData(true);
      setError(null);
      try {
        const params = new URLSearchParams({ classId });
        if (includeDate) params.set("date", dateYmd);
        if (studentId) params.set("studentId", studentId);
        const res = await fetch(`/api/teacher/attendance?${params.toString()}`, {
          signal: controller.signal,
        });
        const body = (await res.json().catch(() => ({}))) as TeacherAttendanceResponse & { error?: string };
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setError(body.error ?? "No se pudo cargar la asistencia");
          return;
        }
        setAttendanceData(body);
        if (body.historyStudents?.length) {
          setSelectedStudentId((prev) =>
            prev && body.historyStudents.some((s) => s.id === prev) ? prev : body.historyStudents[0].id,
          );
        }
        const nextDrafts: Record<string, DraftEntry> = {};
        for (const r of body.selectedDate?.records ?? []) {
          nextDrafts[r.studentId] = {
            isPresent: r.isPresent,
            observation: r.observation ?? "",
            showNote: Boolean(r.observation),
          };
        }
        setDrafts(nextDrafts);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Error de conexión al cargar la asistencia");
      } finally {
        if (!controller.signal.aborted) setLoadingData(false);
      }
    },
    [defaultSundayYmd],
  );

  useEffect(() => {
    if (!selectedClassId) return;
    const includeDate = tab === "take" || checkSelectedSunday(selectedDate, defaultSundayYmd) === null;
    const studentParam = tab === "history" && historyMode === "student" ? selectedStudentId : undefined;
    void loadAttendance(selectedClassId, selectedDate, studentParam, includeDate);
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [selectedClassId, selectedDate, tab, historyMode, selectedStudentId, defaultSundayYmd, loadAttendance]);

  const dateValidationError = checkSelectedSunday(selectedDate, defaultSundayYmd);
  const isValidSelectedDate = dateValidationError === null;
  const recentSundays = [0, -7, -14, -21].map((offset) => addCalendarDays(defaultSundayYmd, offset));
  const currentClass = classes.find((c) => c.id === selectedClassId) ?? null;
  const historyStudents: HistoryStudentOption[] =
    attendanceData?.historyStudents ??
    (currentClass?.students.map((s) => ({ ...s, status: "ACTIVE", transferredOut: false })) ?? []);
  const rows: AttendanceStudentRow[] = isValidSelectedDate ? (attendanceData?.selectedDate?.records ?? []) : [];
  const canEdit = isValidSelectedDate && (attendanceData?.selectedDate?.canEdit ?? true);
  const firstCreatedAt = isValidSelectedDate ? (attendanceData?.selectedDate?.firstCreatedAt ?? null) : null;
  const editDeadlineYmd = isValidSelectedDate ? (attendanceData?.selectedDate?.editDeadlineYmd ?? null) : null;
  const withinTeacherWindow = isValidSelectedDate && (attendanceData?.selectedDate?.withinTeacherWindow ?? true);

  const markedCount = rows.filter((r) => drafts[r.studentId]?.isPresent !== null && drafts[r.studentId]?.isPresent !== undefined).length;

  function setPresence(studentId: string, isPresent: boolean) {
    if (!canEdit) return;
    setSuccessMsg(null);
    setDrafts((prev) => ({
      ...prev,
      [studentId]: {
        isPresent,
        observation: prev[studentId]?.observation ?? "",
        showNote: prev[studentId]?.showNote ?? false,
      },
    }));
  }

  function markAllPresent() {
    if (!canEdit) return;
    setSuccessMsg(null);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        next[r.studentId] = {
          isPresent: true,
          observation: prev[r.studentId]?.observation ?? "",
          showNote: prev[r.studentId]?.showNote ?? false,
        };
      }
      return next;
    });
  }

  async function handleSave() {
    if (!selectedClassId || !canEdit) return;
    const recordsToSend = rows
      .map((r) => ({
        studentId: r.studentId,
        isPresent: drafts[r.studentId]?.isPresent,
        observation: drafts[r.studentId]?.observation ?? "",
      }))
      .filter((r): r is { studentId: string; isPresent: boolean; observation: string } => typeof r.isPresent === "boolean");

    if (recordsToSend.length === 0) {
      setError("Marca al menos un alumno como Presente o Ausente antes de guardar.");
      return;
    }
    if (recordsToSend.length < rows.length) {
      setError(`Faltan ${rows.length - recordsToSend.length} alumno(s) por marcar.`);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/teacher/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedClassId,
          attendanceDate: selectedDate,
          records: recordsToSend,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; override?: boolean; savedCount?: number };
      if (!res.ok) {
        setError(body.error ?? "No se pudo guardar la asistencia");
        return;
      }
      setSuccessMsg(
        body.override
          ? `Asistencia guardada como Super Admin (${body.savedCount ?? recordsToSend.length} alumnos).`
          : `Asistencia del ${formatSantiagoDate(selectedDate)} guardada correctamente.`,
      );
      await loadAttendance(selectedClassId, selectedDate);
    } catch {
      setError("Error de conexión al guardar la asistencia");
    } finally {
      setSaving(false);
    }
  }

  if (loadingClasses) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-2xl bg-border/60" />
        <div className="h-40 animate-pulse rounded-2xl bg-border/60" />
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h1 className="text-lg font-bold text-fg">Asistencia dominical</h1>
        <p className="mt-2 text-sm text-fg-muted">No tienes clases asignadas por el momento.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-fg">Asistencia dominical</h1>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setTab("take")}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors ${
                tab === "take" ? "bg-primary text-white" : "border border-border bg-bg text-fg-muted hover:text-fg"
              }`}
            >
              <Calendar className="h-4 w-4" />
              Lista
            </button>
            <button
              type="button"
              onClick={() => setTab("history")}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors ${
                tab === "history" ? "bg-primary text-white" : "border border-border bg-bg text-fg-muted hover:text-fg"
              }`}
            >
              <History className="h-4 w-4" />
              Historial
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <div>
            <label htmlFor="att-class" className="mb-1 block text-xs font-semibold text-fg-muted">
              Clase
            </label>
            <select
              id="att-class"
              value={selectedClassId}
              onChange={(e) => {
                const cid = e.target.value;
                setSelectedClassId(cid);
                setSuccessMsg(null);
                const cls = classes.find((c) => c.id === cid);
                setSelectedStudentId(cls?.students[0]?.id ?? "");
              }}
              className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm font-medium text-fg"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.status === "ARCHIVED" ? "(Archivada)" : ""}
                </option>
              ))}
            </select>
          </div>

          {tab === "take" && (
            <div>
              <label htmlFor="att-date" className="mb-1 block text-xs font-semibold text-fg-muted">
                Domingo (dd-mm-aaaa)
              </label>
              <input
                id="att-date"
                type="date"
                max={defaultSundayYmd}
                step={7}
                value={selectedDate}
                onChange={(e) => {
                  setSuccessMsg(null);
                  setSelectedDate(e.target.value);
                }}
                className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm font-medium tabular-nums text-fg"
              />
            </div>
          )}
        </div>

        {tab === "take" && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {recentSundays.map((ymd) => (
              <button
                key={ymd}
                type="button"
                onClick={() => {
                  setSuccessMsg(null);
                  setSelectedDate(ymd);
                }}
                className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold tabular-nums transition-colors ${
                  selectedDate === ymd
                    ? "border border-tint-border bg-tint text-tint-text"
                    : "border border-border bg-bg text-fg-muted hover:text-fg"
                }`}
              >
                {formatSantiagoDate(ymd)}
              </button>
            ))}
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-success/30 bg-success-bg px-4 py-3 text-sm text-success">
          {successMsg}
        </div>
      )}

      {tab === "take" ? (
        !isValidSelectedDate ? (
          <section className="rounded-2xl border border-border bg-surface p-5 text-sm text-fg-muted">
            {dateValidationError ?? "Selecciona un domingo válido para cargar la lista de asistencia."}
          </section>
        ) : (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          {!canEdit && firstCreatedAt && (
            <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-fg">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <p className="font-bold">Solo lectura — plazo de 3 días finalizado</p>
                <p className="mt-0.5 text-fg-muted">
                  Lista creada el {formatSantiagoDateTime(firstCreatedAt)}. El plazo venció el{" "}
                  {editDeadlineYmd ? formatSantiagoDate(editDeadlineYmd) : ""}. Solicita corrección al Super Admin si es necesario.
                </p>
              </div>
            </div>
          )}

          {canEdit && firstCreatedAt && withinTeacherWindow && (
            <div className="flex items-start gap-2 rounded-xl border border-tint-border bg-tint p-3 text-xs text-tint-text">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Editable dentro de la ventana de 3 días (hasta el{" "}
                <strong>{editDeadlineYmd ? formatSantiagoDate(editDeadlineYmd) : ""}</strong>).
              </span>
            </div>
          )}

          {canEdit && userRole === "SUPER_ADMIN" && firstCreatedAt && !withinTeacherWindow && (
            <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-fg">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>
                Plazo de 3 días del profesor vencido ({editDeadlineYmd ? formatSantiagoDate(editDeadlineYmd) : ""}). Como{" "}
                <strong>Super Admin</strong> puedes corregir sin límite de tiempo.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-fg-muted">
              {rows.length} alumno(s) · {markedCount}/{rows.length} marcados
            </p>
            {canEdit && rows.length > 0 && (
              <button
                type="button"
                onClick={markAllPresent}
                className="min-h-10 rounded-xl border border-border bg-bg px-3 text-xs font-semibold text-fg hover:border-primary/50"
              >
                Marcar todos presentes
              </button>
            )}
          </div>

          {loadingData ? (
            <div className="space-y-2">
              <div className="h-16 animate-pulse rounded-xl bg-border/50" />
              <div className="h-16 animate-pulse rounded-xl bg-border/50" />
            </div>
          ) : rows.length === 0 ? (
            <p className="rounded-xl border border-border bg-bg p-4 text-sm text-fg-muted">
              No hay alumnos activos o históricos registrados para esta clase en esa fecha.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {rows.map((row) => {
                const draft = drafts[row.studentId] ?? { isPresent: null, observation: "", showNote: false };
                return (
                  <li key={row.studentId} className="rounded-xl border border-border bg-bg p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-fg">{row.fullName}</p>
                        {row.transferredOut && (
                          <span className="mt-0.5 inline-block rounded-md bg-muted-bg px-1.5 py-0.5 text-[11px] font-medium text-fg-muted">
                            Trasladado de clase
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => setPresence(row.studentId, true)}
                          className={`inline-flex min-h-11 items-center gap-1 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:opacity-60 ${
                            draft.isPresent === true
                              ? "border-success bg-success-bg text-success"
                              : "border-border bg-surface text-fg-muted hover:text-fg"
                          }`}
                        >
                          <Check className="h-4 w-4" />
                          Presente
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => setPresence(row.studentId, false)}
                          className={`inline-flex min-h-11 items-center gap-1 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:opacity-60 ${
                            draft.isPresent === false
                              ? "border-danger bg-danger-bg text-danger"
                              : "border-border bg-surface text-fg-muted hover:text-fg"
                          }`}
                        >
                          <X className="h-4 w-4" />
                          Ausente
                        </button>
                        {(canEdit || draft.observation) && (
                          <button
                            type="button"
                            aria-label={`Observación de ${row.fullName}`}
                            onClick={() =>
                              setDrafts((prev) => ({
                                ...prev,
                                [row.studentId]: { ...draft, showNote: !draft.showNote },
                              }))
                            }
                            className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border transition-colors ${
                              draft.observation
                                ? "border-tint-border bg-tint text-tint-text"
                                : "border-border bg-surface text-fg-muted hover:text-fg"
                            }`}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {draft.showNote && (
                      <div className="mt-2.5">
                        <input
                          type="text"
                          disabled={!canEdit}
                          maxLength={200}
                          placeholder="Observación opcional (máx. 200 caracteres)"
                          value={draft.observation}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [row.studentId]: { ...draft, observation: e.target.value },
                            }))
                          }
                          className="min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-xs text-fg disabled:opacity-70"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {canEdit && rows.length > 0 && (
            <button
              type="button"
              disabled={saving || loadingData}
              onClick={handleSave}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Guardando..." : "Guardar Asistencia"}
            </button>
          )}
        </section>
        )
      ) : (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHistoryMode("dates")}
              className={`min-h-10 flex-1 rounded-xl border text-xs font-semibold ${
                historyMode === "dates"
                  ? "border-tint-border bg-tint text-tint-text"
                  : "border-border bg-bg text-fg-muted"
              }`}
            >
              Por domingo
            </button>
            <button
              type="button"
              onClick={() => setHistoryMode("student")}
              className={`min-h-10 flex-1 rounded-xl border text-xs font-semibold ${
                historyMode === "student"
                  ? "border-tint-border bg-tint text-tint-text"
                  : "border-border bg-bg text-fg-muted"
              }`}
            >
              Por alumno
            </button>
          </div>

          {historyMode === "dates" ? (
            attendanceData?.recordedDates.length ? (
              <ul className="space-y-2">
                {attendanceData.recordedDates.map((d) => (
                  <li key={d.attendanceDate}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate(d.attendanceDate);
                        setTab("take");
                      }}
                      className="flex min-h-12 w-full items-center justify-between rounded-xl border border-border bg-bg px-3.5 py-2.5 text-left hover:border-primary/40"
                    >
                      <div>
                        <p className="text-sm font-bold tabular-nums text-fg">
                          Domingo {formatSantiagoDate(d.attendanceDate)}
                        </p>
                        <p className="text-xs text-fg-muted">
                          {d.canEdit ? "Editable" : "Solo lectura"}
                          {d.editDeadlineYmd ? ` · plazo ${formatSantiagoDate(d.editDeadlineYmd)}` : ""}
                        </p>
                      </div>
                      <span className="rounded-full bg-success-bg px-2.5 py-1 text-xs font-bold tabular-nums text-success">
                        {d.presentCount}/{d.totalCount} presentes
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-muted">Aún no hay domingos con asistencia registrada en esta clase.</p>
            )
          ) : (
            <div className="space-y-3">
              <select
                aria-label="Seleccionar alumno"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm font-medium text-fg"
              >
                {historyStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                    {s.transferredOut ? " (Trasladado)" : s.status !== "ACTIVE" ? " (Inactivo)" : ""}
                  </option>
                ))}
              </select>

              {attendanceData?.studentHistory?.records.length ? (
                <ul className="space-y-2">
                  {attendanceData.studentHistory.records.map((rec) => (
                    <li
                      key={rec.attendanceDate}
                      className="flex items-start justify-between gap-2 rounded-xl border border-border bg-bg px-3.5 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-semibold tabular-nums text-fg">
                          {formatSantiagoDate(rec.attendanceDate)}
                        </p>
                        {rec.observation && <p className="mt-0.5 text-xs text-fg-muted">{rec.observation}</p>}
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          rec.isPresent ? "bg-success-bg text-success" : "bg-danger-bg text-danger"
                        }`}
                      >
                        {rec.isPresent ? "Presente" : "Ausente"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-muted">Este alumno no tiene registros de asistencia aún en esta clase.</p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
