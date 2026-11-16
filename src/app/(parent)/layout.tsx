import { AppShell } from "@/components/layout/AppShell";
import { requireServerProfile } from "@/lib/session-server";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireServerProfile({ allowedRoles: ["PARENT"] });
  return <AppShell role={profile.role}>{children}</AppShell>;
}
