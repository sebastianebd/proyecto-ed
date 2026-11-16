"use client";

import { Edit3, KeyRound, ShieldAlert, UserPlus, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { formatRutForInput } from "@/lib/rut";
import { adminCreateUserSchema, adminUpdateUserSchema } from "@/lib/validators";

export type AdminUserItem = {
  id: string;
  rut: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: "SUPER_ADMIN" | "TEACHER" | "PARENT";
  status: "PENDING_ONBOARDING" | "ACTIVE" | "INACTIVE";
  lastSeenAt: string | Date | null;
  isOnline: boolean;
  classes: { id: string; name: string }[];
  childrenCount: number;
};

const ROLE_TEXT = {
  SUPER_ADMIN: "Super Admin",
  TEACHER: "Profesor",
  PARENT: "Padre / Tutor",
};

const STATUS_BADGE = {
  PENDING_ONBOARDING: { label: "Pendiente", cls: "bg-tint text-warning border border-tint-border" },
  ACTIVE: { label: "Activo", cls: "bg-success-bg text-success" },
  INACTIVE: { label: "Inactivo", cls: "bg-locked-bg text-locked" },
};

function formatLastSeen(lastSeen: string | Date | null, isOnline: boolean): string {
  if (isOnline) return "🟢 En línea";
  if (!lastSeen) return "Sin ingreso registrado";
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000));
  if (diffSec < 3600) return `Última vez hace ${Math.max(2, Math.floor(diffSec / 60))} min`;
  if (diffSec < 86400) return `Última vez hace ${Math.floor(diffSec / 3600)} h`;
  return `Última vez hace ${Math.floor(diffSec / 86400)} d`;
}

export function UsersManager({
  initialUsers,
  currentUserId,
}: {
  initialUsers: AdminUserItem[];
  currentUserId: string;
}) {
  const [items, setItems] = useState<AdminUserItem[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [editing, setEditing] = useState<AdminUserItem | null>(null);

  const [rut, setRut] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"PARENT" | "TEACHER" | "SUPER_ADMIN">("PARENT");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const data = (await res.json()) as { items: AdminUserItem[] };
      setItems(data.items);
    }
  }

  // Refresco en vivo cada ~15s (solo si pestaña visible) para indicador "En línea".
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 15_000);
    return () => clearInterval(t);
  }, []);

  function startEdit(u: AdminUserItem) {
    setEditing(u);
    setFullName(u.fullName);
    setEmail(u.email);
    setPhone(u.phone ?? "");
    setRole(u.role);
    setError(null);
    setNotice(null);
  }

  function resetForm() {
    setEditing(null);
    setRut("");
    setFullName("");
    setEmail("");
    setPhone("");
    setRole("PARENT");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (editing) {
      const parsed = adminUpdateUserSchema.safeParse({
        fullName,
        email,
        phone: phone.trim() === "" ? null : phone,
        role,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Revisa los datos");
        return;
      }
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/users/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(body.error ?? "No se pudo actualizar");
          return;
        }
        await reload();
        setNotice(
          email.trim().toLowerCase() !== editing.email
            ? "Usuario actualizado. Por cambio de correo se cerraron sus sesiones y OTPs."
            : "Usuario actualizado",
        );
        resetForm();
      } finally {
        setBusy(false);
      }
      return;
    }

    const parsed = adminCreateUserSchema.safeParse({ rut, fullName, email, phone, role });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los datos");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "No se pudo crear usuario");
        return;
      }
      await reload();
      setNotice("Usuario pre-registrado en estado Pendiente");
      resetForm();
    } finally {
      setBusy(false);
    }
  }

  async function revokeUserSessions(u: AdminUserItem) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/revoke-sessions`, { method: "POST" });
      if (res.ok) {
        await reload();
        setNotice(`Sesiones de ${u.fullName} revocadas`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: AdminUserItem) {
    setBusy(true);
    setError(null);
    try {
      const nextStatus = u.status === "INACTIVE" ? "ACTIVE" : "INACTIVE";
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "No se pudo cambiar estado");
        return;
      }
      await reload();
      setNotice(nextStatus === "INACTIVE" ? `${u.fullName} desactivado y sesiones cerradas` : `${u.fullName} reactivado`);
    } finally {
      setBusy(false);
    }
  }

  const filtered = items.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return u.fullName.toLowerCase().includes(q) || u.rut.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h1 className="text-lg font-bold text-fg">
          {editing ? `Editar usuario (${formatRutForInput(editing.rut)})` : "Pre-registrar usuario"}
        </h1>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {!editing && (
            <div>
              <label htmlFor="u-rut" className="mb-1 block text-sm font-semibold text-fg">
                RUT
              </label>
              <input
                id="u-rut"
                type="text"
                maxLength={20}
                required
                placeholder="12.345.678-5"
                value={rut}
                onChange={(e) => setRut(formatRutForInput(e.target.value))}
                onPaste={(e) => {
                  e.preventDefault();
                  setRut(formatRutForInput(e.clipboardData.getData("text")));
                }}
                className="min-h-11 w-full rounded-xl border border-border px-3.5 text-sm tabular-nums text-fg outline-none focus:border-primary"
              />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="u-name" className="mb-1 block text-sm font-semibold text-fg">
                Nombre completo
              </label>
              <input
                id="u-name"
                type="text"
                maxLength={80}
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-border px-3.5 text-sm text-fg outline-none focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="u-email" className="mb-1 block text-sm font-semibold text-fg">
                Correo electrónico
              </label>
              <input
                id="u-email"
                type="email"
                maxLength={120}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-border px-3.5 text-sm text-fg outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="u-phone" className="mb-1 block text-sm font-semibold text-fg">
                Teléfono (opcional)
              </label>
              <input
                id="u-phone"
                type="tel"
                maxLength={15}
                placeholder="+56912345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-border px-3.5 text-sm tabular-nums text-fg outline-none focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="u-role" className="mb-1 block text-sm font-semibold text-fg">
                Rol
              </label>
              <select
                id="u-role"
                disabled={editing?.id === currentUserId}
                value={role}
                onChange={(e) => setRole(e.target.value as "PARENT" | "TEACHER" | "SUPER_ADMIN")}
                className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg disabled:bg-locked-bg"
              >
                <option value="PARENT">Padre / Madre / Tutor</option>
                <option value="TEACHER">Profesor</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
          </div>

          {editing && email.trim().toLowerCase() !== editing.email && (
            <p className="flex items-center gap-1.5 rounded-xl bg-tint px-3 py-2 text-xs font-medium text-tint-text">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              Al guardar un correo nuevo se revocarán sus sesiones activas y OTPs pendientes.
            </p>
          )}

          {error && <p className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
          {notice && <p className="rounded-xl bg-success-bg px-3 py-2 text-sm text-success">{notice}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4" />
              {editing ? "Guardar usuario" : "Crear usuario"}
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
            placeholder="Buscar nombre, RUT o correo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 flex-1 rounded-xl border border-border bg-surface px-3.5 text-sm text-fg outline-none focus:border-primary"
          />
          <select
            aria-label="Filtrar por rol"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-fg"
          >
            <option value="">Todos los roles</option>
            <option value="PARENT">Padres</option>
            <option value="TEACHER">Profesores</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
        </div>

        <p className="text-xs text-fg-muted">Mostrando {filtered.length} usuarios · Presencia actualizada cada 15s</p>

        {filtered.map((u) => {
          const badge = STATUS_BADGE[u.status];
          const isSelf = u.id === currentUserId;
          return (
            <article key={u.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-fg">
                    {u.fullName} {isSelf && <span className="text-xs font-medium text-primary">(Tú)</span>}
                  </h3>
                  <p className="text-xs tabular-nums text-fg-muted">
                    {formatRutForInput(u.rut)} · {u.email}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-bg px-2 py-0.5 text-xs font-semibold text-fg">
                    {ROLE_TEXT[u.role]}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
                <span className={u.isOnline ? "font-semibold text-success" : ""}>
                  {formatLastSeen(u.lastSeenAt, u.isOnline)}
                </span>
                {u.role === "PARENT" && <span>Hijos vinculados: {u.childrenCount}</span>}
                {u.classes.length > 0 && <span>Clases: {u.classes.map((c) => c.name).join(", ")}</span>}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(u)}
                  className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-fg hover:bg-bg"
                >
                  <Edit3 className="h-3.5 w-3.5" /> Editar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void revokeUserSessions(u)}
                  className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-fg-muted hover:bg-bg"
                >
                  <KeyRound className="h-3.5 w-3.5" /> Revocar sesiones
                </button>
                {!isSelf && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleActive(u)}
                    className={`flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold ${
                      u.status === "INACTIVE"
                        ? "border-success/40 bg-success-bg text-success"
                        : "border-danger/30 bg-danger-bg text-danger"
                    }`}
                  >
                    <UserX className="h-3.5 w-3.5" />
                    {u.status === "INACTIVE" ? "Reactivar" : "Desactivar"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
