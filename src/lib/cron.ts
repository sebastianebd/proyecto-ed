import { and, eq, gte, inArray, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  lessons,
  otpCodes,
  parentStudents,
  pushSubscriptions,
  rateLimits,
  sessions,
  students,
  units,
  users,
} from "@/db/schema";
import {
  isPushConfigured,
  PUSH_NEW_LESSON_PAYLOAD,
  sendWebPushNotification,
  type PushSenderFn,
  type PushSubscriptionTarget,
} from "@/lib/push";
import { currentMondayStartUtc, isMondayInSantiago } from "@/lib/timezone";

export type DailyCronResult = {
  keepAlive: boolean;
  cleaned: {
    otpCodes: number;
    rateLimits: number;
    sessions: number;
  };
  isMondayChile: boolean;
  mondayPush: {
    lessonsMarked: number;
    parentsTargeted: number;
    sent: number;
    removedGone: number;
    failed: number;
    skippedReason?: string;
  };
};

/**
 * Ejecución diaria unificada (docs/02 §4.4, docs/03 §6.4):
 * 1. Keep-alive SQL (`SELECT 1`).
 * 2. Limpieza de `otp_codes` vencidos, `rate_limits` vencidos y `sessions` vencidas o revocadas antiguas (>= 7d).
 * 3. Los lunes en `America/Santiago`: envía máximo 1 Push agrupado por padre con hijos activos y marca `push_sent = true`.
 */
export async function runDailyCron(options: { now?: Date; sendPush?: PushSenderFn } = {}): Promise<DailyCronResult> {
  const now = options.now ?? new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

  await db.execute(sql`SELECT 1`);

  const [deletedOtps, deletedLimits, deletedSessions] = await Promise.all([
    db.delete(otpCodes).where(lt(otpCodes.expiresAt, now)).returning({ id: otpCodes.id }),
    db.delete(rateLimits).where(lt(rateLimits.resetAt, now)).returning({ key: rateLimits.key }),
    db
      .delete(sessions)
      .where(or(lt(sessions.expiresAt, now), lt(sessions.revokedAt, sevenDaysAgo)))
      .returning({ id: sessions.id }),
  ]);

  const isMondayChile = isMondayInSantiago(now);
  const mondayPush: DailyCronResult["mondayPush"] = {
    lessonsMarked: 0,
    parentsTargeted: 0,
    sent: 0,
    removedGone: 0,
    failed: 0,
  };

  if (!isMondayChile) {
    return {
      keepAlive: true,
      cleaned: {
        otpCodes: deletedOtps.length,
        rateLimits: deletedLimits.length,
        sessions: deletedSessions.length,
      },
      isMondayChile: false,
      mondayPush,
    };
  }

  if (!options.sendPush && !isPushConfigured()) {
    mondayPush.skippedReason = "vapid_not_configured";
    return {
      keepAlive: true,
      cleaned: {
        otpCodes: deletedOtps.length,
        rateLimits: deletedLimits.length,
        sessions: deletedSessions.length,
      },
      isMondayChile: true,
      mondayPush,
    };
  }

  const mondayStartUtc = currentMondayStartUtc(now);
  const sender = options.sendPush ?? sendWebPushNotification;

  const eligibleLessons = await db
    .select({
      lessonId: lessons.id,
      classId: units.classId,
    })
    .from(lessons)
    .innerJoin(units, eq(lessons.unitId, units.id))
    .where(
      and(
        eq(units.status, "ACTIVE"),
        eq(lessons.pushSent, false),
        notInArray(lessons.scheduleStatus, ["PAUSED", "FORCE_LOCKED"]),
        gte(lessons.unlockAt, mondayStartUtc),
        lte(lessons.unlockAt, now),
      ),
    );

  if (eligibleLessons.length === 0) {
    return {
      keepAlive: true,
      cleaned: {
        otpCodes: deletedOtps.length,
        rateLimits: deletedLimits.length,
        sessions: deletedSessions.length,
      },
      isMondayChile: true,
      mondayPush,
    };
  }

  const eligibleClassIds = Array.from(new Set(eligibleLessons.map((l) => l.classId)));
  const eligibleLessonIds = eligibleLessons.map((l) => l.lessonId);

  const targetRows = await db
    .select({
      subId: pushSubscriptions.id,
      userId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(students)
    .innerJoin(parentStudents, eq(parentStudents.studentId, students.id))
    .innerJoin(users, eq(parentStudents.parentId, users.id))
    .innerJoin(pushSubscriptions, eq(pushSubscriptions.userId, users.id))
    .where(
      and(
        inArray(students.classId, eligibleClassIds),
        eq(students.status, "ACTIVE"),
        eq(users.role, "PARENT"),
        eq(users.status, "ACTIVE"),
      ),
    );

  // Agrupación por padre y dedupe por suscripción: máximo 1 notificación agrupada aunque tenga múltiples hijos/clases.
  const uniqueParents = new Set<string>();
  const uniqueSubs = new Map<string, PushSubscriptionTarget>();
  for (const row of targetRows) {
    uniqueParents.add(row.userId);
    if (!uniqueSubs.has(row.subId)) {
      uniqueSubs.set(row.subId, {
        id: row.subId,
        userId: row.userId,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
      });
    }
  }

  mondayPush.parentsTargeted = uniqueParents.size;

  const goneSubIds: string[] = [];
  for (const sub of uniqueSubs.values()) {
    const outcome = await sender(sub, PUSH_NEW_LESSON_PAYLOAD);
    if (outcome === "sent") mondayPush.sent += 1;
    else if (outcome === "gone") {
      mondayPush.removedGone += 1;
      goneSubIds.push(sub.id);
    } else {
      mondayPush.failed += 1;
    }
  }

  if (goneSubIds.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, goneSubIds));
  }

  await db.update(lessons).set({ pushSent: true }).where(inArray(lessons.id, eligibleLessonIds));
  mondayPush.lessonsMarked = eligibleLessonIds.length;

  return {
    keepAlive: true,
    cleaned: {
      otpCodes: deletedOtps.length,
      rateLimits: deletedLimits.length,
      sessions: deletedSessions.length,
    },
    isMondayChile: true,
    mondayPush,
  };
}
