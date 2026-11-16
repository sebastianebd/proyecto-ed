export type KpiSummary = {
  attendancePct: number;
  attendancePresent: number;
  attendanceTotal: number;
  openingPct: number;
  openingViewed: number;
  openingExpected: number;
  completionPct: number;
  completionDone: number;
  completionExpected: number;
};

/** Calcula porcentaje 0..100 redondeado a 1 decimal; nunca devuelve NaN ni Infinity. */
export function computePercentage(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.round((Math.max(0, numerator) / denominator) * 1000) / 10;
}
