import { ProfileView } from "@/components/auth/ProfileView";
import { AppShell } from "@/components/layout/AppShell";
import { requireServerProfile } from "@/lib/session-server";

// Compartido para los 3 roles (PARENT, TEACHER, SUPER_ADMIN).
export default async function PerfilPage() {
  const profile = await requireServerProfile();
  return (
    <AppShell role={profile.role}>
      <ProfileView profile={profile} />
    </AppShell>
  );
}
