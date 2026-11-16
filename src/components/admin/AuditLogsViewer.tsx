"use client";

import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { useState } from "react";
import { formatSantiagoDateTime } from "@/lib/timezone";

const AUDIT_ACTIONS = [
  "OTP_REQUESTED", "OTP_FAILED", "LOGIN_OTP", "ONBOARDING_COMPLETED", "LOGOUT", "SESSION_REVOKED",
  "CLASS_CREATE", "CLASS_UPDATE", "USER_CREATE", "USER_UPDATE", "USER_EMAIL_CHANGED", "USER_DEACTIVATE",
  "STUDENT_CREATE", "STUDENT_UPDATE", "STUDENT_CLASS_CHANGE", "STUDENT_DEACTIVATE",
  "UNIT_PDF_UPLOAD", "UNIT_ACTIVATE", "UNIT_FINISH", "UNIT_DELETE", "LESSON_AI_GENERATE", "LESSON_EDIT",
  "UNIT_POSTPONE", "UNIT_UNPOSTPONE", "LESSON_STATUS_CHANGE",
  "PDF_DOWNLOAD", "ATTENDANCE_SAVE", "ATTENDANCE_ADMIN_OVERRIDE", "LESSON_VIEW", "LESSON_COMPLETE", "LESSON_UNCOMPLETE",
];

export type AuditLogItem = {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  actorName: string | null;
  actorRut: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: unknown;
  createdAt: string;
};

type UserOption = { id: string; fullName: string; role: string };

export function AuditLogsViewer({
  initialItems,
  initialTotal,
  initialTotalPages,
  userOptions,
}: {
  initialItems: AuditLogItem[];
  initialTotal: number;
  initialTotalPages: number;
  userOptions: UserOption[];
}) {
  const [items, setItems] = useState<AuditLogItem[]>(initialItems);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);

  const [action, setAction] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [actorRole, setActorRole] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchLogs(nextPage: number, nextLimit = limit) {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ page: String(nextPage), limit: String(nextLimit) });
      if (action) sp.set("action", action);
      if (actorUserId) sp.set("actorUserId", actorUserId);
      if (actorRole) sp.set("actorRole", actorRole);
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);

      const res = await fetch(`/api/admin/audit-logs?${sp.toString()}`);
      const data = (await res.json().catch(() => ({}))) as {
        items?: AuditLogItem[];
        page?: number;
        total?: number;
        totalPages?: number;
        error?: string;
      };
      if (!res.ok || !data.items) {
        setError(data.error ?? "No se pudieron cargar los logs de auditoría");
        return;
      }
      setItems(data.items);
      setPage(data.page ?? nextPage);
      setTotal(data.total ?? data.items.length);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      setError("Error de conexión al consultar auditoría");
    } finally {
      setLoading(false);
    }
  }

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    void fetchLogs(1);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold text-fg">Auditoría del sistema</h1>
        </div>
        <p className="mt-1 text-xs text-fg-muted">Registro inmutable de acciones (solo lectura).</p>

        <form onSubmit={applyFilters} className="mt-4 grid gap-2.5 sm:grid-cols-2">
          <select
            aria-label="Filtrar por acción"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="min-h-11 rounded-xl border border-border bg-bg px-3 text-sm text-fg"
          >
            <option value="">Todas las acciones</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por usuario"
            value={actorUserId}
            onChange={(e) => setActorUserId(e.target.value)}
            className="min-h-11 rounded-xl border border-border bg-bg px-3 text-sm text-fg"
          >
            <option value="">Todos los usuarios</option>
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} ({u.role})
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por rol"
            value={actorRole}
            onChange={(e) => setActorRole(e.target.value)}
            className="min-h-11 rounded-xl border border-border bg-bg px-3 text-sm text-fg"
          >
            <option value="">Todos los roles</option>
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
            <option value="TEACHER">TEACHER</option>
            <option value="PARENT">PARENT</option>
          </select>

          <select
            aria-label="Registros por página"
            value={limit}
            onChange={(e) => {
              const v = Number(e.target.value);
              setLimit(v);
              void fetchLogs(1, v);
            }}
            className="min-h-11 rounded-xl border border-border bg-bg px-3 text-sm text-fg"
          >
            <option value={25}>25 por página</option>
            <option value={50}>50 por página</option>
          </select>

          <div>
            <label htmlFor="log-from" className="mb-1 block text-xs font-medium text-fg-muted">
              Desde
            </label>
            <input
              id="log-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm tabular-nums text-fg"
            />
          </div>

          <div>
            <label htmlFor="log-to" className="mb-1 block text-xs font-medium text-fg-muted">
              Hasta
            </label>
            <input
              id="log-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm tabular-nums text-fg"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover sm:col-span-2"
          >
            Aplicar filtros
          </button>
        </form>
      </section>

      <section className={`space-y-2.5 ${loading ? "opacity-60" : ""}`}>
        {error && <p className="rounded-xl bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>}
        <p className="text-xs text-fg-muted tabular-nums">
          Total: {total} eventos · Página {page} de {totalPages}
        </p>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-5 text-center text-sm text-fg-muted">
            No hay eventos para los filtros seleccionados.
          </div>
        ) : (
          items.map((log) => (
            <article key={log.id} className="rounded-2xl border border-border bg-surface p-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-tint px-2.5 py-0.5 font-bold text-tint-text">{log.action}</span>
                <time className="tabular-nums text-fg-muted">{formatSantiagoDateTime(log.createdAt)}</time>
              </div>
              <p className="mt-1.5 text-fg">
                <strong>Actor:</strong> {log.actorName ?? "Sistema"} {log.actorRole ? `(${log.actorRole})` : ""}{" "}
                {log.actorRut ? `· ${log.actorRut}` : ""}
              </p>
              {log.entityType && (
                <p className="mt-0.5 text-fg-muted">
                  <strong>Entidad:</strong> {log.entityType} {log.entityId ? `#${log.entityId.slice(0, 8)}` : ""}
                </p>
              )}
              {log.details != null && (
                <pre className="mt-1.5 overflow-x-auto rounded-lg bg-bg p-2 text-[11px] text-fg-muted">
                  {JSON.stringify(log.details)}
                </pre>
              )}
            </article>
          ))
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => void fetchLogs(page - 1)}
            className="flex min-h-11 items-center gap-1 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-fg disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Anterior
          </button>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => void fetchLogs(page + 1)}
            className="flex min-h-11 items-center gap-1 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-fg disabled:opacity-40"
          >
            Siguiente <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
