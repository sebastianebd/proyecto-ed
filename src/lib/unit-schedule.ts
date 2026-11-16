import { asc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { lessons, units } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { getPgErrorInfo } from "@/lib/http";
import {
  addCalendarDays,
  computeUnlockAtFromSunday,
  currentMondayStartUtc,
  currentWeekSundayInSantiago,
} from "@/lib/timezone";
import {
  biblePassageSchema,
  lessonTitleSchema,
  parentSummarySchema,
  reinforcementQuestionsSchema,
  sundayIsoDateSchema,
} from "@/lib/validators";

export class DomainHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Asigna los 14 domingos consecutivos (`startSunday + 7*i`) y su `unlock_at` lunes 00:01 Chile. */
export async function assignConsecutiveSundays(unitId: string, startSundayYmd: string, existingTx?: DbOrTx) {
  const run = async (tx: DbOrTx) => {
    const unitLessons = await tx
      .select()
      .from(lessons)
      .where(eq(lessons.unitId, unitId))
      .orderBy(asc(lessons.lessonNumber));

    if (unitLessons.length === 0) {
      throw new DomainHttpError(400, "Debes subir y procesar el PDF antes de asignar las fechas");
    }

    for (const l of unitLessons) {
      const sunday = addCalendarDays(startSundayYmd, (l.lessonNumber - 1) * 7);
      await tx
        .update(lessons)
        .set({ classSundayDate: sunday, unlockAt: computeUnlockAtFromSunday(sunday) })
        .where(eq(lessons.id, l.id));
    }

    return tx.select().from(lessons).where(eq(lessons.unitId, unitId)).orderBy(asc(lessons.lessonNumber));
  };

  return existingTx ? run(existingTx) : db.transaction(run);
}

/** Publica una unidad `DRAFT` -> `ACTIVE` validando PDF, 14 lecciones completas y unicidad ACTIVE. */
export async function activateUnit(unitId: string, actor: { id: string; role: string }, existingTx?: DbOrTx) {
  const run = async (tx: DbOrTx) => {
    const [unit] = await tx.select().from(units).where(eq(units.id, unitId)).limit(1).for("update");
    if (!unit) throw new DomainHttpError(404, "Unidad no encontrada");
    if (unit.status !== "DRAFT") throw new DomainHttpError(409, "Solo se pueden publicar unidades en borrador");
    if (!unit.pdfStorageKey) {
      throw new DomainHttpError(400, "Debes subir y validar el PDF de la unidad antes de activarla");
    }

    const activeRows = await tx.select({ id: units.id, status: units.status }).from(units).where(eq(units.classId, unit.classId));
    if (activeRows.some((r) => r.status === "ACTIVE" && r.id !== unitId)) {
      throw new DomainHttpError(409, "Esta clase ya tiene una unidad activa. Finalízala antes de activar otra.");
    }

    const unitLessons = await tx
      .select()
      .from(lessons)
      .where(eq(lessons.unitId, unitId))
      .orderBy(asc(lessons.lessonNumber));
    if (unitLessons.length !== 14) {
      throw new DomainHttpError(400, `La unidad debe tener exactamente 14 lecciones (tiene ${unitLessons.length})`);
    }

    for (const l of unitLessons) {
      if (
        !lessonTitleSchema.safeParse(l.title).success ||
        !biblePassageSchema.safeParse(l.biblePassage).success ||
        !parentSummarySchema.safeParse(l.parentSummary).success ||
        !reinforcementQuestionsSchema.safeParse(l.reinforcementQuestions).success ||
        !l.classSundayDate ||
        !sundayIsoDateSchema.safeParse(l.classSundayDate).success ||
        !l.unlockAt
      ) {
        throw new DomainHttpError(400, `La lección ${l.lessonNumber} está incompleta o tiene fechas inválidas`);
      }
    }

    // Evita envíos retroactivos: marca push_sent=true en lecciones cuyo lunes ya quedó atrás.
    const mondayStart = currentMondayStartUtc();
    for (const l of unitLessons) {
      if (l.unlockAt && l.unlockAt < mondayStart && !l.pushSent) {
        await tx.update(lessons).set({ pushSent: true }).where(eq(lessons.id, l.id));
      }
    }

    const [activated] = await tx.update(units).set({ status: "ACTIVE" }).where(eq(units.id, unitId)).returning();
    await recordAuditLog(
      {
        actorUserId: actor.id,
        actorRole: actor.role,
        action: "UNIT_ACTIVATE",
        entityType: "unit",
        entityId: unitId,
        details: { classId: unit.classId, title: unit.title },
      },
      tx,
    );
    return activated;
  };

  try {
    return existingTx ? await run(existingTx) : await db.transaction(run);
  } catch (err) {
    if (err instanceof DomainHttpError) throw err;
    if (getPgErrorInfo(err).code === "23505") {
      throw new DomainHttpError(409, "Esta clase ya tiene una unidad activa.");
    }
    throw err;
  }
}

/**
 * Desplaza calendario en +7 días (`postpone`) o -7 días (`unpostpone`) sobre lecciones `SCHEDULED`
 * con `lesson_number >= fromLessonNumber`, recalculando `unlock_at` en `America/Santiago` (DST safe).
 */
export async function shiftUnitSchedule(params: {
  unitId: string;
  direction: 1 | -1;
  fromLessonNumber?: number;
  actor: { id: string; role: string };
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const mondayStart = currentMondayStartUtc(now);
  const currentWeekSunday = currentWeekSundayInSantiago(now);

  return db.transaction(async (tx) => {
    const [unit] = await tx.select().from(units).where(eq(units.id, params.unitId)).limit(1).for("update");
    if (!unit) throw new DomainHttpError(404, "Unidad no encontrada");
    if (unit.status === "FINISHED") throw new DomainHttpError(409, "No se puede reprogramar una unidad finalizada");

    const allLessons = await tx
      .select()
      .from(lessons)
      .where(eq(lessons.unitId, params.unitId))
      .orderBy(asc(lessons.lessonNumber))
      .for("update");

    let targetFrom = params.fromLessonNumber;
    if (targetFrom === undefined) {
      const candidate = allLessons.find(
        (l) =>
          l.scheduleStatus === "SCHEDULED" &&
          l.classSundayDate !== null &&
          l.unlockAt !== null &&
          ((l.unlockAt >= mondayStart && !l.pushSent) || l.unlockAt >= now),
      );
      if (!candidate) {
        throw new DomainHttpError(409, "No hay lecciones programadas futuras pendientes para reprogramar");
      }
      targetFrom = candidate.lessonNumber;
    }

    const toShift = allLessons.filter(
      (l) => l.lessonNumber >= targetFrom! && l.scheduleStatus === "SCHEDULED" && l.classSundayDate !== null,
    );
    if (toShift.length === 0) {
      throw new DomainHttpError(409, "No hay lecciones programadas desde ese número");
    }

    const deltaDays = params.direction * 7;

    if (params.direction === -1) {
      const firstShifted = toShift[0];
      const newFirstSunday = addCalendarDays(firstShifted.classSundayDate!, -7);

      if (newFirstSunday < currentWeekSunday) {
        throw new DomainHttpError(409, "No se puede revertir una lección hacia una semana pasada cerrada");
      }

      if (firstShifted.lessonNumber > 1) {
        const prevLesson = allLessons.find((l) => l.lessonNumber === firstShifted.lessonNumber - 1);
        if (prevLesson?.classSundayDate && newFirstSunday <= prevLesson.classSundayDate) {
          throw new DomainHttpError(
            409,
            `No se puede revertir: la lección ${firstShifted.lessonNumber} chocaría con la lección ${prevLesson.lessonNumber}`,
          );
        }
      }
    }

    const updatedLessons = [];
    for (const l of toShift) {
      const nextSunday = addCalendarDays(l.classSundayDate!, deltaDays);
      const nextUnlockAt = computeUnlockAtFromSunday(nextSunday);
      const [u] = await tx
        .update(lessons)
        .set({ classSundayDate: nextSunday, unlockAt: nextUnlockAt })
        .where(eq(lessons.id, l.id))
        .returning();
      updatedLessons.push(u);
    }

    await recordAuditLog(
      {
        actorUserId: params.actor.id,
        actorRole: params.actor.role,
        action: params.direction === 1 ? "UNIT_POSTPONE" : "UNIT_UNPOSTPONE",
        entityType: "unit",
        entityId: params.unitId,
        details: { fromLessonNumber: targetFrom, shiftedCount: updatedLessons.length },
      },
      tx,
    );

    return { fromLessonNumber: targetFrom, shiftedCount: updatedLessons.length, updatedLessons };
  });
}
