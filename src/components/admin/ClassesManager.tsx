"use client";

import { Archive, Edit3, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import { adminClassSchema, adminUpdateClassSchema } from "@/lib/validators";

type TeacherRef = { id: string; teacherId?: string; fullName: string; rut: string; status: string };
type ClassItem = {
  id: string;
  name: string;
  ageRange: string | null;
  status: string;
  activeStudentsCount: number;
  teachers: TeacherRef[];
};
type TeacherOption = { id: string; fullName: string; role: string; status: string };

export function ClassesManager({
  initialClasses,
  teacherOptions,
}: {
  initialClasses: ClassItem[];
  teacherOptions: TeacherOption[];
}) {
  const [items, setItems] = useState<ClassItem[]>(initialClasses);
  const [name, setName] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/admin/classes");
    if (res.ok) {
      const data = (await res.json()) as { items: ClassItem[] };
      setItems(data.items);
    }
  }

  function startEdit(c: ClassItem) {
    setEditingId(c.id);
    setName(c.name);
    setAgeRange(c.ageRange ?? "");
    setSelectedTeachers(c.teachers.map((t) => t.teacherId ?? t.id));
    setError(null);
    setNotice(null);
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setAgeRange("");
    setSelectedTeachers([]);
    setError(null);
  }

  function toggleTeacher(id: string) {
    setSelectedTeachers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const payload = editingId
      ? { name, ageRange: ageRange.trim() === "" ? null : ageRange, teacherIds: selectedTeachers }
      : { name, ageRange, teacherIds: selectedTeachers };

    const parsed = editingId
      ? adminUpdateClassSchema.safeParse(payload)
      : adminClassSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los campos");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(editingId ? `/api/admin/classes/${editingId}` : "/api/admin/classes", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "No se pudo guardar la clase");
        return;
      }
      await reload();
      setNotice(editingId ? "Clase actualizada" : "Clase creada");
      resetForm();
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(c: ClassItem) {
    setError(null);
    setBusy(true);
    try {
      const nextStatus = c.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
      const res = await fetch(`/api/admin/classes/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        await reload();
        setNotice(nextStatus === "ARCHIVED" ? "Clase archivada" : "Clase reactivada");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h1 className="text-lg font-bold text-fg">{editingId ? "Editar clase" : "Nueva clase / curso"}</h1>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label htmlFor="cls-name" className="mb-1 block text-sm font-semibold text-fg">
              Nombre de clase
            </label>
            <input
              id="cls-name"
              type="text"
              maxLength={60}
              required
              placeholder="Ej. Párvulos 3-5 años"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-border px-3.5 text-sm text-fg outline-none focus:border-primary"
            />
          </div>

          <div>
            <label htmlFor="cls-age" className="mb-1 block text-sm font-semibold text-fg">
              Rango de edad / descripción (opcional)
            </label>
            <input
              id="cls-age"
              type="text"
              maxLength={80}
              placeholder="Ej. Niños de 3 a 5 años"
              value={ageRange}
              onChange={(e) => setAgeRange(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-border px-3.5 text-sm text-fg outline-none focus:border-primary"
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-fg">Profesores asignados</p>
            {teacherOptions.length === 0 ? (
              <p className="text-xs text-fg-muted">No hay profesores creados aún.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {teacherOptions.map((t) => (
                  <label
                    key={t.id}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-bg px-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTeachers.includes(t.id)}
                      onChange={() => toggleTeacher(t.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="truncate font-medium text-fg">
                      {t.fullName} {t.role === "SUPER_ADMIN" ? "(Admin)" : ""}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {error && <p className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
          {notice && <p className="rounded-xl bg-success-bg px-3 py-2 text-sm text-success">{notice}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {editingId ? "Guardar cambios" : "Crear clase"}
            </button>
            {editingId && (
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
        <h2 className="text-base font-bold text-fg">Clases registradas ({items.length})</h2>
        {items.map((c) => (
          <article key={c.id} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-fg">{c.name}</h3>
                {c.ageRange && <p className="text-xs text-fg-muted">{c.ageRange}</p>}
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  c.status === "ACTIVE" ? "bg-success-bg text-success" : "bg-locked-bg text-locked"
                }`}
              >
                {c.status === "ACTIVE" ? "Activa" : "Archivada"}
              </span>
            </div>

            <div className="mt-2.5 text-xs text-fg-muted">
              <p>
                <strong className="text-fg">Alumnos activos:</strong>{" "}
                <span className="tabular-nums">{c.activeStudentsCount}</span>
              </p>
              <p className="mt-0.5">
                <strong className="text-fg">Profesores:</strong>{" "}
                {c.teachers.length > 0 ? c.teachers.map((t) => t.fullName).join(", ") : "Sin asignar"}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => startEdit(c)}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-fg hover:bg-bg"
              >
                <Edit3 className="h-3.5 w-3.5" /> Editar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggleStatus(c)}
                className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-fg-muted hover:bg-bg"
              >
                {c.status === "ACTIVE" ? (
                  <>
                    <Archive className="h-3.5 w-3.5" /> Archivar
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" /> Reactivar
                  </>
                )}
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
