import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/auth/OnboardingWizard";
import { homePathForRole, requireServerProfile } from "@/lib/session-server";

export default async function OnboardingPage() {
  const profile = await requireServerProfile({ allowOnboarding: true });
  if (profile.status === "ACTIVE") redirect(homePathForRole(profile.role));

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <OnboardingWizard profile={profile} />
    </main>
  );
}
