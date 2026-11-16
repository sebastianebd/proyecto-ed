import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lessons, units } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { jsonError, parseBody, withErrorHandling } from "@/lib/http";
import { extractAndSplitUnitPdf, hasPdfMagicBytes } from "@/lib/pdf";
import { MAX_PDF_BYTES, storage } from "@/lib/storage";
import { processPdfSchema, uuidV4Schema } from "@/lib/validators";

type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(async (req: NextRequest, ctx: RouteCtx) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!uuidV4Schema.safeParse(id).success) return jsonError(400, "ID de unidad inválido");

  const parsed = await parseBody(req, processPdfSchema);
  if (!parsed.ok) return parsed.response;

  const [unit] = await db.select().from(units).where(eq(units.id, id)).limit(1);
  if (!unit) return jsonError(404, "Unidad no encontrada");
  if (unit.status !== "DRAFT") {
    return jsonError(409, "Solo se puede procesar el PDF de unidades en borrador");
  }

  const { storageKey } = parsed.data;
  if (!storageKey.startsWith(`units/${unit.classId}/`)) {
    return jsonError(400, "La ruta del PDF no corresponde a la clase de la unidad");
  }

  // 1. Verificar metadatos en Storage antes de descargar el archivo a memoria.
  const info = await storage.getObjectInfo(storageKey);
  if (!info) return jsonError(400, "El archivo PDF no existe en Storage");
  if (info.size > MAX_PDF_BYTES) {
    await storage.removeObject(storageKey);
    return jsonError(400, "El PDF supera el límite máximo de 25 MB");
  }

  // 2. Descargar y validar magic bytes %PDF- (si falla, elimina el objeto nuevo manteniendo el anterior intacto).
  const buffer = await storage.downloadBuffer(storageKey);
  if (buffer.byteLength > MAX_PDF_BYTES) {
    await storage.removeObject(storageKey);
    return jsonError(400, "El PDF supera el límite máximo de 25 MB");
  }
  if (!hasPdfMagicBytes(buffer)) {
    await storage.removeObject(storageKey);
    return jsonError(400, "El archivo subido no es un PDF válido (%PDF- ausente)");
  }

  // 3. Extraer texto con `unpdf` y dividir en 14 borradores editables.
  const extracted = await extractAndSplitUnitPdf(buffer);
  const previousStorageKey = unit.pdfStorageKey;

  const savedLessons = await db.transaction(async (tx) => {
    await tx.update(units).set({ pdfStorageKey: storageKey }).where(eq(units.id, id));

    const existingLessons = await tx.select().from(lessons).where(eq(lessons.unitId, id));
    const existingByNum = new Map(existingLessons.map((l) => [l.lessonNumber, l]));

    for (const draft of extracted.drafts) {
      const prev = existingByNum.get(draft.lessonNumber);
      if (!prev) {
        await tx.insert(lessons).values({
          unitId: id,
          lessonNumber: draft.lessonNumber,
          title: draft.title.slice(0, 120),
          scheduleStatus: "SCHEDULED",
        });
      } else if (!prev.title) {
        await tx.update(lessons).set({ title: draft.title.slice(0, 120) }).where(eq(lessons.id, prev.id));
      }
    }

    await recordAuditLog(
      {
        actorUserId: auth.user.id,
        actorRole: auth.user.role,
        action: "UNIT_PDF_UPLOAD",
        entityType: "unit",
        entityId: id,
        details: {
          storageKey,
          totalPages: extracted.totalPages,
          scannedWarning: extracted.scannedWarning,
          replacedPrevious: Boolean(previousStorageKey),
        },
      },
      tx,
    );

    return tx.select().from(lessons).where(eq(lessons.unitId, id)).orderBy(asc(lessons.lessonNumber));
  });

  // 4. Solo tras confirmar el swap en BD, limpiar el archivo anterior en Storage si existía.
  if (previousStorageKey && previousStorageKey !== storageKey) {
    await storage.removeObject(previousStorageKey);
  }

  const draftsWithIds = extracted.drafts.map((d) => {
    const row = savedLessons.find((l) => l.lessonNumber === d.lessonNumber)!;
    return {
      lessonId: row.id,
      lessonNumber: d.lessonNumber,
      title: row.title ?? d.title,
      rawText: d.rawText,
    };
  });

  return NextResponse.json({
    ok: true,
    storageKey,
    totalPages: extracted.totalPages,
    scannedWarning: extracted.scannedWarning,
    drafts: draftsWithIds,
  });
});
