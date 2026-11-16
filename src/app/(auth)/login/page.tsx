import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getServerSessionUser, homePathForRole } from "@/lib/session-server";

export default async function LoginPage() {
  const user = await getServerSessionUser();
  if (user) {
    redirect(user.status === "PENDING_ONBOARDING" ? "/onboarding" : homePathForRole(user.role));
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <LoginForm />
    </main>
  );
}
