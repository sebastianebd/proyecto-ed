import { and, desc, eq, sql as dsql } from "drizzle-orm";
import { NextRequest } from "next/server";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as auditLogsHandler } from "@/app/api/admin/audit-logs/route";
import { PATCH as patchClassHandler } from "@/app/api/admin/classes/[id]/route";
import { GET as classesGetHandler, POST as classesPostHandler } from "@/app/api/admin/classes/route";
import { GET as adminKpisHandler } from "@/app/api/admin/kpis/route";
import { PATCH as patchStudentHandler } from "@/app/api/admin/students/[id]/route";
import { GET as studentsGetHandler, POST as studentsPostHandler } from "@/app/api/admin/students/route";
import { POST as revokeSessionsHandler } from "@/app/api/admin/users/[id]/revoke-sessions/route";
import { PATCH as patchUserHandler } from "@/app/api/admin/users/[id]/route";
import { GET as usersGetHandler, POST as usersPostHandler } from "@/app/api/admin/users/route";
import { GET as meHandler } from "@/app/api/auth/me/route";
import { db } from "@/db";
import {
  attendanceRecords,
  auditLogs,
  classes,
  lessonCompletions,
  lessons,
  lessonViews,
  otpCodes,
  sessions,
  studentClassHistory,
  units,
  users,
} from "@/db/schema";
import { generateSessionToken, hashOtp, hashToken, sessionCookieName } from "@/lib/auth";

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

async function createUserWithSession(opts: {
  rut: string;
  email: string;
  role: "SUPER_ADMIN" | "TEACHER" | "PARENT";
  status?: "ACTIVE" | "PENDING_ONBOARDING" | "INACTIVE";
}) {
  const [user] = await db
    .insert(users)
    .values({
      rut: opts.rut,
      fullName: `User ${opts.role}`,
      email: opts.email,
      role: opts.role,
      status: opts.status ?? "ACTIVE",
      onboardedAt: (opts.status ?? "ACTIVE") === "ACTIVE" ? new Date() : null,
      lastSeenAt: new Date(),
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

describe("Hito 2 — RBAC, Clases, Unicidad y Protección Super Admin", () => {
  it("bloquea con 403 a TEACHER/PARENT en endpoints /api/admin/* y valida UUID v4", async () => {
    const { cookie: teacherCookie } = await createUserWithSession({
      rut: "987654-5",
      email: "t@example.com",
      role: "TEACHER",
    });
    const { cookie: adminCookie } = await createUserWithSession({
      rut: "18963546-K",
      email: "admin@example.com",
      role: "SUPER_ADMIN",
    });

    for (const h of [classesGetHandler, usersGetHandler, studentsGetHandler, auditLogsHandler, adminKpisHandler]) {
      const denied = await h(req("/api/admin/test", { cookie: teacherCookie }));
      expect(denied.status).toBe(403);
    }

    const badUuid = await patchUserHandler(
      req("/api/admin/users/no-es-uuid", { method: "PATCH", cookie: adminCookie, body: { fullName: "Otro Nombre" } }),
      { params: Promise.resolve({ id: "no-es-uuid" }) },
    );
    expect(badUuid.status).toBe(400);
  });

  it("CRUD de clases asigna profesores y permite archivar", async () => {
    const { cookie: adminCookie } = await createUserWithSession({
      rut: "18963546-K",
      email: "admin@example.com",
      role: "SUPER_ADMIN",
    });
    const { user: teacher } = await createUserWithSession({
      rut: "12345670-K",
      email: "profe@example.com",
      role: "TEACHER",
    });

    const createRes = await classesPostHandler(
      req("/api/admin/classes", {
        method: "POST",
        cookie: adminCookie,
        body: { name: "Párvulos 3-5", ageRange: "3 a 5 años", teacherIds: [teacher.id] },
      }),
    );
    expect(createRes.status).toBe(201);
    const createdBody = (await createRes.json()) as { item: { id: string } };

    const patchRes = await patchClassHandler(
      req(`/api/admin/classes/${createdBody.item.id}`, {
        method: "PATCH",
        cookie: adminCookie,
        body: { status: "ARCHIVED", teacherIds: [] },
      }),
      { params: Promise.resolve({ id: createdBody.item.id }) },
    );
    expect(patchRes.status).toBe(200);

    const listRes = await classesGetHandler(req("/api/admin/classes", { cookie: adminCookie }));
    const listBody = (await listRes.json()) as { items: { status: string; teachers: unknown[] }[] };
    expect(listBody.items[0].status).toBe("ARCHIVED");
    expect(listBody.items[0].teachers).toHaveLength(0);
  });

  it("responde 409 en RUT o correo duplicado e impide auto-desactivarse o bajarse el rol", async () => {
    const { user: admin, cookie: adminCookie } = await createUserWithSession({
      rut: "18963546-K",
      email: "admin@example.com",
      role: "SUPER_ADMIN",
    });

    const dupRut = await usersPostHandler(
      req("/api/admin/users", {
        method: "POST",
        cookie: adminCookie,
        body: { rut: "18.963.546-k", fullName: "Otro", email: "otro@example.com", role: "PARENT" },
      }),
    );
    expect(dupRut.status).toBe(409);

    const dupEmail = await usersPostHandler(
      req("/api/admin/users", {
        method: "POST",
        cookie: adminCookie,
        body: { rut: "12345670-K", fullName: "Otro", email: "ADMIN@EXAMPLE.COM", role: "PARENT" },
      }),
    );
    expect(dupEmail.status).toBe(409);

    const selfDemote = await patchUserHandler(
      req(`/api/admin/users/${admin.id}`, { method: "PATCH", cookie: adminCookie, body: { role: "PARENT" } }),
      { params: Promise.resolve({ id: admin.id }) },
    );
    expect(selfDemote.status).toBe(403);

    const selfDeactivate = await patchUserHandler(
      req(`/api/admin/users/${admin.id}`, { method: "PATCH", cookie: adminCookie, body: { status: "INACTIVE" } }),
      { params: Promise.resolve({ id: admin.id }) },
    );
    expect(selfDeactivate.status).toBe(403);
  });

  it("cambiar correo o pasar a INACTIVE revoca sesiones al instante e invalida OTPs pendientes", async () => {
    const { cookie: adminCookie } = await createUserWithSession({
      rut: "18963546-K",
      email: "admin@example.com",
      role: "SUPER_ADMIN",
    });
    const { user: parent, cookie: parentCookie } = await createUserWithSession({
      rut: "12345670-K",
      email: "padre@example.com",
      role: "PARENT",
    });
    await db.insert(otpCodes).values({
      userId: parent.id,
      codeHash: hashOtp(parent.rut, "123456"),
      expiresAt: new Date(Date.now() + 600_000),
    });

    // Cambio de email -> revoca sesiones, invalida OTP y audita USER_EMAIL_CHANGED
    const emailRes = await patchUserHandler(
      req(`/api/admin/users/${parent.id}`, {
        method: "PATCH",
        cookie: adminCookie,
        body: { email: "nuevo.padre@example.com" },
      }),
      { params: Promise.resolve({ id: parent.id }) },
    );
    expect(emailRes.status).toBe(200);
    expect((await meHandler(req("/api/auth/me", { cookie: parentCookie }))).status).toBe(401);
    const pendingOtpsAfterEmail = await db.select().from(otpCodes).where(and(eq(otpCodes.userId, parent.id)));
    expect(pendingOtpsAfterEmail[0].usedAt).not.toBeNull();

    // Nueva sesión + nuevo OTP -> revocación manual + desactivación INACTIVE
    const token2 = generateSessionToken();
    await db.insert(sessions).values({
      userId: parent.id,
      tokenHash: hashToken(token2),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const cookie2 = `${sessionCookieName()}=${token2}`;
    await db.insert(otpCodes).values({
      userId: parent.id,
      codeHash: hashOtp(parent.rut, "654321"),
      expiresAt: new Date(Date.now() + 600_000),
    });

    const revokeRes = await revokeSessionsHandler(
      req(`/api/admin/users/${parent.id}/revoke-sessions`, { method: "POST", cookie: adminCookie }),
      { params: Promise.resolve({ id: parent.id }) },
    );
    expect(revokeRes.status).toBe(200);
    expect((await meHandler(req("/api/auth/me", { cookie: cookie2 }))).status).toBe(401);

    const deactivateRes = await patchUserHandler(
      req(`/api/admin/users/${parent.id}`, {
        method: "PATCH",
        cookie: adminCookie,
        body: { status: "INACTIVE" },
      }),
      { params: Promise.resolve({ id: parent.id }) },
    );
    expect(deactivateRes.status).toBe(200);

    const listUsers = await usersGetHandler(req("/api/admin/users", { cookie: adminCookie }));
    const usersBody = (await listUsers.json()) as { items: { id: string; role: string; isOnline: boolean }[] };
    const adminRow = usersBody.items.find((u) => u.role === "SUPER_ADMIN");
    const parentRow = usersBody.items.find((u) => u.id === parent.id);
    expect(adminRow?.isOnline).toBe(true);
    expect(parentRow?.isOnline).toBe(false);

    const actions = (await db.select({ action: auditLogs.action }).from(auditLogs)).map((r) => r.action);
    expect(actions).toContain("USER_EMAIL_CHANGED");
    expect(actions).toContain("SESSION_REVOKED");
    expect(actions).toContain("USER_DEACTIVATE");
  });
});

describe("Hito 2 — Alumnos (Historial de clases), Auditoría paginada y KPIs", () => {
  it("crea alumno con historial inicial, traslada de Clase A a Clase B conservando registros y permite baja lógica", async () => {
    const { user: admin, cookie: adminCookie } = await createUserWithSession({
      rut: "18963546-K",
      email: "admin@example.com",
      role: "SUPER_ADMIN",
    });
    const { user: parent } = await createUserWithSession({
      rut: "12345670-K",
      email: "mama@example.com",
      role: "PARENT",
    });
    const [classA] = await db.insert(classes).values({ name: "Clase A" }).returning();
    const [classB] = await db.insert(classes).values({ name: "Clase B" }).returning();

    const createRes = await studentsPostHandler(
      req("/api/admin/students", {
        method: "POST",
        cookie: adminCookie,
        body: {
          fullName: "Mateo Silva",
          classId: classA.id,
          birthDate: "2020-04-10",
          specialCare: "Alergia leve al polvo",
          preferences: ["dibujar", "cantar"],
          parents: [{ parentId: parent.id, relationship: "Mamá" }],
        },
      }),
    );
    expect(createRes.status).toBe(201);
    const { item: student } = (await createRes.json()) as { item: { id: string } };

    // Crear asistencia y completado en Clase A para verificar conservación tras traslado
    await db.insert(attendanceRecords).values({
      classId: classA.id,
      studentId: student.id,
      attendanceDate: "2026-05-03",
      isPresent: true,
      recordedByUserId: admin.id,
    });
    const [unitA] = await db.insert(units).values({ classId: classA.id, orderNumber: 1, title: "U1", status: "ACTIVE" }).returning();
    const [lesson1] = await db.insert(lessons).values({ unitId: unitA.id, lessonNumber: 1 }).returning();
    await db.insert(lessonCompletions).values({ lessonId: lesson1.id, studentId: student.id, completedByUserId: parent.id });

    // Traslado Clase A -> Clase B
    const moveRes = await patchStudentHandler(
      req(`/api/admin/students/${student.id}`, { method: "PATCH", cookie: adminCookie, body: { classId: classB.id } }),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(moveRes.status).toBe(200);

    const hist = await db
      .select()
      .from(studentClassHistory)
      .where(eq(studentClassHistory.studentId, student.id))
      .orderBy(desc(studentClassHistory.assignedAt));
    expect(hist).toHaveLength(2);
    expect(hist.find((h) => h.classId === classA.id)?.unassignedAt).not.toBeNull();
    expect(hist.find((h) => h.classId === classB.id)?.unassignedAt).toBeNull();

    // Baja lógica conserva asistencias, completados e historial
    const offRes = await patchStudentHandler(
      req(`/api/admin/students/${student.id}`, { method: "PATCH", cookie: adminCookie, body: { status: "INACTIVE" } }),
      { params: Promise.resolve({ id: student.id }) },
    );
    expect(offRes.status).toBe(200);

    expect(await db.select().from(attendanceRecords).where(eq(attendanceRecords.studentId, student.id))).toHaveLength(1);
    expect(await db.select().from(lessonCompletions).where(eq(lessonCompletions.studentId, student.id))).toHaveLength(1);
  });

  it("auditoría rechaza limit=51 (400), pagina limit=50 y filtra correctamente", async () => {
    const { user: admin, cookie: adminCookie } = await createUserWithSession({
      rut: "18963546-K",
      email: "admin@example.com",
      role: "SUPER_ADMIN",
    });

    const badLimit = await auditLogsHandler(req("/api/admin/audit-logs?limit=51", { cookie: adminCookie }));
    expect(badLimit.status).toBe(400);

    for (let i = 0; i < 55; i++) {
      await db.insert(auditLogs).values({
        actorUserId: admin.id,
        actorRole: "SUPER_ADMIN",
        action: i % 2 === 0 ? "USER_CREATE" : "CLASS_CREATE",
        entityType: "test",
        entityId: String(i),
      });
    }

    const p1 = await auditLogsHandler(req("/api/admin/audit-logs?page=1&limit=50", { cookie: adminCookie }));
    expect(p1.status).toBe(200);
    const b1 = (await p1.json()) as { items: unknown[]; total: number; totalPages: number };
    expect(b1.items).toHaveLength(50);
    expect(b1.total).toBe(55);
    expect(b1.totalPages).toBe(2);

    const p2Filtered = await auditLogsHandler(
      req("/api/admin/audit-logs?page=1&limit=50&action=CLASS_CREATE", { cookie: adminCookie }),
      );
    const b2 = (await p2Filtered.json()) as { items: { action: string }[]; total: number };
    expect(b2.total).toBe(27);
    expect(b2.items.every((i) => i.action === "CLASS_CREATE")).toBe(true);
  });

  it("calcula KPIs reales excluyendo padres INACTIVE, alumnos sin padre activo y semanas pausadas", async () => {
    const { user: admin, cookie: adminCookie } = await createUserWithSession({
      rut: "18963546-K",
      email: "admin@example.com",
      role: "SUPER_ADMIN",
    });

    // BD vacía -> 0% en los 3 KPIs (sin NaN)
    const emptyRes = await adminKpisHandler(req("/api/admin/kpis", { cookie: adminCookie }));
    const emptyKpis = ((await emptyRes.json()) as { kpis: Record<string, number> }).kpis;
    expect(emptyKpis.attendancePct).toBe(0);
    expect(emptyKpis.openingPct).toBe(0);
    expect(emptyKpis.completionPct).toBe(0);

    const [cls] = await db.insert(classes).values({ name: "Primarios" }).returning();
    const { user: activeParent } = await createUserWithSession({ rut: "12345670-K", email: "p1@example.com", role: "PARENT", status: "ACTIVE" });
    const { user: inactiveParent } = await createUserWithSession({ rut: "987654-5", email: "p2@example.com", role: "PARENT", status: "INACTIVE" });

    // 2 alumnos: s1 con padre activo + inactivo, s2 sin padres vinculados
    const s1Res = await studentsPostHandler(
      req("/api/admin/students", {
        method: "POST",
        cookie: adminCookie,
        body: { fullName: "Alumno Con Padre", classId: cls.id, parents: [{ parentId: activeParent.id }, { parentId: inactiveParent.id }] },
      }),
    );
    const s2Res = await studentsPostHandler(
      req("/api/admin/students", {
        method: "POST",
        cookie: adminCookie,
        body: { fullName: "Alumno Sin Padre", classId: cls.id, parents: [] },
      }),
    );
    const s1Id = ((await s1Res.json()) as { item: { id: string } }).item.id;
    const s2Id = ((await s2Res.json()) as { item: { id: string } }).item.id;

    // 1 presente, 1 ausente -> 50% asistencia
    await db.insert(attendanceRecords).values([
      { classId: cls.id, studentId: s1Id, attendanceDate: "2026-05-03", isPresent: true, recordedByUserId: admin.id },
      { classId: cls.id, studentId: s2Id, attendanceDate: "2026-05-03", isPresent: false, recordedByUserId: admin.id },
    ]);

    // Unidad ACTIVE con 1 lección desbloqueada y 1 pausada:
    // Denominador Apertura = 1 (solo activeParent, no inactiveParent)
    // Denominador Refuerzo = 1 (solo s1, no s2 sin padres)
    const [unit] = await db.insert(units).values({ classId: cls.id, orderNumber: 1, title: "U1", status: "ACTIVE" }).returning();
    const [lOpen] = await db
      .insert(lessons)
      .values({ unitId: unit.id, lessonNumber: 1, scheduleStatus: "SCHEDULED", unlockAt: dsql`now() - interval '1 day'` })
      .returning();
    await db
      .insert(lessons)
      .values({ unitId: unit.id, lessonNumber: 2, scheduleStatus: "PAUSED", unlockAt: dsql`now() - interval '1 day'` });

    await db.insert(lessonViews).values({ lessonId: lOpen.id, parentId: activeParent.id });
    await db.insert(lessonCompletions).values({ lessonId: lOpen.id, studentId: s1Id, completedByUserId: activeParent.id });

    const fullRes = await adminKpisHandler(req(`/api/admin/kpis?classId=${cls.id}`, { cookie: adminCookie }));
    const { kpis } = (await fullRes.json()) as { kpis: Record<string, number> };
    expect(kpis.attendancePct).toBe(50);
    expect(kpis.openingExpected).toBe(1);
    expect(kpis.openingPct).toBe(100);
    expect(kpis.completionExpected).toBe(1);
    expect(kpis.completionPct).toBe(100);
  });
});
