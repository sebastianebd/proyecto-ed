import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getTeacherAttendanceHandler, PUT as putTeacherAttendanceHandler } from "@/app/api/teacher/attendance/route";
import { GET as getTeacherClassesHandler } from "@/app/api/teacher/classes/route";
import { GET as getTeacherKpisHandler } from "@/app/api/teacher/kpis/route";
import { GET as getLessonTrackingHandler } from "@/app/api/teacher/lessons/[id]/tracking/route";
import { GET as getStudentSheetHandler } from "@/app/api/teacher/students/[id]/route";
import { GET as getTeacherUnitsHandler } from "@/app/api/teacher/units/route";
import { GET as getUnitPdfHandler } from "@/app/api/teacher/units/[id]/pdf/route";
import { db } from "@/db";
import {
  attendanceRecords,
  auditLogs,
  classes,
  classTeachers,
  lessonCompletions,
  lessons,
  lessonViews,
  parentStudents,
  sessions,
  studentClassHistory,
  students,
  units,
  users,
} from "@/db/schema";
import { generateSessionToken, hashToken, sessionCookieName } from "@/lib/auth";
import { addCalendarDays, currentWeekSundayInSantiago } from "@/lib/timezone";

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
}) {
  const [user] = await db
    .insert(users)
    .values({
      rut: opts.rut,
      fullName: opts.fullName,
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
});

beforeEach(async () => {
  await sql`TRUNCATE users, classes, rate_limits, audit_logs CASCADE`;
});

afterAll(async () => {
  await sql?.end();
});

describe("Hito 5 — Módulo Profesor, IDOR Horizontal y Asistencia MIN(created_at)", () => {
  it("cierra IDOR horizontal en alumnos, lecciones/tracking, PDFs, asistencia y KPIs; excluye DRAFT", async () => {
    const { user: teacherA, cookie: teacherACookie } = await createUserSession({
      rut: "11111111-1",
      fullName: "Prof Clase A",
      email: "profa@test.cl",
      role: "TEACHER",
    });
    const { cookie: parentCookie } = await createUserSession({
      rut: "22222222-2",
      fullName: "Apoderado Bloqueado",
      email: "padre@test.cl",
      role: "PARENT",
    });

    const [classA, classB] = await db
      .insert(classes)
      .values([
        { name: "Clase A", ageRange: "6-7 años" },
        { name: "Clase B", ageRange: "8-9 años" },
      ])
      .returning();

    await db.insert(classTeachers).values({ classId: classA.id, teacherId: teacherA.id });

    const [studentA, studentB] = await db
      .insert(students)
      .values([
        {
          classId: classA.id,
          fullName: "Mateo A",
          birthDate: "2019-05-01",
          specialCare: "Alergia a las nueces",
          preferences: ["dibujar", "cantar"],
        },
        {
          classId: classB.id,
          fullName: "Lucía B",
          birthDate: "2017-03-10",
          specialCare: "Solo B",
          preferences: ["escribir"],
        },
      ])
      .returning();

    const [unitADraft, unitAActive, unitBActive] = await db
      .insert(units)
      .values([
        { classId: classA.id, orderNumber: 2, title: "A Borrador", status: "DRAFT", pdfStorageKey: "units/a/draft.pdf" },
        { classId: classA.id, orderNumber: 1, title: "A Activa", status: "ACTIVE", pdfStorageKey: "units/a/active.pdf" },
        { classId: classB.id, orderNumber: 1, title: "B Activa", status: "ACTIVE", pdfStorageKey: "units/b/active.pdf" },
      ])
      .returning();

    const futureDate = new Date(Date.now() + 10 * 86_400_000);
    const [lessonADraft, lessonAActiveFuture, lessonBActive] = await db
      .insert(lessons)
      .values([
        { unitId: unitADraft.id, lessonNumber: 1, title: "Borrador L1", scheduleStatus: "SCHEDULED" },
        {
          unitId: unitAActive.id,
          lessonNumber: 14,
          title: "Lección 14 Futura",
          biblePassage: "Juan 3:16",
          parentSummary: ["Párrafo limpio de prueba para la familia con suficiente contenido."],
          reinforcementQuestions: ["¿Qué aprendimos?", "¿Cómo aplicarlo?"],
          classSundayDate: addCalendarDays(currentWeekSundayInSantiago(), 14),
          unlockAt: futureDate,
          scheduleStatus: "SCHEDULED",
        },
        {
          unitId: unitBActive.id,
          lessonNumber: 1,
          title: "Lección B1",
          biblePassage: "Génesis 1:1",
          scheduleStatus: "FORCE_UNLOCKED",
        },
      ])
      .returning();

    // PARENT no accede a ningún endpoint /api/teacher/*
    expect((await getTeacherClassesHandler(req("/api/teacher/classes", { cookie: parentCookie }))).status).toBe(403);
    expect(
      (
        await getStudentSheetHandler(req(`/api/teacher/students/${studentA.id}`, { cookie: parentCookie }), {
          params: Promise.resolve({ id: studentA.id }),
        })
      ).status,
    ).toBe(403);

    // Teacher A ve ficha interna de Alumno A (200), pero recibe 403 sobre Alumno B
    const okSheet = await getStudentSheetHandler(
      req(`/api/teacher/students/${studentA.id}`, { cookie: teacherACookie }),
      { params: Promise.resolve({ id: studentA.id }) },
    );
    expect(okSheet.status).toBe(200);
    const okSheetBody = (await okSheet.json()) as { student: { specialCare: string; preferences: string[] } };
    expect(okSheetBody.student.specialCare).toBe("Alergia a las nueces");
    expect(okSheetBody.student.preferences).toEqual(["dibujar", "cantar"]);

    expect(
      (
        await getStudentSheetHandler(req(`/api/teacher/students/${studentB.id}`, { cookie: teacherACookie }), {
          params: Promise.resolve({ id: studentB.id }),
        })
      ).status,
    ).toBe(403);

    // GET /api/teacher/units excluye DRAFT y clase B; incluye lección futura sin bloqueo semanal
    const unitsRes = await getTeacherUnitsHandler(req("/api/teacher/units", { cookie: teacherACookie }));
    expect(unitsRes.status).toBe(200);
    const unitsBody = (await unitsRes.json()) as { units: { id: string; status: string; lessons: { id: string }[] }[] };
    expect(unitsBody.units.map((u) => u.id)).toEqual([unitAActive.id]);
    expect(unitsBody.units[0].lessons.map((l) => l.id)).toContain(lessonAActiveFuture.id);

    // Tracking: 403 en DRAFT y en Clase B; 200 en Lección 14 futura de Clase A
    expect(
      (
        await getLessonTrackingHandler(
          req(`/api/teacher/lessons/${lessonADraft.id}/tracking`, { cookie: teacherACookie }),
          { params: Promise.resolve({ id: lessonADraft.id }) },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await getLessonTrackingHandler(
          req(`/api/teacher/lessons/${lessonBActive.id}/tracking`, { cookie: teacherACookie }),
          { params: Promise.resolve({ id: lessonBActive.id }) },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await getLessonTrackingHandler(
          req(`/api/teacher/lessons/${lessonAActiveFuture.id}/tracking`, { cookie: teacherACookie }),
          { params: Promise.resolve({ id: lessonAActiveFuture.id }) },
        )
      ).status,
    ).toBe(200);

    // PDF: 403 en DRAFT y en Clase B
    expect(
      (
        await getUnitPdfHandler(req(`/api/teacher/units/${unitADraft.id}/pdf`, { cookie: teacherACookie }), {
          params: Promise.resolve({ id: unitADraft.id }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await getUnitPdfHandler(req(`/api/teacher/units/${unitBActive.id}/pdf`, { cookie: teacherACookie }), {
          params: Promise.resolve({ id: unitBActive.id }),
        })
      ).status,
    ).toBe(403);

    // Asistencia y KPIs en Clase B -> 403; PUT en Clase A con alumno de Clase B -> 403
    const sundayYmd = currentWeekSundayInSantiago();
    expect(
      (
        await getTeacherAttendanceHandler(
          req(`/api/teacher/attendance?classId=${classB.id}&date=${sundayYmd}`, { cookie: teacherACookie }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await putTeacherAttendanceHandler(
          req("/api/teacher/attendance", {
            method: "PUT",
            cookie: teacherACookie,
            body: {
              classId: classB.id,
              attendanceDate: sundayYmd,
              records: [{ studentId: studentB.id, isPresent: true }],
            },
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await putTeacherAttendanceHandler(
          req("/api/teacher/attendance", {
            method: "PUT",
            cookie: teacherACookie,
            body: {
              classId: classA.id,
              attendanceDate: sundayYmd,
              records: [{ studentId: studentB.id, isPresent: true }],
            },
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await getTeacherKpisHandler(
          req(`/api/teacher/kpis?classId=${classB.id}`, { cookie: teacherACookie }),
        )
      ).status,
    ).toBe(403);
  });

  it("permite crear domingo olvidado >10d, bloquea al 4to día MIN(created_at) incluso a alumno nuevo, soporta traslados y override de Super Admin", async () => {
    const { cookie: adminCookie } = await createUserSession({
      rut: "99999999-9",
      fullName: "Super Admin",
      email: "admin@test.cl",
      role: "SUPER_ADMIN",
    });
    const { user: teacherA, cookie: teacherACookie } = await createUserSession({
      rut: "33333333-3",
      fullName: "Profesor A",
      email: "profa2@test.cl",
      role: "TEACHER",
    });

    const [classA, classB] = await db
      .insert(classes)
      .values([{ name: "Clase A" }, { name: "Clase B" }])
      .returning();
    await db.insert(classTeachers).values({ classId: classA.id, teacherId: teacherA.id });

    const sunday14DaysAgo = addCalendarDays(currentWeekSundayInSantiago(), -14);
    const sunday7DaysAgo = addCalendarDays(currentWeekSundayInSantiago(), -7);

    const [studentOld, studentTransfer, studentNew] = await db
      .insert(students)
      .values([
        { classId: classA.id, fullName: "Alumno Antiguo" },
        { classId: classA.id, fullName: "Alumno Trasladado" },
        { classId: classA.id, fullName: "Alumno Nuevo" },
      ])
      .returning();

    await db.insert(studentClassHistory).values([
      {
        studentId: studentOld.id,
        classId: classA.id,
        assignedAt: new Date(Date.now() - 30 * 86_400_000),
      },
      {
        studentId: studentTransfer.id,
        classId: classA.id,
        assignedAt: new Date(Date.now() - 30 * 86_400_000),
      },
    ]);

    // 1. Domingo olvidado hace 14 días SIN registro previo -> TEACHER puede crearlo (200)
    const createForgotten = await putTeacherAttendanceHandler(
      req("/api/teacher/attendance", {
        method: "PUT",
        cookie: teacherACookie,
        body: {
          classId: classA.id,
          attendanceDate: sunday14DaysAgo,
          records: [
            { studentId: studentOld.id, isPresent: true, observation: "Llegó puntual" },
            { studentId: studentTransfer.id, isPresent: false },
          ],
        },
      }),
    );
    expect(createForgotten.status).toBe(200);

    // Fecha no-domingo -> 400
    const nonSunday = addCalendarDays(sunday14DaysAgo, 1);
    const nonSundayRes = await putTeacherAttendanceHandler(
      req("/api/teacher/attendance", {
        method: "PUT",
        cookie: teacherACookie,
        body: {
          classId: classA.id,
          attendanceDate: nonSunday,
          records: [{ studentId: studentOld.id, isPresent: true }],
        },
      }),
    );
    expect(nonSundayRes.status).toBe(400);

    // 2. Traslado dentro de los 3 días: studentTransfer pasa a Clase B el martes
    await db
      .update(students)
      .set({ classId: classB.id })
      .where(eq(students.id, studentTransfer.id));
    await db
      .update(studentClassHistory)
      .set({ unassignedAt: new Date() })
      .where(and(eq(studentClassHistory.studentId, studentTransfer.id), eq(studentClassHistory.classId, classA.id)));
    await db.insert(studentClassHistory).values({
      studentId: studentTransfer.id,
      classId: classB.id,
      assignedAt: new Date(),
    });

    // Profesor de Clase A puede corregir la asistencia de studentTransfer dentro de los 3 días (200)
    const editTransferred = await putTeacherAttendanceHandler(
      req("/api/teacher/attendance", {
        method: "PUT",
        cookie: teacherACookie,
        body: {
          classId: classA.id,
          attendanceDate: sunday14DaysAgo,
          records: [{ studentId: studentTransfer.id, isPresent: true, observation: "Corregido post traslado" }],
        },
      }),
    );
    expect(editTransferred.status).toBe(200);

    // 3. Simular MIN(created_at) hace 4 días calendario para sunday14DaysAgo
    await sql`
      UPDATE attendance_records
      SET created_at = now() - interval '4 days'
      WHERE class_id = ${classA.id}::uuid AND attendance_date = ${sunday14DaysAgo}::date
    `;

    // TEACHER recibe 403 al modificar alumno existente AND 403 al intentar agregar alumno recién inscrito sin fila previa
    const expiredExisting = await putTeacherAttendanceHandler(
      req("/api/teacher/attendance", {
        method: "PUT",
        cookie: teacherACookie,
        body: {
          classId: classA.id,
          attendanceDate: sunday14DaysAgo,
          records: [{ studentId: studentOld.id, isPresent: false }],
        },
      }),
    );
    expect(expiredExisting.status).toBe(403);

    const expiredNewStudent = await putTeacherAttendanceHandler(
      req("/api/teacher/attendance", {
        method: "PUT",
        cookie: teacherACookie,
        body: {
          classId: classA.id,
          attendanceDate: sunday14DaysAgo,
          records: [{ studentId: studentNew.id, isPresent: true }],
        },
      }),
    );
    expect(expiredNewStudent.status).toBe(403);

    // SUPER_ADMIN sí puede corregir y agregar alumno omitido, registrando ATTENDANCE_ADMIN_OVERRIDE
    const adminOverride = await putTeacherAttendanceHandler(
      req("/api/teacher/attendance", {
        method: "PUT",
        cookie: adminCookie,
        body: {
          classId: classA.id,
          attendanceDate: sunday14DaysAgo,
          records: [
            { studentId: studentOld.id, isPresent: false },
            { studentId: studentNew.id, isPresent: true, observation: "Agregado por Admin" },
          ],
        },
      }),
    );
    expect(adminOverride.status).toBe(200);
    const adminOverrideBody = (await adminOverride.json()) as { override: boolean };
    expect(adminOverrideBody.override).toBe(true);

    const [overrideAudit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "ATTENDANCE_ADMIN_OVERRIDE"))
      .limit(1);
    expect(overrideAudit).toBeTruthy();

    // GET devuelve historial y estado canEdit correcto (false para TEACHER en fecha vencida, true en fecha nueva)
    const getExpired = await getTeacherAttendanceHandler(
      req(`/api/teacher/attendance?classId=${classA.id}&date=${sunday14DaysAgo}&studentId=${studentOld.id}`, {
        cookie: teacherACookie,
      }),
    );
    expect(getExpired.status).toBe(200);
    const expiredJson = (await getExpired.json()) as {
      selectedDate: { canEdit: boolean; records: { studentId: string; isPresent: boolean | null }[] };
      studentHistory: { records: { attendanceDate: string; isPresent: boolean }[] };
    };
    expect(expiredJson.selectedDate.canEdit).toBe(false);
    expect(expiredJson.studentHistory.records).toHaveLength(1);
    expect(expiredJson.studentHistory.records[0].isPresent).toBe(false);

    // Domingo distinto sin registros sigue editable para el profesor
    const getOpen = await getTeacherAttendanceHandler(
      req(`/api/teacher/attendance?classId=${classA.id}&date=${sunday7DaysAgo}`, { cookie: teacherACookie }),
    );
    const openJson = (await getOpen.json()) as { selectedDate: { canEdit: boolean } };
    expect(openJson.selectedDate.canEdit).toBe(true);
  });

  it("calcula correctamente KPIs de clase y seguimiento Visto/Completado excluyendo padres INACTIVE", async () => {
    const { user: teacher, cookie: teacherCookie } = await createUserSession({
      rut: "44444444-4",
      fullName: "Prof KPIs",
      email: "profkpi@test.cl",
      role: "TEACHER",
    });
    const [parentActive, parentInactive] = await db
      .insert(users)
      .values([
        { rut: "55555555-5", fullName: "Padre Activo", email: "pa@test.cl", role: "PARENT", status: "ACTIVE" },
        { rut: "66666666-6", fullName: "Padre Inactivo", email: "pi@test.cl", role: "PARENT", status: "INACTIVE" },
      ])
      .returning();

    const [classA] = await db.insert(classes).values({ name: "Clase KPI" }).returning();
    await db.insert(classTeachers).values({ classId: classA.id, teacherId: teacher.id });

    const [s1, s2] = await db
      .insert(students)
      .values([
        { classId: classA.id, fullName: "Niño Con Padre", status: "ACTIVE" },
        { classId: classA.id, fullName: "Niño Sin Padre", status: "ACTIVE" },
      ])
      .returning();

    await db.insert(parentStudents).values([
      { parentId: parentActive.id, studentId: s1.id, relationship: "Padre" },
      { parentId: parentInactive.id, studentId: s1.id, relationship: "Madre" },
    ]);

    const [unit] = await db
      .insert(units)
      .values({ classId: classA.id, orderNumber: 1, title: "U1", status: "ACTIVE", pdfStorageKey: "units/k/u1.pdf" })
      .returning();

    const [l1] = await db
      .insert(lessons)
      .values({
        unitId: unit.id,
        lessonNumber: 1,
        title: "L1 Desbloqueada",
        biblePassage: "Salmo 23",
        scheduleStatus: "FORCE_UNLOCKED",
      })
      .returning();

    await db.insert(lessonViews).values({ lessonId: l1.id, parentId: parentActive.id });
    await db.insert(lessonCompletions).values({
      lessonId: l1.id,
      studentId: s1.id,
      completedByUserId: parentActive.id,
    });
    await db.insert(attendanceRecords).values([
      {
        classId: classA.id,
        studentId: s1.id,
        attendanceDate: currentWeekSundayInSantiago(),
        isPresent: true,
        recordedByUserId: teacher.id,
      },
      {
        classId: classA.id,
        studentId: s2.id,
        attendanceDate: currentWeekSundayInSantiago(),
        isPresent: false,
        recordedByUserId: teacher.id,
      },
    ]);

    const trackingRes = await getLessonTrackingHandler(
      req(`/api/teacher/lessons/${l1.id}/tracking`, { cookie: teacherCookie }),
      { params: Promise.resolve({ id: l1.id }) },
    );
    expect(trackingRes.status).toBe(200);
    const tracking = (await trackingRes.json()) as {
      kpis: { openPct: number; openExpected: number; completionPct: number; completionExpected: number };
    };
    expect(tracking.kpis).toMatchObject({
      openExpected: 1,
      openPct: 100,
      completionExpected: 1, // s2 no tiene padre activo vinculado -> no infla denominador
      completionPct: 100,
    });

    const kpisRes = await getTeacherKpisHandler(req("/api/teacher/kpis", { cookie: teacherCookie }));
    expect(kpisRes.status).toBe(200);
    const kpiJson = (await kpisRes.json()) as {
      kpis: { attendancePct: number; openingPct: number; completionPct: number };
    };
    expect(kpiJson.kpis).toMatchObject({
      attendancePct: 50,
      openingPct: 100,
      completionPct: 100,
    });
  });
});
