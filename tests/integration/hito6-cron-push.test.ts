import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as logoutHandler } from "@/app/api/auth/logout/route";
import { GET as cronDailyHandler } from "@/app/api/cron/daily/route";
import { DELETE as deletePushHandler, POST as postPushHandler } from "@/app/api/push/subscribe/route";
import { db } from "@/db";
import {
  classes,
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
import { generateSessionToken, hashToken, sessionCookieName } from "@/lib/auth";
import { runDailyCron } from "@/lib/cron";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const dbUrl = process.env.DATABASE_URL ?? "";
let sql: ReturnType<typeof postgres>;

function req(
  path: string,
  init: { method?: string; body?: unknown; cookie?: string; authHeader?: string; omitOrigin?: boolean } = {},
) {
  const headers = new Headers();
  if (!init.omitOrigin) headers.set("origin", APP_URL);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.authHeader) headers.set("authorization", init.authHeader);
  return new NextRequest(`${APP_URL}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

async function createUserWithSession(opts: {
  rut: string;
  fullName: string;
  email: string;
  role: "SUPER_ADMIN" | "TEACHER" | "PARENT";
  status?: "ACTIVE" | "INACTIVE" | "PENDING_ONBOARDING";
  expiresOffsetMs?: number;
  revokedAt?: Date | null;
}) {
  const effectiveStatus = opts.status ?? "ACTIVE";
  const [user] = await db
    .insert(users)
    .values({
      rut: opts.rut,
      fullName: opts.fullName,
      email: opts.email,
      role: opts.role,
      status: effectiveStatus,
      onboardedAt: effectiveStatus === "ACTIVE" ? new Date() : null,
    })
    .returning();
  const rawToken = generateSessionToken();
  const [session] = await db
    .insert(sessions)
    .values({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + (opts.expiresOffsetMs ?? 86_400_000)),
      revokedAt: opts.revokedAt ?? null,
    })
    .returning();
  return { user, session, cookie: `${sessionCookieName()}=${rawToken}` };
}

beforeAll(() => {
  if (!/\/ed_test(\?|$)/.test(dbUrl)) throw new Error("DATABASE_URL debe apuntar a ed_test");
  sql = postgres(dbUrl, { prepare: false, max: 1 });
});

beforeEach(async () => {
  await sql`TRUNCATE users, classes, rate_limits, audit_logs CASCADE`;
});

afterAll(async () => {
  await sql?.end();
});

describe("Hito 6 — Cron Diario y Web Push Agrupado", () => {
  it("protege /api/cron/daily con CRON_SECRET, limpia expirados conservando sesiones activas y omite Push fuera de lunes", async () => {
    const prevSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "cron-secret-hito6-test";

    try {
      // Sin header -> 401
      expect(
        (await cronDailyHandler(req("/api/cron/daily", { omitOrigin: true }))).status,
      ).toBe(401);

      // Header inválido -> 401
      expect(
        (
          await cronDailyHandler(
            req("/api/cron/daily", { omitOrigin: true, authHeader: "Bearer wrong-secret" }),
          )
        ).status,
      ).toBe(401);

      const tuesdayUtc = new Date("2026-11-17T17:00:00Z"); // Martes 14:00 CLST (UTC-3)
      const minMs = Math.min(Date.now(), tuesdayUtc.getTime());
      const maxMs = Math.max(Date.now(), tuesdayUtc.getTime());

      const { user: u, session: activeSession } = await createUserWithSession({
        rut: "11111111-1",
        fullName: "Usuario Activo",
        email: "act@test.cl",
        role: "PARENT",
        expiresOffsetMs: maxMs - Date.now() + 86_400_000,
      });

      const [expiredSession] = await db
        .insert(sessions)
        .values({
          userId: u.id,
          tokenHash: hashToken("expired-tok"),
          expiresAt: new Date(minMs - 60_000),
        })
        .returning();

      const [oldRevokedSession] = await db
        .insert(sessions)
        .values({
          userId: u.id,
          tokenHash: hashToken("revoked-old-tok"),
          expiresAt: new Date(maxMs + 86_400_000),
          revokedAt: new Date(minMs - 8 * 86_400_000),
        })
        .returning();

      await db.insert(otpCodes).values([
        { userId: u.id, codeHash: "h1", expiresAt: new Date(minMs - 60_000) },
        { userId: u.id, codeHash: "h2", expiresAt: new Date(maxMs + 600_000) },
      ]);
      await db.insert(rateLimits).values([
        { key: "rl:old", count: 3, resetAt: new Date(minMs - 60_000) },
        { key: "rl:live", count: 1, resetAt: new Date(maxMs + 600_000) },
      ]);

      let pushCalls = 0;
      const tuesdayResult = await runDailyCron({
        now: tuesdayUtc,
        sendPush: async () => {
          pushCalls += 1;
          return "sent";
        },
      });

      expect(tuesdayResult.keepAlive).toBe(true);
      expect(tuesdayResult.isMondayChile).toBe(false);
      expect(tuesdayResult.cleaned).toEqual({ otpCodes: 1, rateLimits: 1, sessions: 2 });
      expect(pushCalls).toBe(0);

      // Sesión activa vigente, OTP vigente y rate_limit vigente permanecen intactos
      const remainingSessions = await db.select().from(sessions);
      expect(remainingSessions.map((s) => s.id)).toEqual([activeSession.id]);
      expect(remainingSessions.find((s) => s.id === expiredSession.id)).toBeUndefined();
      expect(remainingSessions.find((s) => s.id === oldRevokedSession.id)).toBeUndefined();
      expect(await db.select().from(otpCodes)).toHaveLength(1);
      expect(await db.select().from(rateLimits)).toHaveLength(1);

      // Endpoint HTTP real con CRON_SECRET válido y sin Origin responde 200
      const httpRes = await cronDailyHandler(
        req("/api/cron/daily", { omitOrigin: true, authHeader: "Bearer cron-secret-hito6-test" }),
      );
      expect(httpRes.status).toBe(200);
    } finally {
      if (prevSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prevSecret;
    }
  });

  it("los lunes envía máx. 1 notificación agrupada por padre, respeta PAUSED/DRAFT/otras clases y elimina suscripciones 410 Gone", async () => {
    // Lunes 2026-05-11 12:30 Chile (CLT UTC-4) = 2026-05-11T16:30:00Z
    const mondayNoonUtc = new Date("2026-05-11T16:30:00Z");
    const monday0001Utc = new Date("2026-05-11T04:01:00Z");

    const { user: parentMulti } = await createUserWithSession({
      rut: "22222222-2",
      fullName: "Padre Dos Clases",
      email: "pm@test.cl",
      role: "PARENT",
    });
    const { user: parentGone } = await createUserWithSession({
      rut: "33333333-3",
      fullName: "Padre Suscripción Muerta",
      email: "pg@test.cl",
      role: "PARENT",
    });
    const { user: parentOther } = await createUserWithSession({
      rut: "44444444-4",
      fullName: "Padre Otra Clase",
      email: "po@test.cl",
      role: "PARENT",
    });
    const { user: parentNoSub } = await createUserWithSession({
      rut: "55555555-5",
      fullName: "Padre Sin Push",
      email: "pns@test.cl",
      role: "PARENT",
    });
    const { user: parentInactive } = await createUserWithSession({
      rut: "88888888-8",
      fullName: "Padre Inactivo",
      email: "pinac@test.cl",
      role: "PARENT",
      status: "INACTIVE",
    });
    const { user: parentOfInactiveChild } = await createUserWithSession({
      rut: "99999999-9",
      fullName: "Padre Hijo Inactivo",
      email: "phijo@test.cl",
      role: "PARENT",
    });

    const [class1, class2, class3Paused, class4Draft, class5Finished] = await db
      .insert(classes)
      .values([
        { name: "Clase 1" },
        { name: "Clase 2" },
        { name: "Clase 3 Pausada" },
        { name: "Clase 4 Borrador" },
        { name: "Clase 5 Finalizada" },
      ])
      .returning();

    const [child1, child2, child3, child4, child5, childInactive] = await db
      .insert(students)
      .values([
        { classId: class1.id, fullName: "Hijo C1" },
        { classId: class2.id, fullName: "Hijo C2" },
        { classId: class3Paused.id, fullName: "Hijo C3" },
        { classId: class4Draft.id, fullName: "Hijo C4" },
        { classId: class5Finished.id, fullName: "Hijo C5" },
        { classId: class1.id, fullName: "Hijo Inactivo", status: "INACTIVE" },
      ])
      .returning();

    await db.insert(parentStudents).values([
      { parentId: parentMulti.id, studentId: child1.id },
      { parentId: parentMulti.id, studentId: child2.id },
      { parentId: parentGone.id, studentId: child1.id },
      { parentId: parentNoSub.id, studentId: child1.id },
      { parentId: parentInactive.id, studentId: child1.id },
      { parentId: parentOfInactiveChild.id, studentId: childInactive.id },
      { parentId: parentOther.id, studentId: child3.id },
      { parentId: parentOther.id, studentId: child4.id },
      { parentId: parentOther.id, studentId: child5.id },
    ]);

    const [subMulti] = await db
      .insert(pushSubscriptions)
      .values([
        {
          userId: parentMulti.id,
          endpoint: "https://fcm.googleapis.com/fcm/send/multi-sub",
          p256dh: "B".repeat(64),
          auth: "A".repeat(22),
          platform: "android",
        },
        {
          userId: parentGone.id,
          endpoint: "https://fcm.googleapis.com/fcm/send/gone-sub",
          p256dh: "C".repeat(64),
          auth: "D".repeat(22),
          platform: "android",
        },
        {
          userId: parentInactive.id,
          endpoint: "https://fcm.googleapis.com/fcm/send/inactive-parent-sub",
          p256dh: "G".repeat(64),
          auth: "H".repeat(22),
          platform: "android",
        },
        {
          userId: parentOfInactiveChild.id,
          endpoint: "https://fcm.googleapis.com/fcm/send/inactive-child-sub",
          p256dh: "J".repeat(64),
          auth: "K".repeat(22),
          platform: "android",
        },
        {
          userId: parentOther.id,
          endpoint: "https://web.push.apple.com/other-sub",
          p256dh: "E".repeat(64),
          auth: "F".repeat(22),
          platform: "ios",
        },
      ])
      .returning();

    const [u1, u2, u3, u4, u5] = await db
      .insert(units)
      .values([
        { classId: class1.id, orderNumber: 1, title: "U1", status: "ACTIVE", pdfStorageKey: "k1.pdf" },
        { classId: class2.id, orderNumber: 1, title: "U2", status: "ACTIVE", pdfStorageKey: "k2.pdf" },
        { classId: class3Paused.id, orderNumber: 1, title: "U3", status: "ACTIVE", pdfStorageKey: "k3.pdf" },
        { classId: class4Draft.id, orderNumber: 1, title: "U4", status: "DRAFT", pdfStorageKey: "k4.pdf" },
        { classId: class5Finished.id, orderNumber: 1, title: "U5", status: "FINISHED", pdfStorageKey: "k5.pdf" },
      ])
      .returning();

    const [l1, l2] = await db
      .insert(lessons)
      .values([
        { unitId: u1.id, lessonNumber: 1, title: "L1", scheduleStatus: "SCHEDULED", unlockAt: monday0001Utc },
        { unitId: u2.id, lessonNumber: 1, title: "L2", scheduleStatus: "SCHEDULED", unlockAt: monday0001Utc },
        // Pausada / bloqueada / draft / finalizada no deben disparar push
        { unitId: u3.id, lessonNumber: 1, title: "L3 Paused", scheduleStatus: "PAUSED", unlockAt: monday0001Utc },
        { unitId: u3.id, lessonNumber: 2, title: "L3 Locked", scheduleStatus: "FORCE_LOCKED", unlockAt: monday0001Utc },
        { unitId: u4.id, lessonNumber: 1, title: "L4 Draft", scheduleStatus: "SCHEDULED", unlockAt: monday0001Utc },
        { unitId: u5.id, lessonNumber: 1, title: "L5 Fin", scheduleStatus: "SCHEDULED", unlockAt: monday0001Utc },
      ])
      .returning();

    const deliveries: { userId: string; body: string }[] = [];
    const result = await runDailyCron({
      now: mondayNoonUtc,
      sendPush: async (sub, payload) => {
        deliveries.push({ userId: sub.userId, body: payload.body });
        if (sub.endpoint.includes("gone-sub")) return "gone";
        return "sent";
      },
    });

    expect(result.isMondayChile).toBe(true);
    expect(result.mondayPush).toMatchObject({
      lessonsMarked: 2,
      parentsTargeted: 2,
      sent: 1,
      removedGone: 1,
      failed: 0,
    });

    // Padre con 2 hijos en 2 clases recibió EXACTAMENTE 1 notificación agrupada neutra (sin nombres de niños)
    // Padres/hijos INACTIVE y de otras clases no reciben Push
    expect(deliveries.filter((d) => d.userId === parentMulti.id)).toHaveLength(1);
    expect(deliveries.find((d) => d.userId === parentOther.id)).toBeUndefined();
    expect(deliveries.find((d) => d.userId === parentInactive.id)).toBeUndefined();
    expect(deliveries.find((d) => d.userId === parentOfInactiveChild.id)).toBeUndefined();
    expect(deliveries[0].body).toBe("Escuela Dominical: Nueva lección disponible para repasar en casa");

    // Suscripción 410 Gone eliminada; suscripción válida intacta
    const subsAfter = await db.select().from(pushSubscriptions);
    expect(subsAfter.map((s) => s.id)).toContain(subMulti.id);
    expect(subsAfter.find((s) => s.userId === parentGone.id)).toBeUndefined();

    // Lecciones marcadas push_sent = true
    const updatedL1 = await db.select().from(lessons).where(eq(lessons.id, l1.id)).limit(1);
    const updatedL2 = await db.select().from(lessons).where(eq(lessons.id, l2.id)).limit(1);
    expect(updatedL1[0].pushSent).toBe(true);
    expect(updatedL2[0].pushSent).toBe(true);
  });

  it("valida SSRF en POST /api/push/subscribe, desvincula en logout/DELETE y reasigna endpoint por UPSERT al cambiar usuario", async () => {
    const { user: userA, cookie: cookieA } = await createUserWithSession({
      rut: "66666666-6",
      fullName: "Usuario A",
      email: "ua@test.cl",
      role: "PARENT",
    });
    const { user: userB, cookie: cookieB } = await createUserWithSession({
      rut: "77777777-7",
      fullName: "Usuario B",
      email: "ub@test.cl",
      role: "PARENT",
    });

    // Anti-SSRF bloquea URL interna / maliciosa
    const ssrfRes = await postPushHandler(
      req("/api/push/subscribe", {
        method: "POST",
        cookie: cookieA,
        body: {
          endpoint: "https://127.0.0.1/steal",
          keys: { p256dh: "B".repeat(40), auth: "A".repeat(16) },
          platform: "android",
        },
      }),
    );
    expect(ssrfRes.status).toBe(400);

    const sharedEndpoint = "https://fcm.googleapis.com/fcm/send/shared-device-token-123";
    const subPayload = {
      endpoint: sharedEndpoint,
      keys: { p256dh: "B".repeat(40), auth: "A".repeat(16) },
      platform: "android",
    };

    // Usuario A suscribe navegador
    const resA = await postPushHandler(
      req("/api/push/subscribe", { method: "POST", cookie: cookieA, body: subPayload }),
    );
    expect(resA.status).toBe(200);

    // Usuario B inicia sesión en el mismo navegador y suscribe el mismo endpoint sin logout previo -> UPSERT reasigna userId
    const resB = await postPushHandler(
      req("/api/push/subscribe", { method: "POST", cookie: cookieB, body: subPayload }),
    );
    expect(resB.status).toBe(200);

    const rowsAfterUpsert = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sharedEndpoint));
    expect(rowsAfterUpsert).toHaveLength(1);
    expect(rowsAfterUpsert[0].userId).toBe(userB.id);

    // Usuario B elimina suscripción vía DELETE /api/push/subscribe
    const delB = await deletePushHandler(
      req("/api/push/subscribe", {
        method: "DELETE",
        cookie: cookieB,
        body: { endpoint: sharedEndpoint },
      }),
    );
    expect(delB.status).toBe(200);
    expect(await db.select().from(pushSubscriptions)).toHaveLength(0);

    // Usuario A vuelve a suscribir y cierra sesión enviando pushEndpoint en /api/auth/logout -> desvincula Push y revoca sesión
    await postPushHandler(
      req("/api/push/subscribe", { method: "POST", cookie: cookieA, body: subPayload }),
    );
    expect((await db.select().from(pushSubscriptions)).filter((s) => s.userId === userA.id)).toHaveLength(1);

    const logoutRes = await logoutHandler(
      req("/api/auth/logout", {
        method: "POST",
        cookie: cookieA,
        body: { pushEndpoint: sharedEndpoint },
      }),
    );
    expect(logoutRes.status).toBe(200);
    expect(await db.select().from(pushSubscriptions)).toHaveLength(0);

    // Petición sin header Origin a POST /api/push/subscribe -> 403 Forbidden
    const noOriginRes = await postPushHandler(
      req("/api/push/subscribe", { method: "POST", cookie: cookieB, body: subPayload, omitOrigin: true }),
    );
    expect(noOriginRes.status).toBe(403);

    // Usuario en PENDING_ONBOARDING sí puede registrar Push durante el onboarding
    const { cookie: onboardingCookie } = await createUserWithSession({
      rut: "10101010-5",
      fullName: "Padre En Onboarding",
      email: "onb-push@test.cl",
      role: "PARENT",
      status: "PENDING_ONBOARDING",
    });
    const onboardingSubRes = await postPushHandler(
      req("/api/push/subscribe", {
        method: "POST",
        cookie: onboardingCookie,
        body: {
          ...subPayload,
          endpoint: "https://fcm.googleapis.com/fcm/send/onboarding-sub-token",
        },
      }),
    );
    expect(onboardingSubRes.status).toBe(200);
  });
});
