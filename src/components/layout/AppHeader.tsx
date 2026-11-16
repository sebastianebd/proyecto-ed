import type { Role } from "@/lib/auth";

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  TEACHER: "Profesor",
  PARENT: "Apoderado",
};

export function AppHeader({ role }: { role: Role }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">
            ED
          </span>
          <span className="text-sm font-bold text-fg sm:text-base">Escuela Dominical 5ta ACyM</span>
        </div>
        <span className="rounded-full bg-tint px-2.5 py-1 text-xs font-semibold text-tint-text">
          {ROLE_LABELS[role]}
        </span>
      </div>
    </header>
  );
}
