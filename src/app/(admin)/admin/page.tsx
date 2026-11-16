import { getServerProfile } from "@/lib/session-server";

export default async function AdminHomePlaceholderPage() {
  const profile = await getServerProfile();
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h1 className="text-lg font-bold text-fg">Panel Super Admin</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Bienvenido{profile ? `, ${profile.fullName}` : ""}. El módulo de administración se implementará en el Hito 2.
      </p>
    </section>
  );
}
