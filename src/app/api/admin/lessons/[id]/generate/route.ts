import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lessons, units } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { GeminiConfigError, generateLessonWithGemini, isRateLimitError } from "@/lib/gemini";
import { jsonError, parseBody, withErrorHandling } from "@/lib/http";
import { adminGenerateLessonSchema, uuidV4Schema } from "@/lib/validators";

type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonError(400, "ID de lección inválido");

  const parsed = await parseBody(req, adminGenerateLessonSchema);
  if (!parsed.ok) return parsed.response;

  const [row] = await db
    .select({ lesson: lessons, unitStatus: units.status })
    .from(lessons)
    .innerJoin(units, eq(lessons.unitId, units.id))
    .where(eq(lessons.id, id))
    .limit(1);
  if (!row) return jsonError(404, "Lección no encontrada");
  if (row.unitStatus === "FINISHED") {
    return jsonError(409, "No se puede regenerar contenido de una unidad finalizada");
  }
  const existing = row.lesson;

  let generated;
  try {
    generated = await generateLessonWithGemini({
      lessonNumber: existing.lessonNumber,
      rawText: parsed.data.rawText,
      hintTitle: parsed.data.hintTitle ?? existing.title ?? undefined,
    });
  } catch (err) {
    if (err instanceof GeminiConfigError) {
      return jsonError(500, "Servicio de IA no configurado en el servidor");
    }
    if (isRateLimitError(err)) {
      return jsonError(429, "Límite temporal de Gemini alcanzado. Reintenta en unos segundos.");
    }
    const msg = err instanceof Error ? err.message : "Error de generación IA";
    console.error("[gemini] error generando lección", id, msg);
    return jsonError(422, msg);
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(lessons)
      .set({
        title: generated.title,
        biblePassage: generated.biblePassage,
        parentSummary: generated.parentSummary,
        reinforcementQuestions: generated.reinforcementQuestions,
      })
      .where(eq(lessons.id, id))
      .returning();

    await recordAuditLog(
      {
        actorUserId: auth.user.id,
        actorRole: auth.user.role,
        action: "LESSON_AI_GENERATE",
        entityType: "lesson",
        entityId: id,
        details: { unitId: existing.unitId, lessonNumber: existing.lessonNumber, title: row.title },
      },
      tx,
    );
    return row;
  });

  return NextResponse.json({ item: updated });
});
