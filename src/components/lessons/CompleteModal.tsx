"use client";

import { CheckCircle2, Loader2, X } from "lucide-react";
import { useState } from "react";
import type { ParentLessonChildState } from "./types";

export function CompleteModal({
  mode,
  lessonTitle,
  eligibleChildren,
  onClose,
  onConfirm,
}: {
  mode: "complete" | "uncomplete";
  lessonTitle: string;
  eligibleChildren: ParentLessonChildState[];
  onClose: () => void;
  onConfirm: (studentIds: string[]) => Promise<void>;
}) {
  const defaultSelected = eligibleChildren
    .filter((c) => (mode === "complete" ? !c.completed : c.completed))
    .map((c) => c.id);

  const [selectedIds, setSelectedIds] = useState<string[]>(defaultSelected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleStudent(studentId: string) {
    setSelectedIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId],
    );
  }

  async function handleSubmit() {
    if (selectedIds.length === 0) {
      setError("Selecciona al menos un hijo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(selectedIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el estado");
      setBusy(false);
    }
  }

  const actionableChildren = eligibleChildren.filter((c) =>
    mode === "complete" ? !c.completed : c.completed,
  );
  const showChecklist = eligibleChildren.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-fg/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-modal-title"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="complete-modal-title" className="text-base font-bold text-fg">
            {mode === "complete" ? "Confirmar lección completada" : "Desmarcar lección completada"}
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            disabled={busy}
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-fg-muted hover:bg-bg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-sm text-fg-muted">
          {mode === "complete"
            ? `¿Confirmas que ya repasaron "${lessonTitle}" en casa? El otro apoderado vinculado también verá este avance.`
            : `¿Confirmas revertir a estado pendiente "${lessonTitle}"? Se conservará el registro de lectura (Visto).`}
        </p>

        {showChecklist ? (
          <fieldset className="mt-4 space-y-2">
            <legend className="text-xs font-semibold text-fg">
              {mode === "complete" ? "Selecciona hijo(s):" : "Selecciona hijo(s) a desmarcar:"}
            </legend>
            {eligibleChildren.map((child) => {
              const disabled = mode === "complete" ? child.completed : !child.completed;
              const checked = disabled ? mode === "complete" : selectedIds.includes(child.id);
              return (
                <label
                  key={child.id}
                  className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                    disabled
                      ? "border-border bg-bg text-fg-muted opacity-75"
                      : "cursor-pointer border-border bg-surface text-fg hover:bg-tint/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled || busy}
                    onChange={() => toggleStudent(child.id)}
                    className="h-5 w-5 accent-primary"
                  />
                  <span className="flex-1 font-medium">{child.fullName}</span>
                  {mode === "complete" && child.completed && (
                    <span className="text-[11px] font-semibold text-success">
                      Ya por {child.completedByName}
                    </span>
                  )}
                </label>
              );
            })}
          </fieldset>
        ) : (
          actionableChildren[0] && (
            <p className="mt-3 rounded-xl bg-bg px-3 py-2 text-xs font-semibold text-fg">
              Alumno: {actionableChildren[0].fullName}
            </p>
          )
        )}

        {error && <p className="mt-3 rounded-xl bg-danger-bg px-3 py-2 text-xs font-medium text-danger">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-11 flex-1 rounded-xl border border-border px-4 text-sm font-semibold text-fg hover:bg-bg"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || selectedIds.length === 0}
            onClick={() => void handleSubmit()}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60 ${
              mode === "complete" ? "bg-success hover:opacity-90" : "bg-danger hover:opacity-90"
            }`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {mode === "complete" ? "Sí, completada" : "Sí, desmarcar"}
          </button>
        </div>
      </div>
    </div>
  );
}
