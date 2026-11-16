import { santiagoDayEndUtc, santiagoDayStartUtc } from "@/lib/timezone";

export type StudentAttendanceHistoryInterval = {
  classId: string;
  assignedAt: Date;
  unassignedAt: Date | null;
};

/**
 * Determina si un alumno es elegible para quedar registrado en `attendance_records`
 * de `(classId, attendanceDate)` (docs/02-diseno-y-arquitectura.md §4.3 y docs/03 §4.2):
 * 1. Pertenece actualmente a la clase como alumno `ACTIVE`, o
 * 2. Ya tiene una fila previa en `attendance_records` para ese `(classId, attendanceDate)`, o
 * 3. Tuvo vigencia en `student_class_history` para `classId` durante ese día calendario en Chile.
 */
export function isStudentEligibleForAttendance(params: {
  student: { id: string; classId: string; status: string };
  classId: string;
  attendanceDate: string;
  historyIntervals: StudentAttendanceHistoryInterval[];
  hasExistingAttendanceRow: boolean;
}): boolean {
  const { student, classId, attendanceDate, historyIntervals, hasExistingAttendanceRow } = params;
  if (student.classId === classId && student.status === "ACTIVE") return true;
  if (hasExistingAttendanceRow) return true;

  const dayStart = santiagoDayStartUtc(attendanceDate).getTime();
  const dayEnd = santiagoDayEndUtc(attendanceDate).getTime();

  return historyIntervals.some((h) => {
    if (h.classId !== classId) return false;
    const startMs = h.assignedAt.getTime();
    const endMs = h.unassignedAt ? h.unassignedAt.getTime() : Number.POSITIVE_INFINITY;
    return startMs <= dayEnd && endMs >= dayStart;
  });
}

/** Calcula edad aproximada en años cumplidos respecto a `todayYmd` (`YYYY-MM-DD`). */
export function computeAgeYears(birthDateYmd: string | null, todayYmd: string): number | null {
  if (!birthDateYmd) return null;
  const [by, bm, bd] = birthDateYmd.split("-").map(Number);
  const [ty, tm, td] = todayYmd.split("-").map(Number);
  if (!by || !bm || !bd || !ty || !tm || !td) return null;
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age >= 0 ? age : null;
}
