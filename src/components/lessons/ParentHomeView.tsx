import type { UserProfile } from "@/lib/profile";

export function ParentHomeView({ profile }: { profile: UserProfile }) {
  const activeChildren = profile.children.filter((c) => c.status === "ACTIVE");

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-tint-border bg-tint p-5">
        <h1 className="text-lg font-bold text-tint-text">Hola, {profile.fullName}</h1>
        <p className="mt-1 text-sm text-fg">
          {activeChildren.length > 0
            ? "Aquí aparecerán las unidades y lecciones semanales de tus hijos."
            : "Tu cuenta está activa, pero actualmente no tienes alumnos activos vinculados. Contacta al encargado si necesitas ayuda."}
        </p>
      </section>

      {activeChildren.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-bold text-fg">Tus hijos activos</h2>
          <ul className="mt-2.5 space-y-2">
            {activeChildren.map((c) => (
              <li key={c.id} className="rounded-xl bg-bg px-3.5 py-2.5 text-sm">
                <p className="font-semibold text-fg">{c.fullName}</p>
                <p className="text-xs text-fg-muted">{c.className}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-fg-muted">Acordeón de lecciones y seguimiento familiar (Hito 4).</p>
        </section>
      )}
    </div>
  );
}
