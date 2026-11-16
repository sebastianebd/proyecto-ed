"use client";

import { BookOpen, RotateCcw, UserCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { UserProfile } from "@/lib/profile";
import { UnitAccordion } from "./UnitAccordion";
import type { ParentUnitsResponse } from "./types";

export function ParentHomeView({ profile }: { profile: UserProfile }) {
  const initialActiveChildren = profile.children.filter((c) => c.status === "ACTIVE");
  const [data, setData] = useState<ParentUnitsResponse | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string>("ALL");
  const [loading, setLoading] = useState(initialActiveChildren.length > 0);
  const [noActiveChildren, setNoActiveChildren] = useState(initialActiveChildren.length === 0);
  const [error, setError] = useState<string | null>(null);

  const loadUnits = useCallback(async (isInitialWithoutActive = false) => {
    setError(null);
    if (isInitialWithoutActive) {
      const meRes = await fetch("/api/auth/me").catch(() => null);
      if (meRes?.ok) {
        const meData = (await meRes.json().catch(() => null)) as { user?: UserProfile } | null;
        const hasActive = meData?.user?.children.some((c) => c.status === "ACTIVE") ?? false;
        if (!hasActive) return;
        setNoActiveChildren(false);
      } else {
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch("/api/parent/units");
      if (res.status === 403) {
        const meRes = await fetch("/api/auth/me").catch(() => null);
        if (meRes?.ok) {
          const meData = (await meRes.json().catch(() => null)) as { user?: UserProfile } | null;
          if (!meData?.user?.children.some((c) => c.status === "ACTIVE")) {
            setNoActiveChildren(true);
            return;
          }
        }
        setNoActiveChildren(true);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "No se pudieron cargar las lecciones");
        return;
      }
      const payload = (await res.json()) as ParentUnitsResponse;
      setNoActiveChildren(false);
      setData(payload);
      if (payload.classes.length === 1) {
        setSelectedClassId(payload.classes[0].classId);
      }
    } catch {
      setError("Error de conexión al cargar las unidades");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUnits(initialActiveChildren.length === 0);
  }, [initialActiveChildren.length, loadUnits]);

  if (noActiveChildren) {
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-tint-border bg-tint p-5">
          <h1 className="text-lg font-bold text-tint-text">Hola, {profile.fullName}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-fg">
            Tu cuenta está activa, pero actualmente no tienes alumnos activos vinculados para mostrar lecciones.
          </p>
          <p className="mt-1.5 text-xs text-fg-muted">
            Contacta al encargado de Escuela Dominical para vincular o reactivar a tu(s) hijo(s).
          </p>
          <Link
            href="/perfil"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            Ir a Mi Perfil
          </Link>
        </section>
      </div>
    );
  }

  const classes = data?.classes ?? [];
  const units = data?.units ?? [];
  const filteredUnits =
    selectedClassId === "ALL" ? units : units.filter((u) => u.classId === selectedClassId);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-tint-border bg-tint p-4 sm:p-5">
        <h1 className="text-lg font-bold text-tint-text">Hola, {profile.fullName}</h1>
        <p className="mt-1 text-xs text-fg sm:text-sm">
          Repasa en familia las lecciones semanales de{" "}
          {(data?.children ?? initialActiveChildren).map((c) => c.fullName).join(", ")}.
        </p>
      </section>

      {classes.length > 1 && (
        <div role="tablist" aria-label="Filtrar por clase o hijo" className="flex flex-wrap gap-2">
          <button
            type="button"
            role="tab"
            aria-selected={selectedClassId === "ALL"}
            onClick={() => setSelectedClassId("ALL")}
            className={`min-h-11 rounded-xl border px-3.5 text-xs font-semibold transition-colors ${
              selectedClassId === "ALL"
                ? "border-primary bg-primary text-white"
                : "border-border bg-surface text-fg hover:bg-bg"
            }`}
          >
            Todas ({units.length})
          </button>
          {classes.map((cls) => (
            <button
              key={cls.classId}
              type="button"
              role="tab"
              aria-selected={selectedClassId === cls.classId}
              onClick={() => setSelectedClassId(cls.classId)}
              className={`min-h-11 rounded-xl border px-3.5 text-left text-xs font-semibold transition-colors ${
                selectedClassId === cls.classId
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface text-fg hover:bg-bg"
              }`}
            >
              <span>{cls.className}</span>
              {cls.childNames.length > 0 && (
                <span className={`ml-1.5 font-normal ${selectedClassId === cls.classId ? "text-white/90" : "text-fg-muted"}`}>
                  · {cls.childNames.join(", ")}
                </span>
              )}
              {cls.isHistoricalOnly && (
                <span className="ml-1.5 rounded-full bg-locked-bg px-1.5 py-0.5 text-[10px] text-fg-muted">
                  Historial
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="space-y-3" aria-busy="true" aria-label="Cargando lecciones">
          <div className="h-24 animate-pulse rounded-2xl border border-border bg-surface" />
          <div className="h-24 animate-pulse rounded-2xl border border-border bg-surface" />
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadUnits(false)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-danger/30 bg-surface px-3 text-xs font-semibold text-danger hover:bg-bg"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reintentar
          </button>
        </div>
      )}

      {!loading && !error && filteredUnits.length === 0 && (
        <section className="rounded-2xl border border-border bg-surface p-5 text-center">
          <BookOpen className="mx-auto h-7 w-7 text-fg-muted" />
          <p className="mt-2 text-sm font-semibold text-fg">Aún no hay unidades publicadas</p>
          <p className="mt-1 text-xs text-fg-muted">
            Cuando la coordinación publique la unidad de esta clase, sus lecciones aparecerán aquí cada lunes.
          </p>
        </section>
      )}

      {!loading && !error && filteredUnits.length > 0 && (
        <div className="space-y-3">
          {filteredUnits.map((unit) => (
            <UnitAccordion key={unit.id} unit={unit} showClassBadge={classes.length > 1} />
          ))}
        </div>
      )}

      {!loading && data && (
        <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-fg-muted">
          <UserCheck className="h-3.5 w-3.5" />
          El progreso de completado se sincroniza automáticamente entre ambos apoderados.
        </p>
      )}
    </div>
  );
}
