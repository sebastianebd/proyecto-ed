import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findActiveSession, homePathForRole, sessionCookieName, type AuthUser, type Role } from "@/lib/auth";
import { loadUserProfile, type UserProfile } from "@/lib/profile";

export { homePathForRole };

// Exclusivo para Server Components (usa next/headers). Route Handlers usan req: NextRequest.

export async function getServerSessionUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  const found = await findActiveSession(token);
  return found?.user ?? null;
}

export async function getServerProfile(): Promise<UserProfile | null> {
  const user = await getServerSessionUser();
  return user ? loadUserProfile(user) : null;
}

export async function requireServerProfile(options: { allowedRoles?: Role[]; allowOnboarding?: boolean } = {}): Promise<UserProfile> {
  const profile = await getServerProfile();
  if (!profile) redirect("/login");
  if (profile.status === "PENDING_ONBOARDING" && !options.allowOnboarding) redirect("/onboarding");
  if (options.allowedRoles && !options.allowedRoles.includes(profile.role)) {
    redirect(homePathForRole(profile.role));
  }
  return profile;
}
