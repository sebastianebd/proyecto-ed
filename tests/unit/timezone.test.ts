import { describe, expect, it } from "vitest";
import { isStudentEligibleForAttendance } from "@/lib/teacher-rules";
import {
  attendanceEditDeadlineYmd,
  computeUnlockAtFromSunday,
  isAttendanceEditWindowOpen,
  todayInSantiago,
  validatePastOrTodaySunday,
} from "@/lib/timezone";

describe("Hito 5 — Zona horaria America/Santiago, DST y MIN(created_at)", () => {
  it("recalcula unlock_at a lunes 00:01 America/Santiago respetando cambios DST de abril y septiembre", () => {
    // Domingo 2026-04-05 (después del cambio a CLT UTC-4) -> lunes 2026-04-06 00:01 CLT = 04:01Z
    const aprilUnlock = computeUnlockAtFromSunday("2026-04-05");
    expect(aprilUnlock.toISOString()).toBe("2026-04-06T04:01:00.000Z");

    // Domingo 2026-08-30 (aún en CLT UTC-4) -> lunes 2026-08-31 00:01 CLT = 04:01Z
    const augUnlock = computeUnlockAtFromSunday("2026-08-30");
    expect(augUnlock.toISOString()).toBe("2026-08-31T04:01:00.000Z");

    // Domingo 2026-09-06 (cambio a CLST UTC-3) -> lunes 2026-09-07 00:01 CLST = 03:01Z
    const septUnlock = computeUnlockAtFromSunday("2026-09-06");
    expect(septUnlock.toISOString()).toBe("2026-09-07T03:01:00.000Z");
  });

  it("ancla la ventana de 3 días calendario desde MIN(created_at) en America/Santiago", () => {
    // 2026-05-11T03:59:00Z = 2026-05-10 23:59 en Chile (CLT UTC-4)
    const firstCreatedAt = new Date("2026-05-11T03:59:00.000Z");
    expect(todayInSantiago(firstCreatedAt)).toBe("2026-05-10");
    expect(attendanceEditDeadlineYmd(firstCreatedAt)).toBe("2026-05-13");

    // Sin registro previo (domingo olvidado) siempre permite crear
    expect(isAttendanceEditWindowOpen(null, new Date("2026-06-01T15:00:00Z"))).toBe(true);

    // Día 3 a las 23:59 Chile (2026-05-14 03:59Z) sigue abierto
    expect(isAttendanceEditWindowOpen(firstCreatedAt, new Date("2026-05-14T03:59:59.000Z"))).toBe(true);

    // Día 4 a las 00:00 Chile (2026-05-14 04:00Z) queda cerrado
    expect(isAttendanceEditWindowOpen(firstCreatedAt, new Date("2026-05-14T04:00:00.000Z"))).toBe(false);
  });

  it("valida domingos pasados/actuales (incluyendo domingo 23:30 Chile) y rechaza lunes o domingos futuros", () => {
    const now = new Date("2026-05-12T16:00:00Z"); // martes 2026-05-12 en Chile
    expect(validatePastOrTodaySunday("2026-05-10", now)).toEqual({ ok: true });
    expect(validatePastOrTodaySunday("2026-05-11", now).ok).toBe(false);
    expect(validatePastOrTodaySunday("2026-05-17", now).ok).toBe(false);

    // Domingo 23:30 Chile cuando en UTC ya es lunes
    expect(validatePastOrTodaySunday("2026-05-10", new Date("2026-05-11T03:30:00.000Z"))).toEqual({ ok: true }); // CLT UTC-4
    expect(validatePastOrTodaySunday("2026-10-11", new Date("2026-10-12T02:30:00.000Z"))).toEqual({ ok: true }); // CLST UTC-3
  });

  it("respeta los 3 días calendario de MIN(created_at) desde las 23:55 Chile cruzando cambios DST", () => {
    // Cruce abril (CLST -> CLT): 2026-04-04 23:55 Chile = 2026-04-05T02:55:00Z
    const aprilCreated = new Date("2026-04-05T02:55:00.000Z");
    expect(attendanceEditDeadlineYmd(aprilCreated)).toBe("2026-04-07");
    expect(isAttendanceEditWindowOpen(aprilCreated, new Date("2026-04-08T03:59:59.000Z"))).toBe(true);
    expect(isAttendanceEditWindowOpen(aprilCreated, new Date("2026-04-08T04:00:00.000Z"))).toBe(false);

    // Cruce septiembre (CLT -> CLST): 2026-09-05 23:55 Chile = 2026-09-06T03:55:00Z
    const septCreated = new Date("2026-09-06T03:55:00.000Z");
    expect(attendanceEditDeadlineYmd(septCreated)).toBe("2026-09-08");
    expect(isAttendanceEditWindowOpen(septCreated, new Date("2026-09-09T02:59:59.000Z"))).toBe(true);
    expect(isAttendanceEditWindowOpen(septCreated, new Date("2026-09-09T03:00:00.000Z"))).toBe(false);
  });

  it("permite asistencia de alumnos vigentes, históricos en esa fecha o ya registrados", () => {
    const baseStudent = { id: "s1", classId: "cA", status: "ACTIVE" };
    expect(
      isStudentEligibleForAttendance({
        student: baseStudent,
        classId: "cA",
        attendanceDate: "2026-05-10",
        historyIntervals: [],
        hasExistingAttendanceRow: false,
      }),
    ).toBe(true);

    // Alumno trasladado de cA a cB el martes 2026-05-12: sigue elegible en cA para domingo 2026-05-10
    expect(
      isStudentEligibleForAttendance({
        student: { id: "s1", classId: "cB", status: "ACTIVE" },
        classId: "cA",
        attendanceDate: "2026-05-10",
        historyIntervals: [
          {
            classId: "cA",
            assignedAt: new Date("2026-04-01T12:00:00Z"),
            unassignedAt: new Date("2026-05-12T15:00:00Z"),
          },
        ],
        hasExistingAttendanceRow: false,
      }),
    ).toBe(true);

    // Alumno de cB sin historial ni fila en cA queda rechazado
    expect(
      isStudentEligibleForAttendance({
        student: { id: "s2", classId: "cB", status: "ACTIVE" },
        classId: "cA",
        attendanceDate: "2026-05-10",
        historyIntervals: [],
        hasExistingAttendanceRow: false,
      }),
    ).toBe(false);
  });
});
