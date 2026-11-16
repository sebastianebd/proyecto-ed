import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { jsonError, parseBody, withErrorHandling } from "@/lib/http";
import { DomainHttpError, shiftUnitSchedule } from "@/lib/unit-schedule";
import { unitScheduleShiftSchema, uuidV4Schema } from "@/lib/validators";

type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonError(400, "ID de unidad inválido");

  const parsed = await parseBody(req, unitScheduleShiftSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await shiftUnitSchedule({
      unitId: id,
      direction: 1,
      fromLessonNumber: parsed.data.fromLessonNumber,
      actor: auth.user,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof DomainHttpError) return jsonError(err.status, err.message);
    throw err;
  }
});
