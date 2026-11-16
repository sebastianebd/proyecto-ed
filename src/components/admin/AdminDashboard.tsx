"use client";

import { Baby, ClipboardList, FileText, GraduationCap, ScrollText, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { KpiSummary } from "@/lib/kpis";

type ClassOption = { id: string; name: string; status: string };

export function AdminDashboard({
  adminName,
  initialKpis,
  classes,
}: {
  adminName: string;
  initialKpis: KpiSummary;
  classes: ClassOption[];
}) {
  const [selectedClass, setSelectedClass] = useState("");
  const [kpis, setKpis] = useState<KpiSummary>(initialKpis);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedClass) {
      setKpis(initialKpis);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/kpis?classId=${encodeURIComponent(selectedClass)}`)
      .then((r) => r.json())
      .then((data: { kpis?: KpiSummary }) => {
        if (!cancelled && data.kpis) setKpis(data.kpis);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedClass, initialKpis]);

  const cards = [
    {
      label: "Asistencia dominical",
      pct: kpis.attendancePct,
      detail: `${kpis.attendancePresent} de ${kpis.attendanceTotal} evaluados`,
    },
    {
      label: "Apertura (Visto)",
      pct: kpis.openingPct,
      detail: `${kpis.openingViewed} de ${kpis.openingExpected} pares padre-lección`,
    },
    {
      label: "Refuerzo en casa",
      pct: kpis.completionPct,
      detail: `${kpis.completionDone} de ${kpis.completionExpected} pares alumno-lección`,
    },
  ];

  const shortcuts = [
    { href: "/admin/clases", title: "Clases", desc: "Crear, archivar y asignar profesores", icon: GraduationCap },
    { href: "/admin/usuarios", title: "Usuarios y En línea", desc: "Padres, profesores, OTP y sesiones", icon: Users },
    { href: "/admin/alumnos", title: "Niños y Ficha", desc: "Cuidados, vínculos N:M e historial", icon: Baby },
    { href: "/admin/logs", title: "Logs de Auditoría", desc: "Trazabilidad inmutable paginada", icon: ScrollText },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-tint-border bg-tint p-5">
        <h1 className="text-xl font-bold text-tint-text">Panel Super Admin</h1>
        <p className="mt-1 text-sm text-fg">Hola, {adminName}. Gestiona clases, familias, alumnos y auditoría.</p>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-fg">Indicadores (KPIs)</h2>
          <select
            aria-label="Filtrar KPIs por clase"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="min-h-11 rounded-xl border border-border bg-bg px-3 text-sm font-medium text-fg"
          >
            <option value="">Todas las clases</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.status === "ARCHIVED" ? "(Archivada)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className={`grid gap-3 sm:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
          {cards.map((card) => (
            <div key={card.label} className="rounded-xl border border-border bg-bg p-3.5">
              <p className="text-xs font-semibold text-fg-muted">{card.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{card.pct}%</p>
              <p className="mt-0.5 text-xs text-fg-muted">{card.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {shortcuts.map(({ href, title, desc, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-16 items-start gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary/50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tint text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-bold text-fg">{title}</p>
              <p className="text-xs text-fg-muted">{desc}</p>
            </div>
          </Link>
        ))}

        <Link
          href="/profesor/asistencia"
          className="flex min-h-16 items-start gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary/50"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success-bg text-success">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <p className="font-bold text-fg">Modo Profesor</p>
            <p className="text-xs text-fg-muted">Asistencia, fichas y PDFs (Hito 5)</p>
          </div>
        </Link>

        <div className="flex min-h-16 items-start gap-3 rounded-2xl border border-dashed border-border bg-locked-bg/60 p-4 opacity-80">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-locked">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <p className="font-bold text-fg">Unidades PDF e IA</p>
            <p className="text-xs text-fg-muted">Disponible en Hito 3</p>
          </div>
        </div>
      </section>
    </div>
  );
}
