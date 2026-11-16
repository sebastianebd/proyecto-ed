"use client";

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { MAX_PDF_BYTES } from "@/lib/storage-constants";
import { formatSantiagoDate, isSundayYmd } from "@/lib/timezone";
import { adminUpdateLessonSchema, unitTitleSchema } from "@/lib/validators";

export type AdminLessonItem = {
  id: string;
  unitId: string;
  lessonNumber: number;
  title: string | null;
  biblePassage: string | null;
  parentSummary: string[] | null;
  reinforcementQuestions: string[] | null;
  classSundayDate: string | null;
  unlockAt: string | null;
  scheduleStatus: "SCHEDULED" | "PAUSED" | "FORCE_UNLOCKED" | "FORCE_LOCKED";
  pushSent: boolean;
};

export type AdminUnitItem = {
  id: string;
  classId: string;
  className: string;
  orderNumber: number;
  title: string;
  pdfStorageKey: string | null;
  status: "DRAFT" | "ACTIVE" | "FINISHED";
  createdAt: string;
  lessons: AdminLessonItem[];
};

type ClassOption = { id: string; name: string; status: string };

const STATUS_BADGE: Record<AdminUnitItem["status"], { label: string; cls: string }> = {
  DRAFT: { label: "Borrador", cls: "bg-tint text-warning border border-tint-border" },
  ACTIVE: { label: "Activa", cls: "bg-success-bg text-success" },
  FINISHED: { label: "Finalizada", cls: "bg-locked-bg text-locked" },
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function UnitsManager({
  initialUnits,
  classOptions,
}: {
  initialUnits: AdminUnitItem[];
  classOptions: ClassOption[];
}) {
  const [unitsList, setUnitsList] = useState<AdminUnitItem[]>(initialUnits);
  const activeClasses = classOptions.filter((c) => c.status === "ACTIVE");

  const [classId, setClassId] = useState(activeClasses[0]?.id ?? "");
  const [orderNumber, setOrderNumber] = useState(1);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [selectedUnitId, setSelectedUnitId] = useState<string>(initialUnits[0]?.id ?? "");
  const [draftTexts, setDraftTexts] = useState<Record<string, string>>({});
  const [failedLessonIds, setFailedLessonIds] = useState<string[]>([]);
  const [aiProgress, setAiProgress] = useState<string | null>(null);
  const [scannedWarning, setScannedWarning] = useState(false);

  const [startSundayDate, setStartSundayDate] = useState("");
  const [shiftFromLesson, setShiftFromLesson] = useState<string>("");
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);

  // Campos temporales del editor de lección
  const [lTitle, setLTitle] = useState("");
  const [lPassage, setLPassage] = useState("");
  const [lSummary, setLSummary] = useState("");
  const [lQuestions, setLQuestions] = useState("");
  const [lSunday, setLSunday] = useState("");
  const [lStatus, setLStatus] = useState<AdminLessonItem["scheduleStatus"]>("SCHEDULED");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedUnit = unitsList.find((u) => u.id === selectedUnitId) ?? null;

  async function reloadUnits(focusUnitId?: string) {
    const res = await fetch("/api/admin/units");
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "No se pudieron cargar las unidades");
    }
    const data = (await res.json()) as { items: AdminUnitItem[] };
    setUnitsList(data.items);
    if (focusUnitId) setSelectedUnitId(focusUnitId);
    else if (data.items.length > 0 && !data.items.some((u) => u.id === selectedUnitId)) {
      setSelectedUnitId(data.items[0].id);
    }
  }

  async function uploadAndProcess(params: { unitId?: string; selectedFile: File }) {
    const selectedFile = params.selectedFile;
    if (!selectedFile.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("El archivo debe tener extensión .pdf");
    }
    if (selectedFile.size > MAX_PDF_BYTES) {
      throw new Error("El PDF supera el tamaño máximo de 25 MB");
    }

    const reqPayload = params.unitId
      ? { unitId: params.unitId, fileName: selectedFile.name }
      : { classId, orderNumber, title, fileName: selectedFile.name };

    const urlRes = await fetch("/api/admin/units/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqPayload),
    });
    const urlBody = (await urlRes.json().catch(() => ({}))) as {
      unitId?: string;
      storageKey?: string;
      signedUrl?: string;
      error?: string;
    };
    if (!urlRes.ok || !urlBody.signedUrl || !urlBody.unitId || !urlBody.storageKey) {
      throw new Error(urlBody.error ?? "No se pudo preparar la subida del PDF");
    }

    // Subida directa del navegador a Supabase Storage (respeta límite 4.5 MB de Vercel)
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", selectedFile);
    const putRes = await fetch(urlBody.signedUrl, {
      method: "PUT",
      headers: { "x-upsert": "false" },
      body: form,
    });
    if (!putRes.ok) {
      throw new Error("Storage rechazó la subida directa del PDF (verifica tamaño <= 25 MB y MIME PDF)");
    }

    const procRes = await fetch(`/api/admin/units/${urlBody.unitId}/process-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageKey: urlBody.storageKey }),
    });
    const procBody = (await procRes.json().catch(() => ({}))) as {
      scannedWarning?: boolean;
      totalPages?: number;
      drafts?: { lessonId: string; rawText: string }[];
      error?: string;
    };
    if (!procRes.ok || !procBody.drafts) {
      throw new Error(procBody.error ?? "No se pudo procesar el PDF");
    }

    const map: Record<string, string> = {};
    for (const d of procBody.drafts) map[d.lessonId] = d.rawText;
    setDraftTexts((prev) => ({ ...prev, ...map }));
    setScannedWarning(Boolean(procBody.scannedWarning));
    setFailedLessonIds([]);
    await reloadUnits(urlBody.unitId);
    return { unitId: urlBody.unitId, scannedWarning: Boolean(procBody.scannedWarning) };
  }

  async function handleCreateUnit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const titleCheck = unitTitleSchema.safeParse(title);
    if (!titleCheck.success) {
      setError(titleCheck.error.issues[0]?.message ?? "Título inválido");
      return;
    }
    if (!file) {
      setError("Selecciona el archivo PDF único de 14 lecciones");
      return;
    }

    setBusy(true);
    try {
      const res = await uploadAndProcess({ selectedFile: file });
      setTitle("");
      setFile(null);
      setNotice(
        res.scannedWarning
          ? "Unidad creada, pero el PDF parece escaneado: pega el texto de cada lección o edítalas manualmente."
          : "PDF procesado y separado en 14 borradores listos para generar con IA.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error subiendo el PDF");
    } finally {
      setBusy(false);
    }
  }

  async function handleReplaceDraftPdf(newFile: File) {
    if (!selectedUnit) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await uploadAndProcess({ unitId: selectedUnit.id, selectedFile: newFile });
      setNotice("PDF del borrador reemplazado correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reemplazar PDF");
    } finally {
      setBusy(false);
    }
  }

  async function runAiBatch(lessonSubset: AdminLessonItem[]) {
    if (!selectedUnit) return;
    const targets = lessonSubset.filter((l) => (draftTexts[l.id] ?? "").trim().length >= 30);
    if (targets.length === 0) {
      setError("No hay lecciones con texto suficiente (>= 30 caracteres) para generar con IA.");
      return;
    }

    setError(null);
    setNotice(null);
    setBusy(true);
    const failures: string[] = [];

    try {
      for (let i = 0; i < targets.length; i++) {
        const l = targets[i];
        setAiProgress(`Generando con IA: lección ${l.lessonNumber} (${i + 1}/${targets.length})...`);
        try {
          const res = await fetch(`/api/admin/lessons/${l.id}/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rawText: draftTexts[l.id], hintTitle: l.title ?? undefined }),
          });
          if (!res.ok) failures.push(l.id);
        } catch {
          failures.push(l.id);
        }
        if (i + 1 < targets.length) await sleep(4200);
      }

      await reloadUnits(selectedUnit.id);
      setFailedLessonIds(failures);
      if (failures.length > 0) {
        setError(`Se completaron ${targets.length - failures.length} lecciones; fallaron ${failures.length}. Usa "Reintentar fallidas".`);
      } else {
        setNotice(`Generación IA completada (${targets.length}/${targets.length} lecciones).`);
      }
    } finally {
      setAiProgress(null);
      setBusy(false);
    }
  }

  async function handleGenerateSingle(lesson: AdminLessonItem) {
    const raw = (draftTexts[lesson.id] ?? "").trim();
    if (raw.length < 30) {
      setError(`Pega al menos 30 caracteres en el texto base de la Lección ${lesson.lessonNumber}.`);
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/lessons/${lesson.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: raw, hintTitle: lesson.title ?? undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? `Falló la generación de la lección ${lesson.lessonNumber}`);
        return;
      }
      setFailedLessonIds((prev) => prev.filter((id) => id !== lesson.id));
      await reloadUnits(lesson.unitId);
      setNotice(`Lección ${lesson.lessonNumber} generada con IA.`);
    } catch {
      setError("Error de conexión al generar con IA");
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignDates() {
    if (!selectedUnit) return;
    setError(null);
    setNotice(null);
    if (!startSundayDate || !isSundayYmd(startSundayDate)) {
      setError("La fecha de inicio de la Unidad debe ser un domingo.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/units/${selectedUnit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startSundayDate }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "No se pudieron asignar los domingos");
        return;
      }
      await reloadUnits(selectedUnit.id);
      setNotice("Se asignaron los 14 domingos consecutivos (desbloqueo lunes 00:01 Chile).");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnitStatus(nextStatus: "ACTIVE" | "FINISHED") {
    if (!selectedUnit) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/units/${selectedUnit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "No se pudo cambiar el estado de la unidad");
        return;
      }
      await reloadUnits(selectedUnit.id);
      setNotice(nextStatus === "ACTIVE" ? "Unidad publicada y activa para padres/profesores." : "Unidad finalizada y movida al historial.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteDraft() {
    if (!selectedUnit || selectedUnit.status !== "DRAFT") return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/units/${selectedUnit.id}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "No se pudo eliminar el borrador");
        return;
      }
      setSelectedUnitId("");
      await reloadUnits();
      setNotice("Borrador eliminado junto con su PDF en Storage.");
    } finally {
      setBusy(false);
    }
  }

  async function handleShiftSchedule(direction: "postpone" | "unpostpone") {
    if (!selectedUnit) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const payload = shiftFromLesson ? { fromLessonNumber: Number(shiftFromLesson) } : {};
      const res = await fetch(`/api/admin/units/${selectedUnit.id}/${direction}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; fromLessonNumber?: number; shiftedCount?: number };
      if (!res.ok) {
        setError(body.error ?? "No se pudo reprogramar el calendario");
        return;
      }
      await reloadUnits(selectedUnit.id);
      setNotice(
        direction === "postpone"
          ? `Calendario corrido +7 días desde Lección ${body.fromLessonNumber} (${body.shiftedCount} lecciones).`
          : `Calendario revertido -7 días desde Lección ${body.fromLessonNumber} (${body.shiftedCount} lecciones).`,
      );
    } finally {
      setBusy(false);
    }
  }

  function startLessonEdit(l: AdminLessonItem) {
    setEditingLessonId(l.id);
    setLTitle(l.title ?? "");
    setLPassage(l.biblePassage ?? "");
    setLSummary((l.parentSummary ?? []).join("\n\n"));
    setLQuestions((l.reinforcementQuestions ?? []).join("\n"));
    setLSunday(l.classSundayDate ?? "");
    setLStatus(l.scheduleStatus);
    setError(null);
    setNotice(null);
  }

  async function saveLessonEdit(lessonId: string) {
    setError(null);
    setNotice(null);
    const summaryArr = lSummary
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const questionsArr = lQuestions
      .split("\n")
      .map((q) => q.trim())
      .filter((q) => q.length > 0);

    const payload: Record<string, unknown> = {
      title: lTitle,
      biblePassage: lPassage,
      parentSummary: summaryArr,
      reinforcementQuestions: questionsArr,
      scheduleStatus: lStatus,
    };
    if (lSunday.trim() !== "") payload.classSundayDate = lSunday.trim();

    const parsed = adminUpdateLessonSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los campos de la lección");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/admin/lessons/${lessonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "No se pudo guardar la lección");
        return;
      }
      setEditingLessonId(null);
      if (selectedUnit) await reloadUnits(selectedUnit.id);
      setNotice("Lección guardada.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadPdf(unitId: string) {
    setError(null);
    const res = await fetch(`/api/teacher/units/${unitId}/pdf`);
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) {
      setError(body.error ?? "No se pudo obtener enlace de descarga");
      return;
    }
    window.location.assign(body.url);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h1 className="text-lg font-bold text-fg">Nueva Unidad (PDF único de 14 lecciones)</h1>
        <form onSubmit={handleCreateUnit} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="unit-class" className="mb-1 block text-xs font-semibold text-fg">
                Clase
              </label>
              <select
                id="unit-class"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm text-fg"
              >
                {activeClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="unit-order" className="mb-1 block text-xs font-semibold text-fg">
                N° Unidad
              </label>
              <input
                id="unit-order"
                type="number"
                min={1}
                max={100}
                value={orderNumber}
                onChange={(e) => setOrderNumber(Number(e.target.value))}
                className="min-h-11 w-full rounded-xl border border-border px-3 text-sm tabular-nums text-fg"
              />
            </div>
          </div>

          <div>
            <label htmlFor="unit-title" className="mb-1 block text-xs font-semibold text-fg">
              Título de la unidad
            </label>
            <input
              id="unit-title"
              type="text"
              maxLength={100}
              required
              placeholder="Ej. Unidad 1: Héroes de la Fe"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-border px-3.5 text-sm text-fg"
            />
          </div>

          <div>
            <label htmlFor="unit-pdf" className="mb-1 block text-xs font-semibold text-fg">
              Archivo PDF (máx. 25 MB)
            </label>
            <input
              id="unit-pdf"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-fg-muted file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-tint file:px-4 file:font-semibold file:text-tint-text"
            />
          </div>

          <button
            type="submit"
            disabled={busy || !classId}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            Subir PDF y extraer 14 borradores
          </button>
        </form>
      </section>

      {aiProgress && (
        <div className="flex items-center gap-2 rounded-2xl border border-tint-border bg-tint p-4 text-sm font-semibold text-tint-text">
          <Loader2 className="h-4 w-4 animate-spin" />
          {aiProgress}
        </div>
      )}
      {scannedWarning && (
        <div className="flex items-start gap-2 rounded-2xl border border-tint-border bg-tint p-4 text-xs text-tint-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>El PDF parece escaneado (sin texto seleccionable). Pega manualmente el texto por lección o edítalas directo.</p>
        </div>
      )}
      {error && <p className="rounded-2xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>}
      {notice && <p className="rounded-2xl bg-success-bg px-4 py-3 text-sm font-medium text-success">{notice}</p>}

      {unitsList.length > 0 && (
        <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-fg">Administrar Unidad</h2>
            <select
              aria-label="Seleccionar unidad"
              value={selectedUnitId}
              onChange={(e) => {
                setSelectedUnitId(e.target.value);
                setEditingLessonId(null);
              }}
              className="min-h-11 flex-1 rounded-xl border border-border bg-bg px-3 text-sm font-medium text-fg sm:max-w-xs"
            >
              {unitsList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.className} · U{u.orderNumber}: {u.title} ({STATUS_BADGE[u.status].label})
                </option>
              ))}
            </select>
          </div>

          {selectedUnit && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg p-3.5 text-xs">
                <div>
                  <p className="text-sm font-bold text-fg">
                    Unidad {selectedUnit.orderNumber}: {selectedUnit.title}
                  </p>
                  <p className="text-fg-muted">
                    {selectedUnit.className} · PDF: {selectedUnit.pdfStorageKey ? "Cargado" : "Pendiente"}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 font-semibold ${STATUS_BADGE[selectedUnit.status].cls}`}>
                  {STATUS_BADGE[selectedUnit.status].label}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedUnit.status === "DRAFT" && (
                  <>
                    <label className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-fg hover:bg-bg">
                      <FileUp className="h-4 w-4 text-primary" />
                      Reemplazar PDF
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleReplaceDraftPdf(f);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleUnitStatus("ACTIVE")}
                      className="flex min-h-11 items-center gap-1.5 rounded-xl bg-success px-4 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Publicar / Activar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDeleteDraft()}
                      className="flex min-h-11 items-center gap-1.5 rounded-xl border border-danger/30 bg-danger-bg px-3 text-xs font-semibold text-danger"
                    >
                      <Trash2 className="h-4 w-4" /> Eliminar borrador
                    </button>
                  </>
                )}

                {(selectedUnit.status === "ACTIVE" || selectedUnit.status === "FINISHED") && selectedUnit.pdfStorageKey && (
                  <button
                    type="button"
                    onClick={() => void handleDownloadPdf(selectedUnit.id)}
                    className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-fg hover:bg-bg"
                  >
                    <Download className="h-4 w-4 text-primary" /> Descargar PDF
                  </button>
                )}

                {selectedUnit.status === "ACTIVE" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleUnitStatus("FINISHED")}
                    className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-fg-muted hover:bg-bg"
                  >
                    Finalizar unidad
                  </button>
                )}
              </div>

              {selectedUnit.status !== "FINISHED" && (
                <div className="grid gap-3 rounded-xl border border-border bg-bg p-3.5 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold text-fg">1. Asignar 14 domingos consecutivos</p>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="date"
                        aria-label="Domingo de inicio"
                        value={startSundayDate}
                        onChange={(e) => setStartSundayDate(e.target.value)}
                        className="min-h-11 flex-1 rounded-xl border border-border bg-surface px-3 text-xs tabular-nums text-fg"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleAssignDates()}
                        className="min-h-11 rounded-xl bg-primary px-3 text-xs font-semibold text-white"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-fg">2. Pausar o revertir calendario (+7 / -7 días)</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <select
                        aria-label="Desde qué lección"
                        value={shiftFromLesson}
                        onChange={(e) => setShiftFromLesson(e.target.value)}
                        className="min-h-11 rounded-xl border border-border bg-surface px-2.5 text-xs text-fg"
                      >
                        <option value="">Automático (próxima)</option>
                        {selectedUnit.lessons.map((l) => (
                          <option key={l.id} value={l.lessonNumber}>
                            Desde L{l.lessonNumber}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleShiftSchedule("postpone")}
                        className="flex min-h-11 items-center gap-1 rounded-xl border border-tint-border bg-tint px-3 text-xs font-semibold text-tint-text"
                      >
                        <CalendarClock className="h-3.5 w-3.5" /> +7d
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleShiftSchedule("unpostpone")}
                        className="flex min-h-11 items-center gap-1 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-fg"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> -7d
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAiBatch(selectedUnit.lessons)}
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" /> Generar 14 lecciones con IA (secuencial)
                </button>
                {failedLessonIds.length > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void runAiBatch(selectedUnit.lessons.filter((l) => failedLessonIds.includes(l.id)))
                    }
                    className="flex min-h-11 items-center gap-2 rounded-xl border border-danger/40 bg-danger-bg px-4 text-xs font-semibold text-danger"
                  >
                    Reintentar fallidas ({failedLessonIds.length})
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {selectedUnit.lessons.map((l) => {
                  const isEditing = editingLessonId === l.id;
                  const ready =
                    Boolean(l.title && l.biblePassage && l.parentSummary?.length && l.reinforcementQuestions?.length && l.classSundayDate);
                  return (
                    <article key={l.id} className="rounded-xl border border-border bg-bg p-3.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-fg">
                            L{l.lessonNumber}: {l.title ?? "Sin título"}
                          </p>
                          <p className="text-fg-muted">
                            {l.biblePassage ?? "Sin pasaje"} ·{" "}
                            {l.classSundayDate ? `Domingo ${formatSantiagoDate(l.classSundayDate)}` : "Sin fecha"} ·{" "}
                            {l.scheduleStatus}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 font-semibold ${
                            ready ? "bg-success-bg text-success" : "bg-tint text-tint-text"
                          }`}
                        >
                          {ready ? "Completa" : "Incompleta"}
                        </span>
                      </div>

                      <details className="mt-2">
                        <summary className="cursor-pointer font-semibold text-primary">
                          Texto extraído editable (para generación IA)
                        </summary>
                        <textarea
                          rows={4}
                          placeholder="Pega o ajusta aquí el texto de esta lección antes de generar con IA..."
                          value={draftTexts[l.id] ?? ""}
                          onChange={(e) => setDraftTexts((prev) => ({ ...prev, [l.id]: e.target.value }))}
                          className="mt-2 w-full rounded-xl border border-border bg-surface p-2.5 text-xs text-fg"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleGenerateSingle(l)}
                          className="mt-1.5 min-h-10 rounded-xl border border-primary bg-tint px-3 font-semibold text-tint-text"
                        >
                          Generar solo L{l.lessonNumber} con IA
                        </button>
                      </details>

                      {isEditing ? (
                        <div className="mt-3 space-y-2.5 rounded-xl border border-border bg-surface p-3">
                          <input
                            type="text"
                            maxLength={120}
                            placeholder="Título de lección"
                            value={lTitle}
                            onChange={(e) => setLTitle(e.target.value)}
                            className="min-h-11 w-full rounded-xl border border-border px-3 text-xs text-fg"
                          />
                          <input
                            type="text"
                            maxLength={80}
                            placeholder="Pasaje bíblico (ej. 1 Samuel 17:1-50)"
                            value={lPassage}
                            onChange={(e) => setLPassage(e.target.value)}
                            className="min-h-11 w-full rounded-xl border border-border px-3 text-xs text-fg"
                          />
                          <textarea
                            rows={5}
                            placeholder="Resumen para padres (separa párrafos con una línea en blanco, sin Markdown)"
                            value={lSummary}
                            onChange={(e) => setLSummary(e.target.value)}
                            className="w-full rounded-xl border border-border p-2.5 text-xs text-fg"
                          />
                          <textarea
                            rows={3}
                            placeholder="Preguntas de refuerzo (una por línea, 2 a 5 preguntas)"
                            value={lQuestions}
                            onChange={(e) => setLQuestions(e.target.value)}
                            className="w-full rounded-xl border border-border p-2.5 text-xs text-fg"
                          />
                          <div className="grid gap-2 sm:grid-cols-2">
                            <input
                              type="date"
                              aria-label="Domingo de clase"
                              value={lSunday}
                              onChange={(e) => setLSunday(e.target.value)}
                              className="min-h-11 rounded-xl border border-border px-3 text-xs tabular-nums text-fg"
                            />
                            <select
                              aria-label="Estado de programación"
                              value={lStatus}
                              onChange={(e) => setLStatus(e.target.value as AdminLessonItem["scheduleStatus"])}
                              className="min-h-11 rounded-xl border border-border px-3 text-xs text-fg"
                            >
                              <option value="SCHEDULED">Programada (lunes 00:01)</option>
                              <option value="PAUSED">Pausada</option>
                              <option value="FORCE_UNLOCKED">Desbloqueada manual</option>
                              <option value="FORCE_LOCKED">Bloqueada manual</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void saveLessonEdit(l.id)}
                              className="min-h-11 flex-1 rounded-xl bg-primary px-3 font-semibold text-white"
                            >
                              Guardar lección
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingLessonId(null)}
                              className="min-h-11 rounded-xl border border-border px-3 font-semibold text-fg"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startLessonEdit(l)}
                          className="mt-2 min-h-10 rounded-xl border border-border bg-surface px-3 font-semibold text-fg hover:bg-locked-bg"
                        >
                          Editar contenido / fecha / bloqueo
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
