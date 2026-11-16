import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { jsonError, withErrorHandling } from "@/lib/http";
import { calculateKpis } from "@/lib/kpis";
import { getTeacherClassFilterIds } from "@/lib/teacher";
import { uuidV4Schema } from "@/lib/validators";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["TEACHER", "SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const classId = new URL(req.url).searchParams.get("classId") || undefined;
  if (classId && !uuidV4Schema.safeParse(classId).success) {
    return jsonError(400, "classId inválido");
  }

  if (classId) {
    const filterResult = await getTeacherClassFilterIds(auth.user, classId);
    if (!Array.isArray(filterResult)) return filterResult;
    const kpis = await calculateKpis({ classId });
    return NextResponse.json({ kpis });
  }

  if (auth.user.role === "SUPER_ADMIN") {
    const kpis = await calculateKpis();
    return NextResponse.json({ kpis });
  }

  const classIds = await getTeacherClassFilterIds(auth.user);
  if (!Array.isArray(classIds)) return classIds;
  const kpis = await calculateKpis({ classIds });
  return NextResponse.json({ kpis });
});
