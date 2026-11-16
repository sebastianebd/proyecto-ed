"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth";

const TEACHER_TABS = [
  { href: "/profesor/asistencia", label: "Asistencia" },
  { href: "/profesor/alumnos", label: "Alumnos" },
  { href: "/profesor/lecciones", label: "Lecciones" },
  { href: "/profesor/resumen", label: "Resumen" },
];

/** Sub-navegación visible en Modo Profesor para Super Admin (cuyo BottomNav apunta a /admin). */
export function TeacherAdminBar({ role }: { role: Role }) {
  const pathname = usePathname();
  if (role !== "SUPER_ADMIN") return null;

  return (
    <div className="mb-4 space-y-2 rounded-2xl border border-tint-border bg-tint p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-tint-text">Modo Profesor (Super Admin)</span>
        <Link
          href="/admin"
          className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-surface px-2.5 text-xs font-semibold text-fg hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a Admin
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {TEACHER_TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex min-h-10 items-center justify-center rounded-xl text-xs font-semibold transition-colors ${
                active ? "bg-primary text-white" : "bg-surface text-fg-muted hover:text-fg"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
