"use client";

import { KeyRound, Loader2, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatRutForInput } from "@/lib/rut";
import { requestOtpSchema, verifyOtpSchema } from "@/lib/validators";

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"rut" | "otp">("rut");
  const [rut, setRut] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function handleRutChange(raw: string) {
    setError(null);
    setRut(formatRutForInput(raw));
  }

  function handleRutPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    setError(null);
    setRut(formatRutForInput(pasted));
  }

  async function submitRut(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const parsed = requestOtpSchema.safeParse({ rut });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "RUT inválido");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut: parsed.data.rut }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setError(body.error ?? "No se pudo solicitar el código");
        return;
      }
      setInfo(body.message ?? "Si tu RUT está registrado, enviaremos un código a tu correo.");
      setCode("");
      setStep("otp");
      setCooldown(60);
    } catch {
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = verifyOtpSchema.safeParse({ rut, code });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await res.json()) as { error?: string; user?: { status: string } };
      if (!res.ok) {
        setError(body.error ?? "Código inválido o expirado");
        return;
      }
      const nextRoute = body.user?.status === "PENDING_ONBOARDING" ? "/onboarding" : "/";
      router.replace(nextRoute);
      router.refresh();
    } catch {
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary font-bold text-white">
          ED
        </div>
        <h1 className="text-xl font-bold text-fg">Escuela Dominical 5ta ACyM</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {step === "rut" ? "Ingresa con tu RUT chileno" : "Ingresa el código de 6 dígitos"}
        </p>
      </div>

      {step === "rut" ? (
        <form onSubmit={submitRut} className="space-y-4">
          <div>
            <label htmlFor="rut-input" className="mb-1.5 block text-sm font-semibold text-fg">
              RUT
            </label>
            <input
              id="rut-input"
              type="text"
              autoComplete="username"
              placeholder="12.345.678-5"
              maxLength={20}
              value={rut}
              onChange={(e) => handleRutChange(e.target.value)}
              onPaste={handleRutPaste}
              className="min-h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base tabular-nums text-fg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <p className="mt-1.5 text-xs text-fg-muted">Sin puntos si prefieres; nosotros lo formateamos.</p>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Enviar código
          </button>
        </form>
      ) : (
        <form onSubmit={submitOtp} className="space-y-4">
          {info && (
            <div className="flex gap-2.5 rounded-xl border border-tint-border bg-tint p-3 text-sm text-tint-text">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">{info}</p>
                <p className="mt-1 text-xs opacity-90">
                  Si no recibes el correo en un par de minutos, revisa spam o solicita ayuda al encargado.
                </p>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="otp-input" className="mb-1.5 block text-sm font-semibold text-fg">
              Código de 6 dígitos (RUT <span className="tabular-nums">{rut}</span>)
            </label>
            <input
              id="otp-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => {
                setError(null);
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
              }}
              className="min-h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-center text-xl font-bold tracking-[0.35em] tabular-nums text-fg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Ingresar
          </button>

          <div className="flex items-center justify-between gap-2 pt-1 text-sm">
            <button
              type="button"
              disabled={cooldown > 0 || loading}
              onClick={() => void submitRut()}
              className="min-h-11 rounded-xl px-3 font-semibold text-primary hover:bg-tint disabled:text-fg-muted disabled:hover:bg-transparent"
            >
              {cooldown > 0 ? `Reenviar en ${cooldown}s` : "Reenviar código"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("rut");
                setCode("");
                setError(null);
              }}
              className="min-h-11 rounded-xl px-3 font-medium text-fg-muted hover:text-fg"
            >
              Cambiar RUT
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
