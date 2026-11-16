import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ParentHomeView } from "@/components/lessons/ParentHomeView";
import { getServerProfile, homePathForRole } from "@/lib/session-server";

// Despachador servidor por rol (docs/04-codificacion.md §4 Hito 1).
export default async function HomePage() {
  const profile = await getServerProfile();
  if (!profile) redirect("/login");
  if (profile.status === "PENDING_ONBOARDING") redirect("/onboarding");
  if (profile.role !== "PARENT") redirect(homePathForRole(profile.role));

  return (
    <AppShell role={profile.role}>
      <ParentHomeView profile={profile} />
    </AppShell>
  );
}
