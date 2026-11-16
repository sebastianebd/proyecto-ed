import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as meHandler } from "@/app/api/auth/me/route";
import { POST as completeLessonHandler } from "@/app/api/parent/lessons/[id]/complete/route";
import { GET as getParentLessonHandler } from "@/app/api/parent/lessons/[id]/route";
import { POST as uncompleteLessonHandler } from "@/app/api/parent/lessons/[id]/uncomplete/route";
import { GET as getParentUnitsHandler } from "@/app/api/parent/units/route";
import { GET as teacherPdfHandler } from "@/app/api/teacher/units/[id]/pdf/route";
import { db } from "@/db";
import {
  auditLogs,
  classes,
  lessonViews,
  lessons,
  parentStudents,
  sessions,
  studentClassHistory,
  students,
  units,
  users,
} from "@/db/schema";
import { generateSessionToken, hashToken, sessionCookieName } from "@/lib/auth";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const dbUrl = process.env.DATABASE_URL ?? "";
let sql: ReturnType<typeof postgres>;

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

async function createUserSession(opts: {
  rut: string;
  fullName: string;
  email: string;
  role: "SUPER_ADMIN" | "TEACHER" | "PARENT";
  status?: "ACTIVE" | "PENDING_ONBOARDING";
}) {
  const [user] = await db
    .insert(users)
    .values({
      rut: opts.rut,
      fullName: opts.fullName,
      email: opts.email,
      role: opts.role,
      status: opts.status ?? "ACTIVE",
      onboardedAt: (opts.status ?? "ACTIVE") === "ACTIVE" ? new Date() : null,
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
});

beforeEach(async () => {
  await sql`TRUNCATE users, classes, rate_limits, audit_logs CASCADE`;
});

afterAll(async () => {
  await sql?.end();
});

describe("Hito 4 — Matriz RBAC Padres, Historial y Acordeón", () => {
  it("bloquea DRAFT, lecciones futuras/PAUSED/FORCE_LOCKED en GET, complete y uncomplete; oculta PDF y ficha interna", async () => {
    const { user: parent, cookie: parentCookie } = await createUserSession({
      rut: "12345678-5",
      fullName: "Mamá Ana",
      email: "ana@test.cl",
      role: "PARENT",
    });
    const { cookie: teacherCookie } = await createUserSession({
      rut: "18963546-K",
      fullName: "Profe Luis",
      email: "luis@test.cl",
      role: "TEACHER",
    });

    const [cls] = await db.insert(classes).values({ name: "Párvulos" }).returning();
    const [child] = await db
      .insert(students)
      .values({
        classId: cls.id,
        fullName: "Mateo",
        specialCare: "Alergia severa al maní",
        preferences: ["Dibujar"],
        status: "ACTIVE",
      })
      .returning();
    await db.insert(parentStudents).values({ parentId: parent.id, studentId: child.id, relationship: "Mamá" });

    const [draftUnit] = await db
      .insert(units)
      .values({ classId: cls.id, orderNumber: 2, title: "Borrador Secreto", pdfStorageKey: "units/a/draft.pdf", status: "DRAFT" })
      .returning();
    const [activeUnit] = await db
      .insert(units)
      .values({ classId: cls.id, orderNumber: 1, title: "Héroes de la Fe", pdfStorageKey: "units/a/active.pdf", status: "ACTIVE" })
      .returning();

    const past = new Date(Date.now() - 86_400_000);
    const future = new Date(Date.now() + 7 * 86_400_000);

    const [draftLesson] = await db
      .insert(lessons)
      .values({
        unitId: draftUnit.id,
        lessonNumber: 1,
        title: "No debe verse",
        biblePassage: "Génesis 1:1",
        parentSummary: ["Párrafo suficientemente largo para cumplir validación de prueba en unidad borrador."],
        reinforcementQuestions: ["¿Pregunta 1 de prueba?", "¿Pregunta 2 de prueba?"],
        classSundayDate: "2026-05-10",
        unlockAt: past,
        scheduleStatus: "FORCE_UNLOCKED",
      })
      .returning();

    const [lUnlocked, lFuture, lPaused, lForceLocked, lForceUnlocked] = await db
      .insert(lessons)
      .values([
        {
          unitId: activeUnit.id,
          lessonNumber: 1,
          title: "David y Goliat",
          biblePassage: "1 Samuel 17:1-50",
          parentSummary: ["Dios dio valentía a David frente al gigante cuando confió plenamente en Su promesa."],
          reinforcementQuestions: ["¿Por qué David no tuvo miedo?", "¿Cómo confiamos en Dios hoy?"],
          classSundayDate: "2026-05-10",
          unlockAt: past,
          scheduleStatus: "SCHEDULED",
        },
        {
          unitId: activeUnit.id,
          lessonNumber: 2,
          title: "Lección Futura",
          biblePassage: "Salmos 23:1-6",
          parentSummary: ["Contenido futuro que no debe filtrarse ni aparecer en el listado de unidades todavía."],
          reinforcementQuestions: ["¿Pregunta futura 1?", "¿Pregunta futura 2?"],
          classSundayDate: "2026-05-24",
          unlockAt: future,
          scheduleStatus: "SCHEDULED",
        },
        {
          unitId: activeUnit.id,
          lessonNumber: 3,
          title: "Lección Pausada",
          biblePassage: "Salmos 100:1",
          parentSummary: ["Contenido pausado que no debe abrirse ni marcarse mientras siga en pausa semanal."],
          reinforcementQuestions: ["¿Pregunta pausada 1?", "¿Pregunta pausada 2?"],
          classSundayDate: "2026-05-03",
          unlockAt: past,
          scheduleStatus: "PAUSED",
        },
        {
          unitId: activeUnit.id,
          lessonNumber: 4,
          title: "Lección Bloqueada Manual",
          biblePassage: "Salmos 1:1",
          parentSummary: ["Contenido bloqueado manualmente que debe responder 403 en GET, complete y uncomplete."],
          reinforcementQuestions: ["¿Pregunta bloqueada 1?", "¿Pregunta bloqueada 2?"],
          classSundayDate: "2026-05-03",
          unlockAt: past,
          scheduleStatus: "FORCE_LOCKED",
        },
        {
          unitId: activeUnit.id,
          lessonNumber: 5,
          title: "Lección Desbloqueada Manual",
          biblePassage: "Juan 3:16",
          parentSummary: ["Contenido desbloqueado manualmente antes de tiempo por coordinación para la familia."],
          reinforcementQuestions: ["¿Qué nos enseña Juan 3:16?", "¿Cómo compartimos ese amor?"],
          classSundayDate: "2026-05-31",
          unlockAt: future,
          scheduleStatus: "FORCE_UNLOCKED",
        },
      ])
      .returning();

    // TEACHER, SUPER_ADMIN y PARENT en PENDING_ONBOARDING no pueden usar endpoints /api/parent/*
    const { cookie: adminCookie } = await createUserSession({
      rut: "21333444-6",
      fullName: "Admin Sol",
      email: "admin@test.cl",
      role: "SUPER_ADMIN",
    });
    const { cookie: pendingParentCookie } = await createUserSession({
      rut: "16444555-3",
      fullName: "Padre Pendiente",
      email: "pendiente@test.cl",
      role: "PARENT",
      status: "PENDING_ONBOARDING",
    });
    for (const deniedCookie of [teacherCookie, adminCookie, pendingParentCookie]) {
      expect((await getParentUnitsHandler(req("/api/parent/units", { cookie: deniedCookie }))).status).toBe(403);
      expect(
        (await getParentLessonHandler(req(`/api/parent/lessons/${lUnlocked.id}`, { cookie: deniedCookie }), { params: Promise.resolve({ id: lUnlocked.id }) })).status,
      ).toBe(403);
    }

    // :id inválido (no-UUID v4) responde 400 en GET, complete y uncomplete
    expect(
      (await getParentLessonHandler(req("/api/parent/lessons/no-es-uuid", { cookie: parentCookie }), { params: Promise.resolve({ id: "no-es-uuid" }) })).status,
    ).toBe(400);
    expect(
      (await completeLessonHandler(req("/api/parent/lessons/no-es-uuid/complete", { method: "POST", cookie: parentCookie, body: { studentIds: [child.id] } }), { params: Promise.resolve({ id: "no-es-uuid" }) })).status,
    ).toBe(400);
    expect(
      (await uncompleteLessonHandler(req("/api/parent/lessons/no-es-uuid/uncomplete", { method: "POST", cookie: parentCookie, body: { studentIds: [child.id] } }), { params: Promise.resolve({ id: "no-es-uuid" }) })).status,
    ).toBe(400);

    // PARENT jamás puede descargar PDF
    expect(
      (await teacherPdfHandler(req(`/api/teacher/units/${activeUnit.id}/pdf`, { cookie: parentCookie }), { params: Promise.resolve({ id: activeUnit.id }) })).status,
    ).toBe(403);

    // GET /api/parent/units excluye DRAFT, oculta contenido de bloqueadas, y no filtra specialCare ni pdfStorageKey
    const unitsRes = await getParentUnitsHandler(req("/api/parent/units", { cookie: parentCookie }));
    expect(unitsRes.status).toBe(200);
    const unitsText = await unitsRes.text();
    expect(unitsText).not.toContain("Borrador Secreto");
    expect(unitsText).not.toContain("active.pdf");
    expect(unitsText).not.toContain("Alergia severa");
    expect(unitsText).not.toContain("Salmos 23:1-6");

    const unitsJson = JSON.parse(unitsText) as {
      units: { id: string; lessons: { id: string; unlocked: boolean; biblePassage: string | null }[] }[];
    };
    expect(unitsJson.units).toHaveLength(1);
    expect(unitsJson.units[0].lessons.find((l) => l.id === lUnlocked.id)?.unlocked).toBe(true);
    expect(unitsJson.units[0].lessons.find((l) => l.id === lForceUnlocked.id)?.unlocked).toBe(true);
    expect(unitsJson.units[0].lessons.find((l) => l.id === lFuture.id)?.biblePassage).toBeNull();

    // Mismo guard 403 en GET, complete y uncomplete para DRAFT, futura, PAUSED y FORCE_LOCKED
    for (const blocked of [draftLesson, lFuture, lPaused, lForceLocked]) {
      expect(
        (await getParentLessonHandler(req(`/api/parent/lessons/${blocked.id}`, { cookie: parentCookie }), { params: Promise.resolve({ id: blocked.id }) })).status,
      ).toBe(403);
      expect(
        (
          await completeLessonHandler(
            req(`/api/parent/lessons/${blocked.id}/complete`, { method: "POST", cookie: parentCookie, body: { studentIds: [child.id] } }),
            { params: Promise.resolve({ id: blocked.id }) },
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await uncompleteLessonHandler(
            req(`/api/parent/lessons/${blocked.id}/uncomplete`, { method: "POST", cookie: parentCookie, body: { studentIds: [child.id] } }),
            { params: Promise.resolve({ id: blocked.id }) },
          )
        ).status,
      ).toBe(403);
    }

    // FORCE_UNLOCKED sí abre y no expone pdfStorageKey, specialCare ni preferences
    const forceRes = await getParentLessonHandler(req(`/api/parent/lessons/${lForceUnlocked.id}`, { cookie: parentCookie }), {
      params: Promise.resolve({ id: lForceUnlocked.id }),
    });
    expect(forceRes.status).toBe(200);
    const forceText = await forceRes.text();
    expect(forceText).not.toContain("active.pdf");
    expect(forceText).not.toContain("Alergia severa");
    expect(forceText).not.toContain("Dibujar");
  });

  it("padre con todos sus hijos INACTIVE recibe 403 en /api/parent/* pero 200 en /api/auth/me; hijo trasladado ve FINISHED vía historial", async () => {
    const { user: parent, cookie: parentCookie } = await createUserSession({
      rut: "14555666-7",
      fullName: "Papá Carlos",
      email: "carlos@test.cl",
      role: "PARENT",
    });

    const [classA] = await db.insert(classes).values({ name: "Clase A" }).returning();
    const [classB] = await db.insert(classes).values({ name: "Clase B" }).returning();

    const [child] = await db.insert(students).values({ classId: classB.id, fullName: "Sofía", status: "ACTIVE" }).returning();
    await db.insert(parentStudents).values({ parentId: parent.id, studentId: child.id, relationship: "Papá" });

    // Historial: Sofía estuvo en Clase A antes de pasar a Clase B
    await db.insert(studentClassHistory).values([
      { studentId: child.id, classId: classA.id, assignedAt: new Date("2026-01-01T00:00:00Z"), unassignedAt: new Date("2026-04-01T00:00:00Z") },
      { studentId: child.id, classId: classB.id, assignedAt: new Date("2026-04-01T00:00:00Z"), unassignedAt: null },
    ]);

    const [uAFinished, uAActive] = await db
      .insert(units)
      .values([
        { classId: classA.id, orderNumber: 1, title: "Unidad Histórica A", pdfStorageKey: "units/a/1.pdf", status: "FINISHED" },
        { classId: classA.id, orderNumber: 2, title: "Unidad Actual A (No debe ver)", pdfStorageKey: "units/a/2.pdf", status: "ACTIVE" },
      ])
      .returning();
    const [uBActive] = await db
      .insert(units)
      .values({ classId: classB.id, orderNumber: 1, title: "Unidad Actual B", pdfStorageKey: "units/b/1.pdf", status: "ACTIVE" })
      .returning();

    const past = new Date(Date.now() - 86_400_000);
    const [lHist, lForbiddenA] = await db
      .insert(lessons)
      .values([
        {
          unitId: uAFinished.id,
          lessonNumber: 1,
          title: "Lección Histórica",
          biblePassage: "Génesis 12:1",
          parentSummary: ["Resumen histórico de Abraham que el padre puede consultar tras el traslado de clase."],
          reinforcementQuestions: ["¿Qué prometió Dios?", "¿Cómo obedeció Abraham?"],
          classSundayDate: "2026-03-08",
          unlockAt: past,
          scheduleStatus: "SCHEDULED",
        },
        {
          unitId: uAActive.id,
          lessonNumber: 1,
          title: "Lección Actual Clase A",
          biblePassage: "Éxodo 3:1",
          parentSummary: ["Contenido de Clase A después de que Sofía fue trasladada a Clase B (debe dar 403)."],
          reinforcementQuestions: ["¿Pregunta A1?", "¿Pregunta A2?"],
          classSundayDate: "2026-05-10",
          unlockAt: past,
          scheduleStatus: "SCHEDULED",
        },
      ])
      .returning();

    // Consulta unidades: ve FINISHED de Clase A + ACTIVE de Clase B, jamás ACTIVE de Clase A
    const listRes = await getParentUnitsHandler(req("/api/parent/units", { cookie: parentCookie }));
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { units: { id: string; status: string }[] };
    const returnedIds = listBody.units.map((u) => u.id);
    expect(returnedIds).toContain(uAFinished.id);
    expect(returnedIds).toContain(uBActive.id);
    expect(returnedIds).not.toContain(uAActive.id);

    expect(
      (await getParentLessonHandler(req(`/api/parent/lessons/${lHist.id}`, { cookie: parentCookie }), { params: Promise.resolve({ id: lHist.id }) })).status,
    ).toBe(200);
    expect(
      (
        await completeLessonHandler(
          req(`/api/parent/lessons/${lHist.id}/complete`, { method: "POST", cookie: parentCookie, body: { studentIds: [child.id] } }),
          { params: Promise.resolve({ id: lHist.id }) },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await uncompleteLessonHandler(
          req(`/api/parent/lessons/${lHist.id}/uncomplete`, { method: "POST", cookie: parentCookie, body: { studentIds: [child.id] } }),
          { params: Promise.resolve({ id: lHist.id }) },
        )
      ).status,
    ).toBe(200);
    expect(
      (await getParentLessonHandler(req(`/api/parent/lessons/${lForbiddenA.id}`, { cookie: parentCookie }), { params: Promise.resolve({ id: lForbiddenA.id }) })).status,
    ).toBe(403);

    // Ahora pasamos a Sofía a INACTIVE -> 0 hijos activos => 403 en /api/parent/* pero 200 en /api/auth/me
    await db.update(students).set({ status: "INACTIVE" }).where(eq(students.id, child.id));
    expect((await meHandler(req("/api/auth/me", { cookie: parentCookie }))).status).toBe(200);
    expect((await getParentUnitsHandler(req("/api/parent/units", { cookie: parentCookie }))).status).toBe(403);
    expect(
      (await getParentLessonHandler(req(`/api/parent/lessons/${lHist.id}`, { cookie: parentCookie }), { params: Promise.resolve({ id: lHist.id }) })).status,
    ).toBe(403);
    expect(
      (
        await completeLessonHandler(
          req(`/api/parent/lessons/${lHist.id}/complete`, { method: "POST", cookie: parentCookie, body: { studentIds: [child.id] } }),
          { params: Promise.resolve({ id: lHist.id }) },
        )
      ).status,
    ).toBe(403);
  });
});

describe("Hito 4 — Visto individual, Completado selectivo (>1 hijo) y sincronización Mamá/Papá", () => {
  it("conserva firstViewedAt en 2da vista, completa selectivamente [hijo1], sincroniza con Padre B y desmarca conservando Visto", async () => {
    const { user: mom, cookie: momCookie } = await createUserSession({
      rut: "11111111-1",
      fullName: "Mamá Elena",
      email: "elena@test.cl",
      role: "PARENT",
    });
    const { user: dad, cookie: dadCookie } = await createUserSession({
      rut: "13456789-5",
      fullName: "Papá Marcos",
      email: "marcos@test.cl",
      role: "PARENT",
    });
    const { user: otherParent } = await createUserSession({
      rut: "19876543-0",
      fullName: "Otro Padre",
      email: "otro@test.cl",
      role: "PARENT",
    });

    const [cls] = await db.insert(classes).values({ name: "Primarios" }).returning();
    const [hijo1, hijo2, ajeno] = await db
      .insert(students)
      .values([
        { classId: cls.id, fullName: "Lucas", status: "ACTIVE" },
        { classId: cls.id, fullName: "Tomás", status: "ACTIVE" },
        { classId: cls.id, fullName: "Hijo Ajeno", status: "ACTIVE" },
      ])
      .returning();

    await db.insert(parentStudents).values([
      { parentId: mom.id, studentId: hijo1.id, relationship: "Mamá" },
      { parentId: mom.id, studentId: hijo2.id, relationship: "Mamá" },
      { parentId: dad.id, studentId: hijo1.id, relationship: "Papá" },
      { parentId: dad.id, studentId: hijo2.id, relationship: "Papá" },
      { parentId: otherParent.id, studentId: ajeno.id, relationship: "Papá" },
    ]);

    const [unit] = await db
      .insert(units)
      .values({ classId: cls.id, orderNumber: 1, title: "Unidad 1", pdfStorageKey: "units/p/1.pdf", status: "ACTIVE" })
      .returning();
    const [lesson] = await db
      .insert(lessons)
      .values({
        unitId: unit.id,
        lessonNumber: 1,
        title: "El Buen Pastor",
        biblePassage: "Juan 10:11",
        parentSummary: ["Jesús conoce y cuida a cada una de sus ovejas con amor incomparable todos los días."],
        reinforcementQuestions: ["¿Cómo nos cuida Jesús?", "¿Por qué confiamos en el Buen Pastor?"],
        classSundayDate: "2026-05-10",
        unlockAt: new Date(Date.now() - 86_400_000),
        scheduleStatus: "SCHEDULED",
      })
      .returning();

    // 1. Primera vista de Mamá crea lesson_views + LESSON_VIEW
    const v1 = await getParentLessonHandler(req(`/api/parent/lessons/${lesson.id}`, { cookie: momCookie }), {
      params: Promise.resolve({ id: lesson.id }),
    });
    expect(v1.status).toBe(200);
    const body1 = (await v1.json()) as { item: { view: { firstViewedAt: string; lastViewedAt: string } } };

    // 2. Segunda vista actualiza lastViewedAt manteniendo firstViewedAt exacto
    await new Promise((r) => setTimeout(r, 25));
    const v2 = await getParentLessonHandler(req(`/api/parent/lessons/${lesson.id}`, { cookie: momCookie }), {
      params: Promise.resolve({ id: lesson.id }),
    });
    expect(v2.status).toBe(200);
    const body2 = (await v2.json()) as { item: { view: { firstViewedAt: string; lastViewedAt: string } } };
    expect(body2.item.view.firstViewedAt).toBe(body1.item.view.firstViewedAt);
    expect(new Date(body2.item.view.lastViewedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(body1.item.view.lastViewedAt).getTime(),
    );

    // 3. No puede completar alumno ajeno -> 403
    const hijackRes = await completeLessonHandler(
      req(`/api/parent/lessons/${lesson.id}/complete`, { method: "POST", cookie: momCookie, body: { studentIds: [ajeno.id] } }),
      { params: Promise.resolve({ id: lesson.id }) },
    );
    expect(hijackRes.status).toBe(403);

    // 4. Mamá marca solo hijo1 -> hijo2 sigue pendiente; 2do POST idempotente no duplica log
    const compRes = await completeLessonHandler(
      req(`/api/parent/lessons/${lesson.id}/complete`, { method: "POST", cookie: momCookie, body: { studentIds: [hijo1.id] } }),
      { params: Promise.resolve({ id: lesson.id }) },
    );
    expect(compRes.status).toBe(200);
    const compDupRes = await completeLessonHandler(
      req(`/api/parent/lessons/${lesson.id}/complete`, { method: "POST", cookie: dadCookie, body: { studentIds: [hijo1.id] } }),
      { params: Promise.resolve({ id: lesson.id }) },
    );
    expect(compDupRes.status).toBe(200);
    const compBody = (await compRes.json()) as {
      eligibleChildren: { id: string; completed: boolean; completedByName: string | null }[];
    };
    expect(compBody.eligibleChildren.find((c) => c.id === hijo1.id)?.completed).toBe(true);
    expect(compBody.eligibleChildren.find((c) => c.id === hijo2.id)?.completed).toBe(false);

    // 5. Papá (otro apoderado vinculado) consulta lección y ve completado por "Mamá Elena" en hijo1 y pendiente hijo2
    const dadGet = await getParentLessonHandler(req(`/api/parent/lessons/${lesson.id}`, { cookie: dadCookie }), {
      params: Promise.resolve({ id: lesson.id }),
    });
    expect(dadGet.status).toBe(200);
    const dadBody = (await dadGet.json()) as {
      item: { eligibleChildren: { id: string; completed: boolean; completedByName: string | null }[] };
    };
    const dadH1 = dadBody.item.eligibleChildren.find((c) => c.id === hijo1.id);
    const dadH2 = dadBody.item.eligibleChildren.find((c) => c.id === hijo2.id);
    expect(dadH1?.completed).toBe(true);
    expect(dadH1?.completedByName).toBe("Mamá Elena");
    expect(dadH2?.completed).toBe(false);

    // 6. Desmarcar hijo1 elimina completado en ambos padres, audita LESSON_UNCOMPLETE (sin duplicar si se repite) y mantiene lesson_views de Mamá
    const uncompRes = await uncompleteLessonHandler(
      req(`/api/parent/lessons/${lesson.id}/uncomplete`, { method: "POST", cookie: dadCookie, body: { studentIds: [hijo1.id] } }),
      { params: Promise.resolve({ id: lesson.id }) },
    );
    expect(uncompRes.status).toBe(200);
    const uncompDupRes = await uncompleteLessonHandler(
      req(`/api/parent/lessons/${lesson.id}/uncomplete`, { method: "POST", cookie: momCookie, body: { studentIds: [hijo1.id] } }),
      { params: Promise.resolve({ id: lesson.id }) },
    );
    expect(uncompDupRes.status).toBe(200);
    const uncompBody = (await uncompRes.json()) as {
      eligibleChildren: { id: string; completed: boolean }[];
    };
    expect(uncompBody.eligibleChildren.every((c) => !c.completed)).toBe(true);

    const momViewRows = await db
      .select()
      .from(lessonViews)
      .where(and(eq(lessonViews.lessonId, lesson.id), eq(lessonViews.parentId, mom.id)));
    expect(momViewRows).toHaveLength(1);

    const viewLogs = await db.select().from(auditLogs).where(eq(auditLogs.action, "LESSON_VIEW"));
    const completeLogs = await db.select().from(auditLogs).where(eq(auditLogs.action, "LESSON_COMPLETE"));
    const uncompleteLogs = await db.select().from(auditLogs).where(eq(auditLogs.action, "LESSON_UNCOMPLETE"));
    expect(viewLogs.length).toBeGreaterThanOrEqual(2);
    expect(completeLogs).toHaveLength(1);
    expect(uncompleteLogs).toHaveLength(1);
  });
});
