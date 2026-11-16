import { AppShell } from "@/components/layout/AppShell";
import { requireServerProfile } from "@/lib/session-server";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireServerProfile({ allowedRoles: ["TEACHER", "SUPER_ADMIN"] });
  return <AppShell role={profile.role}>{children}</AppShell>;
}
