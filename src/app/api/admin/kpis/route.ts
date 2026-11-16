import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { jsonError, withErrorHandling } from "@/lib/http";
import { calculateKpis } from "@/lib/kpis";
import { uuidV4Schema } from "@/lib/validators";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const classId = new URL(req.url).searchParams.get("classId") || undefined;
  if (classId && !uuidV4Schema.safeParse(classId).success) {
    return jsonError(400, "classId inválido");
  }

  const kpis = await calculateKpis({ classId });
  return NextResponse.json({ kpis });
});
