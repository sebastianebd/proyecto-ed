import type { Role } from "@/lib/auth";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";
import { PresenceTracker } from "./PresenceTracker";

// AppShell envuelve únicamente vistas autenticadas con estado ACTIVE.
export function AppShell({ role, children }: { role: Role; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <PresenceTracker enabled />
      <AppHeader role={role} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-5 pb-24">{children}</main>
      <BottomNav role={role} />
    </div>
  );
}
