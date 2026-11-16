import { describe, expect, it } from "vitest";
import { computePercentage } from "@/lib/kpi-math";

describe("Hito 2 — Fórmulas puras de KPIs", () => {
  it("retorna 0 cuando el denominador es 0 o negativo (nunca NaN ni Infinity)", () => {
    expect(computePercentage(0, 0)).toBe(0);
    expect(computePercentage(5, 0)).toBe(0);
    expect(computePercentage(5, -2)).toBe(0);
    expect(computePercentage(Number.NaN, 10)).toBe(0);
  });

  it("redondea a 1 decimal en escala 0..100", () => {
    expect(computePercentage(2, 3)).toBe(66.7);
    expect(computePercentage(1, 2)).toBe(50);
    expect(computePercentage(3, 3)).toBe(100);
  });
});
