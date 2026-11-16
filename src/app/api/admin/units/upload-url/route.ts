import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classes, units } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { jsonError, parseBody, withErrorHandling } from "@/lib/http";
import { buildUnitPdfKey, storage } from "@/lib/storage";
import { uploadUrlRequestSchema } from "@/lib/validators";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, uploadUrlRequestSchema);
  if (!parsed.ok) return parsed.response;

  if ("unitId" in parsed.data) {
    const [existing] = await db.select().from(units).where(eq(units.id, parsed.data.unitId)).limit(1);
    if (!existing) return jsonError(404, "Unidad no encontrada");
    if (existing.status !== "DRAFT") {
      return jsonError(409, "Solo se puede reemplazar el PDF de una unidad en borrador");
    }

    // Genera ruta nueva sin tocar ni borrar el pdf_storage_key previo hasta confirmar en process-pdf.
    const storageKey = buildUnitPdfKey(existing.classId);
    const signed = await storage.createSignedUploadUrl(storageKey);
    return NextResponse.json({ unitId: existing.id, storageKey, signedUrl: signed.signedUrl, token: signed.token });
  }

  const { classId, orderNumber, title } = parsed.data;
  const [cls] = await db
    .select({ id: classes.id, status: classes.status })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  if (!cls || cls.status !== "ACTIVE") {
    return jsonError(400, "La clase seleccionada no existe o está archivada");
  }

  const [draft] = await db
    .insert(units)
    .values({ classId, orderNumber, title, pdfStorageKey: null, status: "DRAFT" })
    .returning();

  const storageKey = buildUnitPdfKey(classId);
  try {
    const signed = await storage.createSignedUploadUrl(storageKey);
    return NextResponse.json(
      { unitId: draft.id, storageKey, signedUrl: signed.signedUrl, token: signed.token },
      { status: 201 },
    );
  } catch (err) {
    // Si falla la generación de URL en Storage, limpiamos el borrador vacío recién creado.
    await db.delete(units).where(eq(units.id, draft.id));
    throw err;
  }
});
