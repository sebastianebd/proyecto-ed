"use client";

import { Bell, LogOut, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { InstallGuideModal } from "@/components/pwa/InstallGuideModal";
import type { UserProfile } from "@/lib/profile";
import { formatRutForInput } from "@/lib/rut";

const ROLE_LABELS = {
  SUPER_ADMIN: "Super Administrador",
  TEACHER: "Profesor",
  PARENT: "Padre / Madre / Tutor",
} as const;

export function ProfileView({ profile }: { profile: UserProfile }) {
  const router = useRouter();
  const [guideOpen, setGuideOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    let pushEndpoint: string | undefined;
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager?.getSubscription();
        if (sub) {
          pushEndpoint = sub.endpoint;
          await sub.unsubscribe().catch(() => {});
        }
      }
    } catch {
      // No bloquear cierre de sesión si el navegador restringe SW.
    }

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pushEndpoint ? { pushEndpoint } : {}),
      });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h1 className="text-lg font-bold text-fg">Mi Perfil</h1>
        <dl className="mt-3 space-y-2.5 text-sm">
          <div className="flex justify-between gap-4 border-b border-border pb-2">
            <dt className="text-fg-muted">Nombre</dt>
            <dd className="text-right font-semibold text-fg">{profile.fullName}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-border pb-2">
            <dt className="text-fg-muted">RUT</dt>
            <dd className="font-semibold tabular-nums text-fg">{formatRutForInput(profile.rut)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-border pb-2">
            <dt className="text-fg-muted">Correo</dt>
            <dd className="text-right font-medium text-fg">{profile.email}</dd>
          </div>
          {profile.phone && (
            <div className="flex justify-between gap-4 border-b border-border pb-2">
              <dt className="text-fg-muted">Teléfono</dt>
              <dd className="font-medium tabular-nums text-fg">{profile.phone}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-fg-muted">Rol</dt>
            <dd className="font-semibold text-primary">{ROLE_LABELS[profile.role]}</dd>
          </div>
        </dl>
      </section>

      {profile.role === "PARENT" && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-base font-bold text-fg">Hijos vinculados</h2>
          {profile.children.length === 0 ? (
            <p className="mt-2 text-sm text-fg-muted">Aún no tienes alumnos vinculados.</p>
          ) : (
            <ul className="mt-2.5 space-y-2">
              {profile.children.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-xl bg-bg px-3.5 py-2.5 text-sm">
                  <div>
                    <p className="font-semibold text-fg">{c.fullName}</p>
                    <p className="text-xs text-fg-muted">
                      {c.className}
                      {c.relationship ? ` · ${c.relationship}` : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      c.status === "ACTIVE" ? "bg-success-bg text-success" : "bg-locked-bg text-locked"
                    }`}
                  >
                    {c.status === "ACTIVE" ? "Activo" : "Inactivo"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {profile.role === "TEACHER" && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-base font-bold text-fg">Mis clases</h2>
          {profile.classes.length === 0 ? (
            <p className="mt-2 text-sm text-fg-muted">No tienes clases asignadas.</p>
          ) : (
            <ul className="mt-2.5 space-y-2">
              {profile.classes.map((c) => (
                <li key={c.id} className="rounded-xl bg-bg px-3.5 py-2.5 text-sm">
                  <p className="font-semibold text-fg">{c.name}</p>
                  {c.ageRange && <p className="text-xs text-fg-muted">{c.ageRange}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="space-y-2.5 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-base font-bold text-fg">Aplicación móvil y avisos</h2>
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg px-4 text-sm font-semibold text-fg hover:bg-locked-bg"
        >
          <Smartphone className="h-4 w-4 text-primary" /> Ver guía para instalar la app
        </button>
        <div className="flex items-start gap-2 rounded-xl bg-tint p-3 text-xs text-tint-text">
          <Bell className="mt-0.5 h-4 w-4 shrink-0" />
          <p>La suscripción a notificaciones semanales Web Push quedará habilitada al completar la PWA (Hito 6).</p>
        </div>
      </section>

      <button
        type="button"
        disabled={loggingOut}
        onClick={() => void handleLogout()}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger-bg px-4 font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"
      >
        <LogOut className="h-4 w-4" /> Cerrar sesión
      </button>

      <InstallGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
