"use client";

import { useCallback, useEffect, useState } from "react";
import type { KpiSummary } from "@/lib/kpi-math";
import type { TeacherClassItem } from "./types";

export function TeacherResumenView() {
  const [classes, setClasses] = useState<TeacherClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [kpis, setKpis] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (classIdFilter: string) => {
    setLoading(true);
    setError(null);
    try {
      const kpiUrl = classIdFilter
        ? `/api/teacher/kpis?classId=${encodeURIComponent(classIdFilter)}`
        : "/api/teacher/kpis";

      const [clsRes, kpiRes] = await Promise.all([fetch("/api/teacher/classes"), fetch(kpiUrl)]);
      const clsBody = (await clsRes.json().catch(() => ({}))) as { classes?: TeacherClassItem[]; error?: string };
      const kpiBody = (await kpiRes.json().catch(() => ({}))) as { kpis?: KpiSummary; error?: string };

      if (!clsRes.ok || !clsBody.classes) {
        setError(clsBody.error ?? "No se pudieron cargar tus clases");
        return;
      }
      if (!kpiRes.ok || !kpiBody.kpis) {
        setError(kpiBody.error ?? "No se pudieron cargar los KPIs");
        return;
      }

      setClasses(clsBody.classes);
      setKpis(kpiBody.kpis);
    } catch {
      setError("Error de conexión al cargar resumen");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(selectedClassId);
  }, [selectedClassId, loadData]);

  const cards = kpis
    ? [
        {
          label: "Asistencia dominical",
          pct: kpis.attendancePct,
          detail: `${kpis.attendancePresent} de ${kpis.attendanceTotal} evaluados en domingos registrados`,
        },
        {
          label: "Apertura (Visto)",
          pct: kpis.openingPct,
          detail: `${kpis.openingViewed} de ${kpis.openingExpected} pares padre-lección desbloqueados`,
        },
        {
          label: "Refuerzo en casa (Completado)",
          pct: kpis.completionPct,
          detail: `${kpis.completionDone} de ${kpis.completionExpected} pares alumno-lección`,
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-fg">Resumen y KPIs</h1>
            <p className="mt-0.5 text-xs text-fg-muted">
              Participación de tu curso en asistencia dominical, lectura y refuerzo en casa.
            </p>
          </div>
          {classes.length > 0 && (
            <select
              aria-label="Filtrar KPIs por clase"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="min-h-11 rounded-xl border border-border bg-bg px-3 text-sm font-medium text-fg"
            >
              <option value="">Todas mis clases</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="h-28 animate-pulse rounded-2xl bg-border/60" />
          <div className="h-28 animate-pulse rounded-2xl bg-border/60" />
          <div className="h-28 animate-pulse rounded-2xl bg-border/60" />
        </div>
      ) : (
        <section className="grid gap-3 sm:grid-cols-3">
          {cards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs font-semibold text-fg-muted">{card.label}</p>
              <p className="mt-1.5 text-3xl font-bold tabular-nums text-primary">{card.pct}%</p>
              <p className="mt-1 text-xs text-fg-muted">{card.detail}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
