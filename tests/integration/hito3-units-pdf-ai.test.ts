import { asc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as generateLessonHandler } from "@/app/api/admin/lessons/[id]/generate/route";
import { PATCH as patchLessonHandler } from "@/app/api/admin/lessons/[id]/route";
import { POST as postponeHandler } from "@/app/api/admin/units/[id]/postpone/route";
import { POST as processPdfHandler } from "@/app/api/admin/units/[id]/process-pdf/route";
import { DELETE as deleteUnitHandler, PATCH as patchUnitHandler } from "@/app/api/admin/units/[id]/route";
import { POST as unpostponeHandler } from "@/app/api/admin/units/[id]/unpostpone/route";
import { GET as listUnitsHandler } from "@/app/api/admin/units/route";
import { POST as uploadUrlHandler } from "@/app/api/admin/units/upload-url/route";
import { GET as teacherPdfHandler } from "@/app/api/teacher/units/[id]/pdf/route";
import { db } from "@/db";
import { auditLogs, classes, classTeachers, lessons, sessions, units, users } from "@/db/schema";
import { generateSessionToken, hashToken, sessionCookieName } from "@/lib/auth";
import * as geminiModule from "@/lib/gemini";
import * as pdfModule from "@/lib/pdf";
import { MAX_PDF_BYTES, storage } from "@/lib/storage";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const dbUrl = process.env.DATABASE_URL ?? "";
let sql: ReturnType<typeof postgres>;

const fakeBucket = new Map<string, Buffer>();

function req(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers = new Headers();
  headers.set("origin", APP_URL);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (init.cookie) headers.set("cookie", init.cookie);
  return new NextRequest(`${APP_URL}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

async function createUserSession(opts: { rut: string; email: string; role: "SUPER_ADMIN" | "TEACHER" | "PARENT" }) {
  const [user] = await db
    .insert(users)
    .values({
      rut: opts.rut,
      fullName: `User ${opts.role}`,
      email: opts.email,
      role: opts.role,
      status: "ACTIVE",
      onboardedAt: new Date(),
    })
    .returning();
  const rawToken = generateSessionToken();
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  return { user, cookie: `${sessionCookieName()}=${rawToken}` };
}

beforeAll(() => {
  if (!/\/ed_test(\?|$)/.test(dbUrl)) throw new Error("DATABASE_URL debe apuntar a ed_test");
  sql = postgres(dbUrl, { prepare: false, max: 1 });

  vi.spyOn(storage, "createSignedUploadUrl").mockImplementation(async (key) => ({
    signedUrl: `https://example.supabase.co/storage/v1/object/upload/sign/unit-pdfs/${key}?token=mock`,
    token: "mock-token",
    path: key,
  }));
  vi.spyOn(storage, "createSignedDownloadUrl").mockImplementation(
    async (key) => `https://example.supabase.co/storage/v1/object/sign/unit-pdfs/${key}?download=`,
  );
  vi.spyOn(storage, "getObjectInfo").mockImplementation(async (key) => {
    const buf = fakeBucket.get(key);
    return buf ? { size: buf.byteLength, contentType: "application/pdf" } : null;
  });
  vi.spyOn(storage, "downloadBuffer").mockImplementation(async (key) => {
    const buf = fakeBucket.get(key);
    if (!buf) throw new Error("Objeto no encontrado en mock");
    return buf;
  });
  vi.spyOn(storage, "removeObject").mockImplementation(async (key) => {
    fakeBucket.delete(key);
  });

  vi.spyOn(pdfModule, "extractAndSplitUnitPdf").mockImplementation(async (buf) => {
    if (!pdfModule.hasPdfMagicBytes(buf)) throw new Error("No PDF");
    return {
      scannedWarning: false,
      totalPages: 42,
      drafts: Array.from({ length: 14 }, (_, i) => ({
        lessonNumber: i + 1,
        title: `Lección ${i + 1}: Título base`,
        rawText: `Contenido pedagógico extraído de la lección número ${i + 1}.`,
      })),
    };
  });

  vi.spyOn(geminiModule, "generateLessonWithGemini").mockImplementation(async ({ lessonNumber }) => ({
    title: `Lección ${lessonNumber}: Dios es fiel`,
    biblePassage: `Salmo ${lessonNumber}:1-8`,
    parentSummary: [
      `Resumen familiar de la lección ${lessonNumber} redactado en lenguaje claro para padres.`,
      "Conversen sobre cómo aplicar esta verdad bíblica en casa durante la semana.",
    ],
    reinforcementQuestions: [
      `¿Qué aprendiste hoy en la lección ${lessonNumber} sobre confiar en Dios?`,
      "¿Cómo podemos practicar esta enseñanza en familia?",
    ],
  }));
});

beforeEach(async () => {
  fakeBucket.clear();
  await sql`TRUNCATE users, classes, rate_limits, audit_logs CASCADE`;
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await sql?.end();
});

describe("Hito 3 — Unidades PDF, Storage, IA y Compuerta ACTIVE", () => {
  it("subida segura, rechazo >25MB y sin %PDF- conservando key previo, reemplazo limpio y borrado de DRAFT", async () => {
    const { cookie: adminCookie } = await createUserSession({ rut: "18963546-K", email: "a@a.cl", role: "SUPER_ADMIN" });
    const [cls] = await db.insert(classes).values({ name: "Párvulos" }).returning();

    // 1. upload-url crea DRAFT con pdf_storage_key = NULL
    const up1 = await uploadUrlHandler(
      req("/api/admin/units/upload-url", {
        method: "POST",
        cookie: adminCookie,
        body: { classId: cls.id, orderNumber: 1, title: "Unidad 1", fileName: "u1.pdf" },
      }),
    );
    expect(up1.status).toBe(201);
    const { unitId, storageKey: key1 } = (await up1.json()) as { unitId: string; storageKey: string };
    const [draftRow] = await db.select().from(units).where(eq(units.id, unitId));
    expect(draftRow.status).toBe("DRAFT");
    expect(draftRow.pdfStorageKey).toBeNull();

    // 2. process-pdf con PDF válido -> asigna key1 y crea 14 borradores
    fakeBucket.set(key1, Buffer.from("%PDF-1.7\ncontenido"));
    const proc1 = await processPdfHandler(
      req(`/api/admin/units/${unitId}/process-pdf`, { method: "POST", cookie: adminCookie, body: { storageKey: key1 } }),
      { params: Promise.resolve({ id: unitId }) },
    );
    expect(proc1.status).toBe(200);
    const proc1Body = (await proc1.json()) as { drafts: { lessonId: string; lessonNumber: number }[] };
    expect(proc1Body.drafts).toHaveLength(14);

    // 3. Reemplazo con archivo falso (HTML sin %PDF-) o > 25MB mantiene intacto key1 y elimina el inválido
    const upBad = await uploadUrlHandler(
      req("/api/admin/units/upload-url", { method: "POST", cookie: adminCookie, body: { unitId, fileName: "bad.pdf" } }),
    );
    const { storageKey: badKey } = (await upBad.json()) as { storageKey: string };
    fakeBucket.set(badKey, Buffer.from("<html>malicioso</html>"));
    const procBad = await processPdfHandler(
      req(`/api/admin/units/${unitId}/process-pdf`, { method: "POST", cookie: adminCookie, body: { storageKey: badKey } }),
      { params: Promise.resolve({ id: unitId }) },
    );
    expect(procBad.status).toBe(400);
    expect(fakeBucket.has(badKey)).toBe(false);
    expect(fakeBucket.has(key1)).toBe(true);
    expect((await db.select().from(units).where(eq(units.id, unitId)))[0].pdfStorageKey).toBe(key1);

    // Archivo > 25 MB en metadatos
    const upHuge = await uploadUrlHandler(
      req("/api/admin/units/upload-url", { method: "POST", cookie: adminCookie, body: { unitId, fileName: "huge.pdf" } }),
    );
    const { storageKey: hugeKey } = (await upHuge.json()) as { storageKey: string };
    fakeBucket.set(hugeKey, Buffer.alloc(MAX_PDF_BYTES + 1));
    const procHuge = await processPdfHandler(
      req(`/api/admin/units/${unitId}/process-pdf`, { method: "POST", cookie: adminCookie, body: { storageKey: hugeKey } }),
      { params: Promise.resolve({ id: unitId }) },
    );
    expect(procHuge.status).toBe(400);
    expect(fakeBucket.has(hugeKey)).toBe(false);

    // 4. Reemplazo válido (key2) asigna key2 y recién ahí borra key1 de Storage
    const up2 = await uploadUrlHandler(
      req("/api/admin/units/upload-url", { method: "POST", cookie: adminCookie, body: { unitId, fileName: "u1-v2.pdf" } }),
    );
    const { storageKey: key2 } = (await up2.json()) as { storageKey: string };
    fakeBucket.set(key2, Buffer.from("%PDF-1.7\nv2"));
    const proc2 = await processPdfHandler(
      req(`/api/admin/units/${unitId}/process-pdf`, { method: "POST", cookie: adminCookie, body: { storageKey: key2 } }),
      { params: Promise.resolve({ id: unitId }) },
    );
    expect(proc2.status).toBe(200);
    expect(fakeBucket.has(key1)).toBe(false);
    expect(fakeBucket.has(key2)).toBe(true);
    expect((await db.select().from(units).where(eq(units.id, unitId)))[0].pdfStorageKey).toBe(key2);

    // 5. DELETE borrador elimina fila y limpia key2 de Storage
    const delRes = await deleteUnitHandler(
      req(`/api/admin/units/${unitId}`, { method: "DELETE", cookie: adminCookie }),
      { params: Promise.resolve({ id: unitId }) },
    );
    expect(delRes.status).toBe(200);
    expect(fakeBucket.has(key2)).toBe(false);
    expect(await db.select().from(units).where(eq(units.id, unitId))).toHaveLength(0);
  });

  it("generación IA audita LESSON_AI_GENERATE, compuerta ACTIVE valida completitud + unicidad 409 y coexistencia", async () => {
    const { cookie: adminCookie } = await createUserSession({ rut: "18963546-K", email: "a@a.cl", role: "SUPER_ADMIN" });
    const [cls] = await db.insert(classes).values({ name: "Primarios" }).returning();

    // Crear 3 unidades: U1 (será FINISHED), U2 (será ACTIVE), U3 (quedará DRAFT)
    const createReadyUnit = async (order: number, title: string, startSunday: string) => {
      const up = await uploadUrlHandler(
        req("/api/admin/units/upload-url", {
          method: "POST",
          cookie: adminCookie,
          body: { classId: cls.id, orderNumber: order, title, fileName: `u${order}.pdf` },
        }),
      );
      const { unitId, storageKey } = (await up.json()) as { unitId: string; storageKey: string };
      fakeBucket.set(storageKey, Buffer.from("%PDF-1.7\nok"));
      const proc = await processPdfHandler(
        req(`/api/admin/units/${unitId}/process-pdf`, { method: "POST", cookie: adminCookie, body: { storageKey } }),
        { params: Promise.resolve({ id: unitId }) },
      );
      const { drafts } = (await proc.json()) as { drafts: { lessonId: string }[] };

      // Intentar activar incompleta antes de IA/fechas -> 400
      if (order === 1) {
        const failAct = await patchUnitHandler(
          req(`/api/admin/units/${unitId}`, { method: "PATCH", cookie: adminCookie, body: { status: "ACTIVE" } }),
          { params: Promise.resolve({ id: unitId }) },
        );
        expect(failAct.status).toBe(400);
      }

      for (const d of drafts) {
        const gen = await generateLessonHandler(
          req(`/api/admin/lessons/${d.lessonId}/generate`, {
            method: "POST",
            cookie: adminCookie,
            body: { rawText: "Texto completo de la lección bíblica para padres en casa." },
          }),
          { params: Promise.resolve({ id: d.lessonId }) },
        );
        expect(gen.status).toBe(200);
      }

      await patchUnitHandler(
        req(`/api/admin/units/${unitId}`, {
          method: "PATCH",
          cookie: adminCookie,
          body: { startSundayDate: startSunday },
        }),
        { params: Promise.resolve({ id: unitId }) },
      );

      return { unitId, drafts };
    };

    const u1 = await createReadyUnit(1, "Unidad 1 Pasada", "2025-01-05");
    const u2 = await createReadyUnit(2, "Unidad 2 Activa", "2026-05-03");
    const u3 = await createReadyUnit(3, "Unidad 3 Borrador", "2026-09-06");

    // Activar U1 -> todas sus fechas pasadas quedan con push_sent = true
    const act1 = await patchUnitHandler(
      req(`/api/admin/units/${u1.unitId}`, { method: "PATCH", cookie: adminCookie, body: { status: "ACTIVE" } }),
      { params: Promise.resolve({ id: u1.unitId }) },
    );
    expect(act1.status).toBe(200);
    const u1Lessons = await db.select().from(lessons).where(eq(lessons.unitId, u1.unitId));
    expect(u1Lessons.every((l) => l.pushSent)).toBe(true);

    // Intentar activar U2 mientras U1 sigue ACTIVE -> 409 Conflict
    const conflictAct = await patchUnitHandler(
      req(`/api/admin/units/${u2.unitId}`, { method: "PATCH", cookie: adminCookie, body: { status: "ACTIVE" } }),
      { params: Promise.resolve({ id: u2.unitId }) },
    );
    expect(conflictAct.status).toBe(409);

    // Finalizar U1 -> activar U2 -> conviven U1(FINISHED) + U2(ACTIVE) + U3(DRAFT) en GET /api/admin/units
    expect(
      (
        await patchUnitHandler(
          req(`/api/admin/units/${u1.unitId}`, { method: "PATCH", cookie: adminCookie, body: { status: "FINISHED" } }),
          { params: Promise.resolve({ id: u1.unitId }) },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await patchUnitHandler(
          req(`/api/admin/units/${u2.unitId}`, { method: "PATCH", cookie: adminCookie, body: { status: "ACTIVE" } }),
          { params: Promise.resolve({ id: u2.unitId }) },
        )
      ).status,
    ).toBe(200);

    const listRes = await listUnitsHandler(req(`/api/admin/units?classId=${cls.id}`, { cookie: adminCookie }));
    const listBody = (await listRes.json()) as { items: { id: string; status: string }[] };
    expect(listBody.items.map((x) => x.status).sort()).toEqual(["ACTIVE", "DRAFT", "FINISHED"]);

    // Verificar LESSON_AI_GENERATE en audit_logs
    const aiLogs = await db.select().from(auditLogs).where(eq(auditLogs.action, "LESSON_AI_GENERATE"));
    expect(aiLogs.length).toBe(42);
    void u3;
  });
});

describe("Hito 3 — Reprogramación +7/-7 días (Lunes AM + 409) y Descarga Profesor", () => {
  it("postpone el lunes 09:00 AM mueve +7d y unpostpone doble devuelve 409 Conflict", async () => {
    const { cookie: adminCookie } = await createUserSession({ rut: "18963546-K", email: "a@a.cl", role: "SUPER_ADMIN" });
    const [cls] = await db.insert(classes).values({ name: "Intermedios" }).returning();

    const up = await uploadUrlHandler(
      req("/api/admin/units/upload-url", {
        method: "POST",
        cookie: adminCookie,
        body: { classId: cls.id, orderNumber: 1, title: "Unidad Cal", fileName: "cal.pdf" },
      }),
    );
    const { unitId, storageKey } = (await up.json()) as { unitId: string; storageKey: string };
    fakeBucket.set(storageKey, Buffer.from("%PDF-1.7\nok"));
    const proc = await processPdfHandler(
      req(`/api/admin/units/${unitId}/process-pdf`, { method: "POST", cookie: adminCookie, body: { storageKey } }),
      { params: Promise.resolve({ id: unitId }) },
    );
    const { drafts } = (await proc.json()) as { drafts: { lessonId: string }[] };

    for (const d of drafts) {
      await generateLessonHandler(
        req(`/api/admin/lessons/${d.lessonId}/generate`, {
          method: "POST",
          cookie: adminCookie,
          body: { rawText: "Texto largo de ejemplo de la lección bíblica." },
        }),
        { params: Promise.resolve({ id: d.lessonId }) },
      );
    }

    // Fijamos tiempo del sistema al lunes 2026-05-11 09:00 AM Chile (13:00Z).
    // Lección 1 corresponde a ayer domingo 2026-05-10 (unlock_at = 2026-05-11 00:01 Chile = 04:01Z, push_sent=false).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-11T13:00:00Z"));

    await patchUnitHandler(
      req(`/api/admin/units/${unitId}`, { method: "PATCH", cookie: adminCookie, body: { startSundayDate: "2026-05-10" } }),
      { params: Promise.resolve({ id: unitId }) },
    );
    await patchUnitHandler(
      req(`/api/admin/units/${unitId}`, { method: "PATCH", cookie: adminCookie, body: { status: "ACTIVE" } }),
      { params: Promise.resolve({ id: unitId }) },
    );

    // Postpone automático el lunes 09:00 AM antes del Push -> detecta L1 y la corre +7d al 2026-05-17
    const post1 = await postponeHandler(
      req(`/api/admin/units/${unitId}/postpone`, { method: "POST", cookie: adminCookie, body: {} }),
      { params: Promise.resolve({ id: unitId }) },
    );
    expect(post1.status).toBe(200);
    const postBody = (await post1.json()) as { fromLessonNumber: number; shiftedCount: number };
    expect(postBody.fromLessonNumber).toBe(1);
    expect(postBody.shiftedCount).toBe(14);

    let lRows = await db.select().from(lessons).where(eq(lessons.unitId, unitId)).orderBy(asc(lessons.lessonNumber));
    expect(lRows[0].classSundayDate).toBe("2026-05-17");
    expect(lRows[0].unlockAt?.toISOString()).toBe("2026-05-18T04:01:00.000Z");

    // Unpostpone desde L1 devuelve exactamente al domingo 2026-05-10 (>= domingo_semana_en_curso)
    const unpost1 = await unpostponeHandler(
      req(`/api/admin/units/${unitId}/unpostpone`, { method: "POST", cookie: adminCookie, body: { fromLessonNumber: 1 } }),
      { params: Promise.resolve({ id: unitId }) },
    );
    expect(unpost1.status).toBe(200);
    lRows = await db.select().from(lessons).where(eq(lessons.unitId, unitId)).orderBy(asc(lessons.lessonNumber));
    expect(lRows[0].classSundayDate).toBe("2026-05-10");

    // Segundo unpostpone consecutivo desde L1 (bajaría al 2026-05-03 < domingo_semana_en_curso) -> 409
    const unpost2 = await unpostponeHandler(
      req(`/api/admin/units/${unitId}/unpostpone`, { method: "POST", cookie: adminCookie, body: { fromLessonNumber: 1 } }),
      { params: Promise.resolve({ id: unitId }) },
    );
    expect(unpost2.status).toBe(409);

    // Unpostpone desde L2 sin haber corrido (colisionaría con L1) -> 409
    const unpostL2 = await unpostponeHandler(
      req(`/api/admin/units/${unitId}/unpostpone`, { method: "POST", cookie: adminCookie, body: { fromLessonNumber: 2 } }),
      { params: Promise.resolve({ id: unitId }) },
    );
    expect(unpostL2.status).toBe(409);

    // Cambio manual FORCE_UNLOCKED / FORCE_LOCKED en L3 audita LESSON_STATUS_CHANGE
    const patchL3 = await patchLessonHandler(
      req(`/api/admin/lessons/${lRows[2].id}`, {
        method: "PATCH",
        cookie: adminCookie,
        body: { scheduleStatus: "FORCE_UNLOCKED" },
      }),
      { params: Promise.resolve({ id: lRows[2].id }) },
    );
    expect(patchL3.status).toBe(200);
    const statusLogs = await db.select().from(auditLogs).where(eq(auditLogs.action, "LESSON_STATUS_CHANGE"));
    expect(statusLogs).toHaveLength(1);
  });

  it("descarga PDF profesor: bloquea PARENT (403), TEACHER de otra clase (403) y DRAFT (403); permite asignado + audita PDF_DOWNLOAD", async () => {
    const { cookie: parentCookie } = await createUserSession({ rut: "12345670-K", email: "p@p.cl", role: "PARENT" });
    const { user: teacher1, cookie: t1Cookie } = await createUserSession({ rut: "987654-5", email: "t1@t.cl", role: "TEACHER" });
    const { cookie: t2Cookie } = await createUserSession({ rut: "11222333-9", email: "t2@t.cl", role: "TEACHER" });

    const [cls] = await db.insert(classes).values({ name: "Clase 1" }).returning();
    await db.insert(classTeachers).values({ classId: cls.id, teacherId: teacher1.id });

    const [draftUnit] = await db
      .insert(units)
      .values({ classId: cls.id, orderNumber: 1, title: "Draft U", pdfStorageKey: "units/a/b.pdf", status: "DRAFT" })
      .returning();
    const [activeUnit] = await db
      .insert(units)
      .values({ classId: cls.id, orderNumber: 2, title: "Active U", pdfStorageKey: "units/a/c.pdf", status: "ACTIVE" })
      .returning();

    expect((await teacherPdfHandler(req(`/api/teacher/units/${activeUnit.id}/pdf`, { cookie: parentCookie }), { params: Promise.resolve({ id: activeUnit.id }) })).status).toBe(403);
    expect((await teacherPdfHandler(req(`/api/teacher/units/${activeUnit.id}/pdf`, { cookie: t2Cookie }), { params: Promise.resolve({ id: activeUnit.id }) })).status).toBe(403);
    expect((await teacherPdfHandler(req(`/api/teacher/units/${draftUnit.id}/pdf`, { cookie: t1Cookie }), { params: Promise.resolve({ id: draftUnit.id }) })).status).toBe(403);

    const okRes = await teacherPdfHandler(req(`/api/teacher/units/${activeUnit.id}/pdf`, { cookie: t1Cookie }), {
      params: Promise.resolve({ id: activeUnit.id }),
    });
    expect(okRes.status).toBe(200);
    const body = (await okRes.json()) as { url: string };
    expect(body.url).toContain("download=");

    const dlLogs = await db.select().from(auditLogs).where(eq(auditLogs.action, "PDF_DOWNLOAD"));
    expect(dlLogs).toHaveLength(1);
  });
});
