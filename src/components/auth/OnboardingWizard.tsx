"use client";

import { Bell, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PwaInstallSteps } from "@/components/pwa/InstallGuideModal";
import type { UserProfile } from "@/lib/profile";
import { onboardingSchema } from "@/lib/validators";

type PushSupport = "supported" | "ios-not-standalone" | "unsupported";

export function OnboardingWizard({ profile }: { profile: UserProfile }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fullName, setFullName] = useState(profile.fullName);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [pushSupport, setPushSupport] = useState<PushSupport>("unsupported");
  const [permStatus, setPermStatus] = useState<"default" | "granted" | "denied">("default");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as { standalone?: boolean }).standalone);
    const hasPush = "Notification" in window && "PushManager" in window && "serviceWorker" in navigator;

    if (isIos && !isStandalone) {
      setPushSupport("ios-not-standalone");
    } else if (hasPush) {
      setPushSupport("supported");
      setPermStatus(Notification.permission);
    } else {
      setPushSupport("unsupported");
    }
  }, []);

  function nextFromStep1() {
    setError(null);
    const parsed = onboardingSchema.safeParse({ fullName, phone });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa tus datos");
      return;
    }
    setFullName(parsed.data.fullName);
    setPhone(parsed.data.phone ?? "");
    setStep(2);
  }

  async function askPushPermission() {
    if (pushSupport !== "supported") return;
    try {
      const result = await Notification.requestPermission();
      setPermStatus(result);
    } catch {
      // No bloqueante.
    }
  }

  async function finishOnboarding() {
    setError(null);
    const parsed = onboardingSchema.safeParse({ fullName, phone });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa tus datos");
      setStep(1);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "No se pudo completar el onboarding");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Paso {step} de 3</p>
        <h1 className="mt-1 text-xl font-bold text-fg">
          {step === 1 && "Confirma tus datos"}
          {step === 2 && "Instala la app en tu celular"}
          {step === 3 && "Notificaciones semanales"}
        </h1>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label htmlFor="onb-name" className="mb-1 block text-sm font-semibold text-fg">
              Nombre completo
            </label>
            <input
              id="onb-name"
              type="text"
              maxLength={80}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-border px-3.5 text-base text-fg outline-none focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="onb-phone" className="mb-1 block text-sm font-semibold text-fg">
              Teléfono (opcional)
            </label>
            <input
              id="onb-phone"
              type="tel"
              maxLength={15}
              placeholder="+56912345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-border px-3.5 text-base tabular-nums text-fg outline-none focus:border-primary"
            />
          </div>

          <div className="rounded-xl bg-bg p-3 text-sm text-fg-muted">
            <p>
              <strong className="text-fg">Correo:</strong> {profile.email}
            </p>
            {profile.role === "PARENT" && (
              <p className="mt-1">
                <strong className="text-fg">Hijos vinculados:</strong>{" "}
                {profile.children.length > 0
                  ? profile.children.map((c) => `${c.fullName} (${c.className})`).join(", ")
                  : "Pendiente de asignación por administración"}
              </p>
            )}
            {profile.role === "TEACHER" && (
              <p className="mt-1">
                <strong className="text-fg">Clases asignadas:</strong>{" "}
                {profile.classes.length > 0
                  ? profile.classes.map((c) => c.name).join(", ")
                  : "Pendiente de asignación"}
              </p>
            )}
          </div>

          {error && <p className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

          <button
            type="button"
            onClick={nextFromStep1}
            className="min-h-11 w-full rounded-xl bg-primary px-4 font-semibold text-white hover:bg-primary-hover"
          >
            Continuar
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Puedes usar la Escuela Dominical como una app en tu pantalla de inicio (opcional, recomendado):
          </p>
          <PwaInstallSteps />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="min-h-11 flex-1 rounded-xl border border-border px-4 font-semibold text-fg"
            >
              Atrás
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="min-h-11 flex-1 rounded-xl bg-primary px-4 font-semibold text-white hover:bg-primary-hover"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          {pushSupport === "supported" ? (
            <div className="rounded-xl border border-border bg-bg p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold text-fg">
                <Bell className="h-4 w-4 text-primary" /> Avisos los lunes
              </p>
              <p className="mt-1 text-fg-muted">
                Si permites notificaciones, te avisaremos cuando haya una nueva lección disponible para repasar.
              </p>
              {permStatus === "granted" ? (
                <p className="mt-3 flex items-center gap-1.5 font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" /> Permiso concedido
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => void askPushPermission()}
                  className="mt-3 min-h-11 w-full rounded-xl border border-primary bg-tint px-4 font-semibold text-tint-text hover:bg-tint-border/40"
                >
                  Permitir notificaciones
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-tint-border bg-tint p-4 text-sm text-tint-text">
              {pushSupport === "ios-not-standalone"
                ? "En iPhone/iPad debes abrir la app instalada desde tu pantalla de inicio (Safari → Compartir → Agregar a inicio) para activar notificaciones. Puedes finalizar ahora y activarlas luego en Mi Perfil."
                : "Este navegador no soporta notificaciones push ahora. Puedes finalizar normalmente y activarlas luego desde Mi Perfil en tu celular."}
            </div>
          )}

          {error && <p className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => setStep(2)}
              className="min-h-11 flex-1 rounded-xl border border-border px-4 font-semibold text-fg"
            >
              Atrás
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void finishOnboarding()}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Finalizar ingreso
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
