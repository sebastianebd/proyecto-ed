import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { withErrorHandling } from "@/lib/http";
import { loadUserProfile } from "@/lib/profile";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowOnboarding: true });
  if (!auth.ok) return auth.response;

  const profile = await loadUserProfile(auth.user);
  return NextResponse.json({ user: profile });
});
