import { sql } from "drizzle-orm";
import { db } from "@/db";
import { computePercentage, type KpiSummary } from "@/lib/kpi-math";

export { computePercentage, type KpiSummary };

/**
 * KPIs explícitos (docs/02-diseno-y-arquitectura.md §4.5):
 * - Asistencia: presentes / evaluados en domingos registrados (si classId se omite, global).
 * - Apertura (Visto): pares (lección desbloqueada de unidad ACTIVE, padre ACTIVE con hijo ACTIVE en esa clase).
 * - Refuerzo en Casa (Completado): pares (lección desbloqueada de unidad ACTIVE, alumno ACTIVE con >=1 padre ACTIVE).
 */
export async function calculateKpis(options: { classId?: string; classIds?: string[] } = {}): Promise<KpiSummary> {
  if (options.classIds && options.classIds.length === 0) {
    return {
      attendancePct: 0,
      attendancePresent: 0,
      attendanceTotal: 0,
      openingPct: 0,
      openingViewed: 0,
      openingExpected: 0,
      completionPct: 0,
      completionDone: 0,
      completionExpected: 0,
    };
  }

  const classFilterAttendance = options.classId
    ? sql`AND ar.class_id = ${options.classId}::uuid`
    : options.classIds
      ? sql`AND ar.class_id IN (${sql.join(
          options.classIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`
      : sql``;

  const classFilterUnits = options.classId
    ? sql`AND u.class_id = ${options.classId}::uuid`
    : options.classIds
      ? sql`AND u.class_id IN (${sql.join(
          options.classIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`
      : sql``;

  const [attRow] = await db.execute<{ present: number; total: number }>(sql`
    SELECT
      COALESCE(SUM(CASE WHEN ar.is_present THEN 1 ELSE 0 END), 0)::int AS present,
      COUNT(*)::int AS total
    FROM attendance_records ar
    WHERE 1=1 ${classFilterAttendance}
  `);

  const [openRow] = await db.execute<{ viewed: number; expected: number }>(sql`
    WITH unlocked AS (
      SELECT l.id AS lesson_id, u.class_id
      FROM lessons l
      JOIN units u ON u.id = l.unit_id
      WHERE u.status = 'ACTIVE' ${classFilterUnits}
        AND (
          l.schedule_status = 'FORCE_UNLOCKED'
          OR (l.schedule_status = 'SCHEDULED' AND l.unlock_at IS NOT NULL AND l.unlock_at <= now())
        )
    ),
    active_parents_per_class AS (
      SELECT DISTINCT s.class_id, ps.parent_id
      FROM parent_students ps
      JOIN students s ON s.id = ps.student_id
      JOIN users p ON p.id = ps.parent_id
      WHERE s.status = 'ACTIVE' AND p.status = 'ACTIVE' AND p.role = 'PARENT'
    ),
    pairs AS (
      SELECT ul.lesson_id, ap.parent_id
      FROM unlocked ul
      JOIN active_parents_per_class ap ON ap.class_id = ul.class_id
    )
    SELECT
      COUNT(lv.id)::int AS viewed,
      COUNT(*)::int AS expected
    FROM pairs
    LEFT JOIN lesson_views lv ON lv.lesson_id = pairs.lesson_id AND lv.parent_id = pairs.parent_id
  `);

  const [compRow] = await db.execute<{ done: number; expected: number }>(sql`
    WITH unlocked AS (
      SELECT l.id AS lesson_id, u.class_id
      FROM lessons l
      JOIN units u ON u.id = l.unit_id
      WHERE u.status = 'ACTIVE' ${classFilterUnits}
        AND (
          l.schedule_status = 'FORCE_UNLOCKED'
          OR (l.schedule_status = 'SCHEDULED' AND l.unlock_at IS NOT NULL AND l.unlock_at <= now())
        )
    ),
    eligible_students AS (
      SELECT DISTINCT s.id AS student_id, s.class_id
      FROM students s
      JOIN parent_students ps ON ps.student_id = s.id
      JOIN users p ON p.id = ps.parent_id
      WHERE s.status = 'ACTIVE' AND p.status = 'ACTIVE' AND p.role = 'PARENT'
    ),
    pairs AS (
      SELECT ul.lesson_id, es.student_id
      FROM unlocked ul
      JOIN eligible_students es ON es.class_id = ul.class_id
    )
    SELECT
      COUNT(lc.id)::int AS done,
      COUNT(*)::int AS expected
    FROM pairs
    LEFT JOIN lesson_completions lc ON lc.lesson_id = pairs.lesson_id AND lc.student_id = pairs.student_id
  `);

  const attendancePresent = Number(attRow?.present ?? 0);
  const attendanceTotal = Number(attRow?.total ?? 0);
  const openingViewed = Number(openRow?.viewed ?? 0);
  const openingExpected = Number(openRow?.expected ?? 0);
  const completionDone = Number(compRow?.done ?? 0);
  const completionExpected = Number(compRow?.expected ?? 0);

  return {
    attendancePct: computePercentage(attendancePresent, attendanceTotal),
    attendancePresent,
    attendanceTotal,
    openingPct: computePercentage(openingViewed, openingExpected),
    openingViewed,
    openingExpected,
    completionPct: computePercentage(completionDone, completionExpected),
    completionDone,
    completionExpected,
  };
}
