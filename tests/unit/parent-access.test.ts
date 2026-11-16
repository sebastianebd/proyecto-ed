import { describe, expect, it } from "vitest";
import { isLessonUnlockedForParent, validateRequestedStudentIds } from "@/lib/parent-rules";
import { parentCompleteLessonSchema } from "@/lib/validators";

describe("Hito 4 — Lógica de desbloqueo y selección de alumnos para padres", () => {
  const now = new Date("2026-05-11T12:00:00.000Z"); // Lunes 08:00 Chile
  const pastUnlock = new Date("2026-05-11T04:01:00.000Z"); // Lunes 00:01 Chile
  const futureUnlock = new Date("2026-05-18T04:01:00.000Z");

  it("desbloquea solo SCHEDULED con now >= unlock_at o FORCE_UNLOCKED; bloquea PAUSED, FORCE_LOCKED y futuras", () => {
    expect(isLessonUnlockedForParent({ scheduleStatus: "SCHEDULED", unlockAt: pastUnlock }, now)).toBe(true);
    expect(isLessonUnlockedForParent({ scheduleStatus: "SCHEDULED", unlockAt: now }, now)).toBe(true);
    expect(isLessonUnlockedForParent({ scheduleStatus: "SCHEDULED", unlockAt: futureUnlock }, now)).toBe(false);
    expect(isLessonUnlockedForParent({ scheduleStatus: "SCHEDULED", unlockAt: null }, now)).toBe(false);
    expect(isLessonUnlockedForParent({ scheduleStatus: "FORCE_UNLOCKED", unlockAt: futureUnlock }, now)).toBe(true);
    expect(isLessonUnlockedForParent({ scheduleStatus: "FORCE_UNLOCKED", unlockAt: null }, now)).toBe(true);
    expect(isLessonUnlockedForParent({ scheduleStatus: "PAUSED", unlockAt: pastUnlock }, now)).toBe(false);
    expect(isLessonUnlockedForParent({ scheduleStatus: "FORCE_LOCKED", unlockAt: pastUnlock }, now)).toBe(false);
  });

  it("valida y deduplica studentIds contra hijos elegibles, rechazando ajenos", () => {
    const eligible = [
      { id: "11111111-1111-4111-8111-111111111111", fullName: "Hijo 1", classId: "c1", className: "C", relationship: "Mamá" },
      { id: "22222222-2222-4222-8222-222222222222", fullName: "Hijo 2", classId: "c1", className: "C", relationship: "Mamá" },
    ];
    expect(
      validateRequestedStudentIds(eligible, [
        "11111111-1111-4111-8111-111111111111",
        "11111111-1111-4111-8111-111111111111",
      ]),
    ).toEqual(["11111111-1111-4111-8111-111111111111"]);

    expect(
      validateRequestedStudentIds(eligible, [
        "11111111-1111-4111-8111-111111111111",
        "99999999-9999-4999-8999-999999999999",
      ]),
    ).toBeNull();
  });

  it("valida schema parentCompleteLessonSchema (min 1 UUID v4 válido)", () => {
    expect(parentCompleteLessonSchema.safeParse({ studentIds: [] }).success).toBe(false);
    expect(parentCompleteLessonSchema.safeParse({ studentIds: ["no-uuid"] }).success).toBe(false);
    expect(
      parentCompleteLessonSchema.safeParse({ studentIds: ["11111111-1111-4111-8111-111111111111"] }).success,
    ).toBe(true);
  });
});
