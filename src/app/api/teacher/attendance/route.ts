import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { attendanceRecords, studentClassHistory, students, users } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth";
import { jsonError, parseBody, withErrorHandling } from "@/lib/http";
import { assertTeacherClassAccess } from "@/lib/teacher";
import { isStudentEligibleForAttendance } from "@/lib/teacher-rules";
import {
  attendanceEditDeadlineYmd,
  isAttendanceEditWindowOpen,
  santiagoDayEndUtc,
  santiagoDayStartUtc,
  validatePastOrTodaySunday,
} from "@/lib/timezone";
import { isoDateSchema, teacherAttendancePutSchema, uuidV4Schema } from "@/lib/validators";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["TEACHER", "SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const classId = url.searchParams.get("classId") || "";
  const dateParam = url.searchParams.get("date") || undefined;
  const studentIdParam = url.searchParams.get("studentId") || undefined;

  if (!classId) return jsonError(400, "classId requerido");
  const access = await assertTeacherClassAccess(auth.user, classId);
  if (!access.ok) return access.response;

  if (dateParam) {
    if (!isoDateSchema.safeParse(dateParam).success) {
      return jsonError(400, "Formato de fecha debe ser YYYY-MM-DD");
    }
    const sundayCheck = validatePastOrTodaySunday(dateParam);
    if (!sundayCheck.ok) {
      return jsonError(400, sundayCheck.reason);
    }
  }

  if (studentIdParam && !uuidV4Schema.safeParse(studentIdParam).success) {
    return jsonError(400, "studentId inválido");
  }

  const now = new Date();

  const recordedRows = await db
    .select({
      attendanceDate: attendanceRecords.attendanceDate,
      presentCount: sql<number>`COALESCE(SUM(CASE WHEN ${attendanceRecords.isPresent} THEN 1 ELSE 0 END), 0)::int`,
      totalCount: sql<number>`COUNT(*)::int`,
      firstCreatedAt: sql<Date>`MIN(${attendanceRecords.createdAt})`,
    })
    .from(attendanceRecords)
    .where(eq(attendanceRecords.classId, classId))
    .groupBy(attendanceRecords.attendanceDate)
    .orderBy(desc(attendanceRecords.attendanceDate));

  const recordedDates = recordedRows.map((r) => {
    const firstCreatedAt = r.firstCreatedAt ? new Date(r.firstCreatedAt) : null;
    const withinTeacherWindow = isAttendanceEditWindowOpen(firstCreatedAt, now);
    return {
      attendanceDate: r.attendanceDate,
      presentCount: Number(r.presentCount),
      totalCount: Number(r.totalCount),
      firstCreatedAt,
      editDeadlineYmd: firstCreatedAt ? attendanceEditDeadlineYmd(firstCreatedAt) : null,
      withinTeacherWindow,
      canEdit: auth.user.role === "SUPER_ADMIN" || withinTeacherWindow,
    };
  });

  let selectedDate: {
    attendanceDate: string;
    firstCreatedAt: Date | null;
    editDeadlineYmd: string | null;
    withinTeacherWindow: boolean;
    canEdit: boolean;
    records: {
      studentId: string;
      fullName: string;
      transferredOut: boolean;
      isPresent: boolean | null;
      observation: string | null;
      recordedByName: string | null;
      updatedAt: Date | null;
    }[];
  } | null = null;

  if (dateParam) {
    const dayStart = santiagoDayStartUtc(dateParam);
    const dayEnd = santiagoDayEndUtc(dateParam);

    const [savedRows, currentActiveStudents, historyStudentRows, minRow] = await Promise.all([
      db
        .select({
          studentId: attendanceRecords.studentId,
          fullName: students.fullName,
          currentClassId: students.classId,
          isPresent: attendanceRecords.isPresent,
          observation: attendanceRecords.observation,
          updatedAt: attendanceRecords.updatedAt,
          recordedByName: users.fullName,
        })
        .from(attendanceRecords)
        .innerJoin(students, eq(attendanceRecords.studentId, students.id))
        .innerJoin(users, eq(attendanceRecords.recordedByUserId, users.id))
        .where(and(eq(attendanceRecords.classId, classId), eq(attendanceRecords.attendanceDate, dateParam))),
      db
        .select({ id: students.id, fullName: students.fullName, classId: students.classId })
        .from(students)
        .where(and(eq(students.classId, classId), eq(students.status, "ACTIVE"))),
      db
        .select({
          id: students.id,
          fullName: students.fullName,
          classId: students.classId,
        })
        .from(studentClassHistory)
        .innerJoin(students, eq(studentClassHistory.studentId, students.id))
        .where(
          and(
            eq(studentClassHistory.classId, classId),
            lte(studentClassHistory.assignedAt, dayEnd),
            or(isNull(studentClassHistory.unassignedAt), gte(studentClassHistory.unassignedAt, dayStart)),
          ),
        ),
      db
        .select({ firstCreatedAt: sql<Date | null>`MIN(${attendanceRecords.createdAt})` })
        .from(attendanceRecords)
        .where(and(eq(attendanceRecords.classId, classId), eq(attendanceRecords.attendanceDate, dateParam))),
    ]);

    const firstCreatedAt = minRow[0]?.firstCreatedAt ? new Date(minRow[0].firstCreatedAt) : null;
    const withinTeacherWindow = isAttendanceEditWindowOpen(firstCreatedAt, now);

    const savedByStudent = new Map(savedRows.map((r) => [r.studentId, r]));
    const rosterMap = new Map<string, { studentId: string; fullName: string; currentClassId: string }>();

    for (const s of currentActiveStudents) {
      rosterMap.set(s.id, { studentId: s.id, fullName: s.fullName, currentClassId: s.classId });
    }
    for (const h of historyStudentRows) {
      if (!rosterMap.has(h.id)) {
        rosterMap.set(h.id, { studentId: h.id, fullName: h.fullName, currentClassId: h.classId });
      }
    }
    for (const s of savedRows) {
      if (!rosterMap.has(s.studentId)) {
        rosterMap.set(s.studentId, {
          studentId: s.studentId,
          fullName: s.fullName,
          currentClassId: s.currentClassId,
        });
      }
    }

    const records = Array.from(rosterMap.values())
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "es"))
      .map((s) => {
        const saved = savedByStudent.get(s.studentId);
        return {
          studentId: s.studentId,
          fullName: s.fullName,
          transferredOut: s.currentClassId !== classId,
          isPresent: saved ? saved.isPresent : null,
          observation: saved?.observation ?? null,
          recordedByName: saved?.recordedByName ?? null,
          updatedAt: saved?.updatedAt ?? null,
        };
      });

    selectedDate = {
      attendanceDate: dateParam,
      firstCreatedAt,
      editDeadlineYmd: firstCreatedAt ? attendanceEditDeadlineYmd(firstCreatedAt) : null,
      withinTeacherWindow,
      canEdit: auth.user.role === "SUPER_ADMIN" || withinTeacherWindow,
      records,
    };
  }

  let studentHistory: {
    studentId: string;
    fullName: string;
    records: { attendanceDate: string; isPresent: boolean; observation: string | null; updatedAt: Date }[];
  } | null = null;

  if (studentIdParam) {
    const [studentRow] = await db
      .select({ id: students.id, fullName: students.fullName, classId: students.classId })
      .from(students)
      .where(eq(students.id, studentIdParam))
      .limit(1);

    if (!studentRow) return jsonError(404, "Alumno no encontrado");

    const [historyMatch, existingAtt] = await Promise.all([
      db
        .select({ id: studentClassHistory.id })
        .from(studentClassHistory)
        .where(and(eq(studentClassHistory.studentId, studentIdParam), eq(studentClassHistory.classId, classId)))
        .limit(1),
      db
        .select({
          attendanceDate: attendanceRecords.attendanceDate,
          isPresent: attendanceRecords.isPresent,
          observation: attendanceRecords.observation,
          updatedAt: attendanceRecords.updatedAt,
        })
        .from(attendanceRecords)
        .where(and(eq(attendanceRecords.classId, classId), eq(attendanceRecords.studentId, studentIdParam)))
        .orderBy(desc(attendanceRecords.attendanceDate)),
    ]);

    if (studentRow.classId !== classId && historyMatch.length === 0 && existingAtt.length === 0) {
      return jsonError(403, "El alumno no pertenece a esta clase");
    }

    studentHistory = {
      studentId: studentRow.id,
      fullName: studentRow.fullName,
      records: existingAtt,
    };
  }

  return NextResponse.json({
    class: { id: access.classRow.id, name: access.classRow.name },
    recordedDates,
    selectedDate,
    studentHistory,
  });
});

export const PUT = withErrorHandling(async (req: NextRequest) => {
  const auth = await requireAuth(req, { allowedRoles: ["TEACHER", "SUPER_ADMIN"] });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, teacherAttendancePutSchema);
  if (!parsed.ok) return parsed.response;

  const { classId, attendanceDate, records } = parsed.data;

  const access = await assertTeacherClassAccess(auth.user, classId);
  if (!access.ok) return access.response;

  const studentIds = records.map((r) => r.studentId);
  const now = new Date();

  const txResult = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${classId}:${attendanceDate}`}))`);

    const [minRow] = await tx
      .select({ firstCreatedAt: sql<Date | null>`MIN(${attendanceRecords.createdAt})` })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.classId, classId), eq(attendanceRecords.attendanceDate, attendanceDate)));

    const firstCreatedAt = minRow?.firstCreatedAt ? new Date(minRow.firstCreatedAt) : null;
    const withinTeacherWindow = isAttendanceEditWindowOpen(firstCreatedAt, now);

    if (auth.user.role === "TEACHER" && !withinTeacherWindow) {
      return {
        ok: false as const,
        status: 403,
        error: "Plazo de 3 días tras la creación vencido; solicita corrección al Super Admin",
      };
    }

    const [studentRows, historyRows, existingRows] = await Promise.all([
      tx
        .select({ id: students.id, classId: students.classId, status: students.status })
        .from(students)
        .where(inArray(students.id, studentIds)),
      tx
        .select({
          studentId: studentClassHistory.studentId,
          classId: studentClassHistory.classId,
          assignedAt: studentClassHistory.assignedAt,
          unassignedAt: studentClassHistory.unassignedAt,
        })
        .from(studentClassHistory)
        .where(and(inArray(studentClassHistory.studentId, studentIds), eq(studentClassHistory.classId, classId))),
      tx
        .select({ studentId: attendanceRecords.studentId })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.classId, classId),
            eq(attendanceRecords.attendanceDate, attendanceDate),
            inArray(attendanceRecords.studentId, studentIds),
          ),
        ),
    ]);

    const studentMap = new Map(studentRows.map((s) => [s.id, s]));
    const existingSet = new Set(existingRows.map((e) => e.studentId));
    const historyByStudent = new Map<string, typeof historyRows>();
    for (const h of historyRows) {
      const list = historyByStudent.get(h.studentId) ?? [];
      list.push(h);
      historyByStudent.set(h.studentId, list);
    }

    for (const sid of studentIds) {
      const student = studentMap.get(sid);
      if (!student) {
        return { ok: false as const, status: 403, error: "Uno o más alumnos no existen o no pertenecen a la clase" };
      }
      const eligible = isStudentEligibleForAttendance({
        student,
        classId,
        attendanceDate,
        historyIntervals: historyByStudent.get(sid) ?? [],
        hasExistingAttendanceRow: existingSet.has(sid),
      });
      if (!eligible) {
        return {
          ok: false as const,
          status: 403,
          error: "Uno o más alumnos no pertenecen a esta clase en la fecha seleccionada",
        };
      }
    }

    await tx
      .insert(attendanceRecords)
      .values(
        records.map((r) => ({
          classId,
          studentId: r.studentId,
          attendanceDate,
          isPresent: r.isPresent,
          observation: r.observation ?? null,
          recordedByUserId: auth.user.id,
        })),
      )
      .onConflictDoUpdate({
        target: [attendanceRecords.classId, attendanceRecords.studentId, attendanceRecords.attendanceDate],
        set: {
          isPresent: sql`excluded.is_present`,
          observation: sql`excluded.observation`,
          recordedByUserId: auth.user.id,
          updatedAt: sql`now()`,
        },
      });

    const isAdminOverride = auth.user.role === "SUPER_ADMIN" && !withinTeacherWindow;

    await recordAuditLog(
      {
        actorUserId: auth.user.id,
        actorRole: auth.user.role,
        action: isAdminOverride ? "ATTENDANCE_ADMIN_OVERRIDE" : "ATTENDANCE_SAVE",
        entityType: "attendance",
        entityId: classId,
        details: {
          attendanceDate,
          totalSaved: records.length,
          presentCount: records.filter((r) => r.isPresent).length,
          override: isAdminOverride,
        },
      },
      tx,
    );

    const [updatedMinRow] = await tx
      .select({ firstCreatedAt: sql<Date>`MIN(${attendanceRecords.createdAt})` })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.classId, classId), eq(attendanceRecords.attendanceDate, attendanceDate)));

    const effectiveFirstCreatedAt = updatedMinRow?.firstCreatedAt ? new Date(updatedMinRow.firstCreatedAt) : now;

    return {
      ok: true as const,
      savedCount: records.length,
      firstCreatedAt: effectiveFirstCreatedAt,
      editDeadlineYmd: attendanceEditDeadlineYmd(effectiveFirstCreatedAt),
      override: isAdminOverride,
    };
  });

  if (!txResult.ok) {
    return jsonError(txResult.status, txResult.error);
  }

  return NextResponse.json({
    ok: true,
    attendanceDate,
    savedCount: txResult.savedCount,
    firstCreatedAt: txResult.firstCreatedAt,
    editDeadlineYmd: txResult.editDeadlineYmd,
    override: txResult.override,
  });
});
