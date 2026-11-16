"use client";

import { Baby, Edit3, History, Plus, UserX } from "lucide-react";
import { useState } from "react";
import { formatRutForInput } from "@/lib/rut";
import { formatSantiagoDate } from "@/lib/timezone";
import { adminCreateStudentSchema, adminUpdateStudentSchema, cleanString } from "@/lib/validators";

const SUGGESTED_PREFS = ["dibujar", "pintar", "cantar", "escribir"];

type ClassOption = { id: string; name: string; status: string };
type ParentOption = { id: string; fullName: string; rut: string; status: string };

export type AdminStudentItem = {
  id: string;
  classId: string;
  className: string;
  fullName: string;
  birthDate: string | null;
  specialCare: string | null;
  preferences: string[] | null;
  preferencesNotes: string | null;
  status: string;
  parents: { parentId: string; fullName: string; rut: string; status: string; relationship: string | null }[];
  classHistory: { id: string; classId: string; className: string; assignedAt: string; unassignedAt: string | null }[];
};

export function StudentsManager({
  initialStudents,
  classOptions,
  parentOptions,
}: {
  initialStudents: AdminStudentItem[];
  classOptions: ClassOption[];
  parentOptions: ParentOption[];
}) {
  const [items, setItems] = useState<AdminStudentItem[]>(initialStudents);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [editing, setEditing] = useState<AdminStudentItem | null>(null);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);

  const activeClasses = classOptions.filter((c) => c.status === "ACTIVE");
  const selectableClasses =
    editing && !activeClasses.some((c) => c.id === editing.classId)
      ? [...activeClasses, ...classOptions.filter((c) => c.id === editing.classId)]
      : activeClasses;
  const [fullName, setFullName] = useState("");
  const [classId, setClassId] = useState(activeClasses[0]?.id ?? "");
  const [birthDate, setBirthDate] = useState("");
  const [specialCare, setSpecialCare] = useState("");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [customPref, setCustomPref] = useState("");
  const [preferencesNotes, setPreferencesNotes] = useState("");
  const [linkedParents, setLinkedParents] = useState<Map<string, string>>(new Map());

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/admin/students");
    if (res.ok) {
      const data = (await res.json()) as { items: AdminStudentItem[] };
      setItems(data.items);
    }
  }

  function startEdit(s: AdminStudentItem) {
    setEditing(s);
    setFullName(s.fullName);
    setClassId(s.classId);
    setBirthDate(s.birthDate ?? "");
    setSpecialCare(s.specialCare ?? "");
    setPreferences(s.preferences ?? []);
    setPreferencesNotes(s.preferencesNotes ?? "");
    setLinkedParents(new Map(s.parents.map((p) => [p.parentId, p.relationship ?? ""])));
    setError(null);
    setNotice(null);
  }

  function resetForm() {
    setEditing(null);
    setFullName("");
    setClassId(activeClasses[0]?.id ?? "");
    setBirthDate("");
    setSpecialCare("");
    setPreferences([]);
    setCustomPref("");
    setPreferencesNotes("");
    setLinkedParents(new Map());
    setError(null);
  }

  function togglePref(tag: string) {
    setPreferences((prev) => {
      if (prev.includes(tag)) return prev.filter((x) => x !== tag);
      if (prev.length >= 10) return prev;
      return [...prev, tag];
    });
  }

  const prefTagSchema = cleanString(1, 30, "Preferencia");

  function addCustomPref() {
    setError(null);
    const parsed = prefTagSchema.safeParse(customPref);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Preferencia inválida");
      return;
    }
    if (preferences.length >= 10) {
      setError("Máximo 10 preferencias");
      return;
    }
    if (!preferences.includes(parsed.data)) {
      setPreferences((prev) => [...prev, parsed.data]);
    }
    setCustomPref("");
  }

  function toggleParent(parentId: string) {
    setLinkedParents((prev) => {
      const next = new Map(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.set(parentId, "");
      return next;
    });
  }

  function setRelationship(parentId: string, rel: string) {
    setLinkedParents((prev) => {
      const next = new Map(prev);
      next.set(parentId, rel);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    let nextPreferences = preferences;
    if (customPref.trim().length > 0) {
      const parsedPref = prefTagSchema.safeParse(customPref);
      if (!parsedPref.success) {
        setError(parsedPref.error.issues[0]?.message ?? "Preferencia personalizada inválida");
        return;
      }
      if (!nextPreferences.includes(parsedPref.data)) {
        if (nextPreferences.length >= 10) {
          setError("Máximo 10 preferencias");
          return;
        }
        nextPreferences = [...nextPreferences, parsedPref.data];
      }
    }

    const parentsArray = Array.from(linkedParents.entries()).map(([parentId, relationship]) => ({
      parentId,
      relationship,
    }));

    if (editing) {
      const parsed = adminUpdateStudentSchema.safeParse({
        fullName,
        classId,
        birthDate: birthDate.trim() === "" ? null : birthDate,
        specialCare: specialCare.trim() === "" ? null : specialCare,
        preferences: nextPreferences,
        preferencesNotes: preferencesNotes.trim() === "" ? null : preferencesNotes,
        parents: parentsArray,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Revisa los campos");
        return;
      }
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/students/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(body.error ?? "No se pudo actualizar");
          return;
        }
        await reload();
        setNotice(classId !== editing.classId ? "Alumno trasladado conservando historial" : "Alumno actualizado");
        resetForm();
      } catch {
        setError("Error de conexión al guardar alumno");
      } finally {
        setBusy(false);
      }
      return;
    }

    const parsed = adminCreateStudentSchema.safeParse({
      fullName,
      classId,
      birthDate,
      specialCare,
      preferences: nextPreferences,
      preferencesNotes,
      parents: parentsArray,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los campos");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "No se pudo crear alumno");
        return;
      }
      await reload();
      setNotice("Alumno registrado con historial inicial");
      resetForm();
    } catch {
      setError("Error de conexión al registrar alumno");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(s: AdminStudentItem) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const nextStatus = s.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      const res = await fetch(`/api/admin/students/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "No se pudo actualizar el estado del alumno");
        return;
      }
      await reload();
      setNotice(nextStatus === "INACTIVE" ? `${s.fullName} dado de baja (historial conservado)` : `${s.fullName} reactivado`);
    } catch {
      setError("Error de conexión al actualizar estado");
    } finally {
      setBusy(false);
    }
  }

  const filtered = items.filter((s) => {
    if (classFilter && s.classId !== classFilter) return false;
    const q = search.trim().toLowerCase();
    return !q || s.fullName.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h1 className="text-lg font-bold text-fg">{editing ? `Editar ficha: ${editing.fullName}` : "Nuevo niño / alumno"}</h1>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="s-name" className="mb-1 block text-sm font-semibold text-fg">
                Nombre completo
              </label>
              <input
                id="s-name"
                type="text"
                maxLength={80}
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-border px-3.5 text-sm text-fg outline-none focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="s-class" className="mb-1 block text-sm font-semibold text-fg">
                Clase actual
              </label>
              <select
                id="s-class"
                required
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg"
              >
                {selectableClasses.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.status === "ARCHIVED"}>
                    {c.name} {c.status === "ARCHIVED" ? "(Archivada)" : ""}
                  </option>
                ))}
              </select>
              {editing && classId !== editing.classId && (
                <p className="mt-1 text-xs font-medium text-tint-text">
                  Se registrará el traslado en el historial conservando asistencias previas.
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="s-birth" className="mb-1 block text-sm font-semibold text-fg">
              Fecha de nacimiento (opcional)
            </label>
            <input
              id="s-birth"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-border px-3.5 text-sm tabular-nums text-fg outline-none focus:border-primary"
            />
          </div>

          <div>
            <label htmlFor="s-care" className="mb-1 block text-sm font-semibold text-fg">
              Cuidados especiales / alergias (ficha interna, opcional)
            </label>
            <textarea
              id="s-care"
              rows={2}
              maxLength={300}
              placeholder="Ej. Alergia al maní, avisar si necesita ir al baño..."
              value={specialCare}
              onChange={(e) => setSpecialCare(e.target.value)}
              className="w-full rounded-xl border border-border p-3 text-sm text-fg outline-none focus:border-primary"
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-fg">Preferencias de aprendizaje ({preferences.length}/10)</p>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set([...SUGGESTED_PREFS, ...preferences])).map((tag) => {
                const selected = preferences.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => togglePref(tag)}
                    className={`min-h-11 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                      selected
                        ? "border-primary bg-tint text-tint-text"
                        : "border-border bg-bg text-fg-muted hover:text-fg"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                maxLength={30}
                placeholder="Otra preferencia..."
                value={customPref}
                onChange={(e) => setCustomPref(e.target.value)}
                className="min-h-11 flex-1 rounded-xl border border-border px-3 text-sm text-fg outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={addCustomPref}
                className="min-h-11 rounded-xl border border-border px-3 text-xs font-semibold text-fg hover:bg-bg"
              >
                Agregar
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="s-notes" className="mb-1 block text-sm font-semibold text-fg">
              Nota de preferencias (ficha interna, opcional)
            </label>
            <input
              id="s-notes"
              type="text"
              maxLength={250}
              value={preferencesNotes}
              onChange={(e) => setPreferencesNotes(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-border px-3.5 text-sm text-fg outline-none focus:border-primary"
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-fg">Padres / Tutores vinculados (N:M)</p>
            {parentOptions.length === 0 ? (
              <p className="text-xs text-fg-muted">No hay padres registrados aún en Usuarios.</p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-border bg-bg p-2.5">
                {parentOptions.map((p) => {
                  const checked = linkedParents.has(p.id);
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface p-2 text-sm">
                      <label className="flex min-h-9 flex-1 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleParent(p.id)}
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="font-medium text-fg">
                          {p.fullName} <span className="text-xs tabular-nums text-fg-muted">({formatRutForInput(p.rut)})</span>
                        </span>
                      </label>
                      {checked && (
                        <input
                          type="text"
                          maxLength={30}
                          placeholder="Parentesco (Mamá/Papá)"
                          value={linkedParents.get(p.id) ?? ""}
                          onChange={(e) => setRelationship(p.id, e.target.value)}
                          className="min-h-9 w-44 rounded-lg border border-border px-2.5 text-xs text-fg"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
          {notice && <p className="rounded-xl bg-success-bg px-3 py-2 text-sm text-success">{notice}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !classId}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {editing ? "Guardar ficha" : "Registrar alumno"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={resetForm}
                className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-fg"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            placeholder="Buscar alumno..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 flex-1 rounded-xl border border-border bg-surface px-3.5 text-sm text-fg outline-none focus:border-primary"
          />
          <select
            aria-label="Filtrar alumnos por clase"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-fg"
          >
            <option value="">Todas las clases</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {filtered.map((s) => (
          <article key={s.id} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Baby className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-bold text-fg">{s.fullName}</h3>
                  <p className="text-xs text-fg-muted">{s.className}</p>
                </div>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  s.status === "ACTIVE" ? "bg-success-bg text-success" : "bg-locked-bg text-locked"
                }`}
              >
                {s.status === "ACTIVE" ? "Activo" : "Inactivo"}
              </span>
            </div>

            <div className="mt-2.5 space-y-1 text-xs text-fg-muted">
              <p>
                <strong className="text-fg">Padres:</strong>{" "}
                {s.parents.length > 0
                  ? s.parents.map((p) => `${p.fullName}${p.relationship ? ` (${p.relationship})` : ""}`).join(", ")
                  : "Sin vínculo"}
              </p>
              {s.specialCare && (
                <p className="rounded-lg bg-tint px-2.5 py-1 text-tint-text">
                  <strong>Cuidados:</strong> {s.specialCare}
                </p>
              )}
              {s.preferences && s.preferences.length > 0 && (
                <p>
                  <strong className="text-fg">Preferencias:</strong> {s.preferences.join(", ")}
                </p>
              )}
            </div>

            {openHistoryId === s.id && (
              <div className="mt-3 rounded-xl border border-border bg-bg p-3 text-xs">
                <p className="font-semibold text-fg">Historial de clases</p>
                <ul className="mt-1.5 space-y-1 text-fg-muted">
                  {s.classHistory.map((h) => (
                    <li key={h.id}>
                      <strong>{h.className}</strong>: desde {formatSantiagoDate(h.assignedAt)}
                      {h.unassignedAt ? ` hasta ${formatSantiagoDate(h.unassignedAt)}` : " (Actual)"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => startEdit(s)}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-fg hover:bg-bg"
              >
                <Edit3 className="h-3.5 w-3.5" /> Editar / Trasladar
              </button>
              <button
                type="button"
                onClick={() => setOpenHistoryId((prev) => (prev === s.id ? null : s.id))}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-fg-muted hover:bg-bg"
              >
                <History className="h-3.5 w-3.5" /> Historial ({s.classHistory.length})
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggleStatus(s)}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-fg-muted hover:bg-bg"
              >
                <UserX className="h-3.5 w-3.5" /> {s.status === "ACTIVE" ? "Dar de baja" : "Reactivar"}
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
