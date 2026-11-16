import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ageRangeSchema,
  attendanceObservationSchema,
  birthDateSchema,
  fullNameSchema,
  paginationSchema,
  parentSummarySchema,
  phoneSchema,
  preferencesNotesSchema,
  preferencesSchema,
  reinforcementQuestionsSchema,
  relationshipSchema,
  specialCareSchema,
  uuidV4Schema,
} from "@/lib/validators";

// Casos BVA / EP de docs/05-pruebas-y-qa.md §2.2.
describe("Hito 1 — Validadores Zod compartidos", () => {
  describe("fullNameSchema (3..80, Unicode letras + guion/apóstrofe)", () => {
    it.each([
      { name: "mínimo exacto (3)", value: "Ana", valid: true },
      { name: "máximo exacto (80)", value: "A".repeat(80), valid: true },
      { name: "Unicode con Ñ, tildes y apóstrofe", value: "María José Ñancupil O'Connor", valid: true },
      { name: "con guion y apóstrofe tipográfico", value: "Ana-Lucía Pérez’s", valid: true },
      { name: "bajo mínimo (2)", value: "An", valid: false },
      { name: "sobre máximo (81)", value: "A".repeat(81), valid: false },
      { name: "solo espacios", value: "   ", valid: false },
      { name: "con número", value: "Juan2", valid: false },
      { name: "con emoji", value: "Pedro 😀", valid: false },
      { name: "con HTML", value: "<b>Ana</b>", valid: false },
    ])("$name", ({ value, valid }) => {
      expect(fullNameSchema.safeParse(value).success).toBe(valid);
    });
  });

  describe("opcionales con .min() ('' y espacios -> undefined)", () => {
    it("preprocesa vacío a undefined en phone, relationship y ageRange", () => {
      for (const empty of ["", "   "]) {
        expect(phoneSchema.parse(empty)).toBeUndefined();
        expect(relationshipSchema.parse(empty)).toBeUndefined();
        expect(ageRangeSchema.parse(empty)).toBeUndefined();
      }
      expect(phoneSchema.safeParse("123").success).toBe(false);
      expect(phoneSchema.parse(" +56912345678 ")).toBe("+56912345678");
      expect(phoneSchema.safeParse("1".repeat(16)).success).toBe(false);
    });
  });

  describe("parentSummarySchema (1..20 párrafos, suma 50..2.500 chars)", () => {
    it.each([
      { name: "0 párrafos", value: [], valid: false },
      { name: "párrafo solo espacios", value: ["   "], valid: false },
      { name: "1 párrafo de 49 chars (B-1)", value: ["a".repeat(49)], valid: false },
      { name: "1 párrafo de 50 chars (B)", value: ["a".repeat(50)], valid: true },
      { name: "2 párrafos de 25 + 25", value: ["a".repeat(25), "b".repeat(25)], valid: true },
      { name: "20 párrafos sumando 2.500 (B)", value: Array.from({ length: 20 }, () => "a".repeat(125)), valid: true },
      { name: "suma 2.501 chars (B+1)", value: ["a".repeat(2500), "b"], valid: false },
      { name: "21 párrafos válidos (B+1)", value: Array.from({ length: 21 }, () => "abc"), valid: false },
      { name: "rechaza HTML", value: [`<script>alert(1)</script>${"a".repeat(30)}`], valid: false },
      { name: "rechaza Markdown crudo **", value: [`**Dios** nos ama todos los días de nuestra vida y siempre.`], valid: false },
    ])("$name", ({ value, valid }) => {
      expect(parentSummarySchema.safeParse(value).success).toBe(valid);
    });
  });

  describe("reinforcementQuestionsSchema (2..5 ítems, 10..280 chars)", () => {
    const q10 = "a".repeat(10);
    const q280 = "a".repeat(280);
    it.each([
      { name: "1 ítem (B-1)", value: [q10], valid: false },
      { name: "2 ítems de 10 chars (B)", value: [q10, q10], valid: true },
      { name: "5 ítems de 280 chars (B)", value: Array.from({ length: 5 }, () => q280), valid: true },
      { name: "6 ítems (B+1)", value: Array.from({ length: 6 }, () => q10), valid: false },
      { name: "ítem de 9 chars (B-1)", value: ["a".repeat(9), q10], valid: false },
      { name: "ítem de 281 chars (B+1)", value: ["a".repeat(281), q10], valid: false },
    ])("$name", ({ value, valid }) => {
      expect(reinforcementQuestionsSchema.safeParse(value).success).toBe(valid);
    });
  });

  describe("UUID v4 y paginación", () => {
    it("valida UUID v4 estricto y rechaza strings o UUID v1", () => {
      expect(uuidV4Schema.safeParse("550e8400-e29b-41d4-a716-446655440000").success).toBe(true);
      expect(uuidV4Schema.safeParse("550e8400-e29b-11d4-a716-446655440000").success).toBe(false);
      expect(uuidV4Schema.safeParse("123").success).toBe(false);
      expect(uuidV4Schema.safeParse("' OR 1=1 --").success).toBe(false);
    });

    it("impone page >= 1 y limit <= 50", () => {
      expect(paginationSchema.safeParse({ page: 1, limit: 50 }).success).toBe(true);
      expect(paginationSchema.safeParse({ page: 1, limit: 51 }).success).toBe(false);
      expect(paginationSchema.safeParse({ page: 0, limit: 10 }).success).toBe(false);
    });
  });

  describe("Límites exactos de ficha alumno, observación y nacimiento", () => {
    it("respeta topes B / B+1 en observación (200), cuidados (300), notas (250) y preferencias (10x30)", () => {
      expect(attendanceObservationSchema.safeParse("a".repeat(200)).success).toBe(true);
      expect(attendanceObservationSchema.safeParse("a".repeat(201)).success).toBe(false);
      expect(specialCareSchema.safeParse("a".repeat(300)).success).toBe(true);
      expect(specialCareSchema.safeParse("a".repeat(301)).success).toBe(false);
      expect(preferencesNotesSchema.safeParse("a".repeat(250)).success).toBe(true);
      expect(preferencesNotesSchema.safeParse("a".repeat(251)).success).toBe(false);
      expect(preferencesSchema.safeParse(Array.from({ length: 10 }, () => "a".repeat(30))).success).toBe(true);
      expect(preferencesSchema.safeParse(Array.from({ length: 11 }, () => "dibujar")).success).toBe(false);
      expect(preferencesSchema.safeParse(["a".repeat(31)]).success).toBe(false);
    });

    it("valida birthDate real, no futura (en America/Santiago) y <= 25 años", () => {
      expect(birthDateSchema.parse("")).toBeUndefined();
      expect(birthDateSchema.safeParse("2020-05-10").success).toBe(true);
      expect(birthDateSchema.safeParse("2025-02-30").success).toBe(false);
      expect(birthDateSchema.safeParse("2099-01-01").success).toBe(false);
      expect(birthDateSchema.safeParse("1990-01-01").success).toBe(false);

      // 2026-05-11 01:30Z corresponde a 2026-05-10 21:30 en Chile (CLT UTC-4)
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-11T01:30:00Z"));
      expect(birthDateSchema.safeParse("2026-05-10").success).toBe(true);
      expect(birthDateSchema.safeParse("2026-05-11").success).toBe(false);
      vi.useRealTimers();
    });
  });
});

afterEach(() => {
  vi.useRealTimers();
});
