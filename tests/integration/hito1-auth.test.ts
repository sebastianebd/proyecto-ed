import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as meHandler } from "@/app/api/auth/me/route";
import { POST as logoutHandler } from "@/app/api/auth/logout/route";
import { POST as onboardingHandler } from "@/app/api/auth/onboarding/route";
import { POST as requestOtpHandler } from "@/app/api/auth/request-otp/route";
import { POST as verifyOtpHandler } from "@/app/api/auth/verify-otp/route";
import { POST as pingHandler } from "@/app/api/presence/ping/route";
import { db } from "@/db";
import { classes, classTeachers, parentStudents, pushSubscriptions, students, users } from "@/db/schema";
import { invalidatePendingOtps, requireAuth, revokeAllSessions, sessionCookieName } from "@/lib/auth";
import * as emailModule from "@/lib/email";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const dbUrl = process.env.DATABASE_URL ?? "";
let sql: ReturnType<typeof postgres>;
let sendSpy: ReturnType<typeof vi.spyOn>;
let sentCodes: string[] = [];

function apiReq(path: string, init: { method?: string; body?: unknown; cookie?: string; origin?: string | null; ip?: string } = {}) {
  const headers = new Headers();
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (init.origin === undefined) headers.set("origin", APP_URL);
  else if (init.origin !== null) headers.set("origin", init.origin);
  if (init.cookie) headers.set("cookie", init.cookie);
  headers.set("x-forwarded-for", init.ip ?? "198.51.100.10");

  return new NextRequest(`${APP_URL}${path}`, {
    method: init.method ?? "POST",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

function extractSessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = new RegExp(`(${sessionCookieName()}=[^;]+)`).exec(setCookie);
  if (!match) throw new Error(`Falta cookie de sesión en: ${setCookie}`);
  return match[1];
}

async function createUser(data: { rut: string; email: string; role?: "PARENT" | "TEACHER" | "SUPER_ADMIN"; status?: "PENDING_ONBOARDING" | "ACTIVE" | "INACTIVE" }) {
  const [u] = await db
    .insert(users)
    .values({
      rut: data.rut,
      fullName: "Usuario Prueba",
      email: data.email,
      role: data.role ?? "PARENT",
      status: data.status ?? "ACTIVE",
      onboardedAt: (data.status ?? "ACTIVE") === "ACTIVE" ? new Date() : null,
    })
    .returning();
  return u;
}

async function issueOtpAndGetCode(rut: string, ip = "198.51.100.10"): Promise<string> {
  const prevLen = sentCodes.length;
  const res = await requestOtpHandler(apiReq("/api/auth/request-otp", { body: { rut }, ip }));
  expect(res.status).toBe(200);
  await vi.waitFor(() => expect(sentCodes.length).toBeGreaterThan(prevLen));
  return sentCodes[sentCodes.length - 1];
}

beforeAll(async () => {
  if (!/\/ed_test(\?|$)/.test(dbUrl)) {
    throw new Error("DATABASE_URL debe apuntar a ed_test");
  }
  sql = postgres(dbUrl, { prepare: false, max: 1 });
  sendSpy = vi.spyOn(emailModule, "sendOtpEmail").mockImplementation(async ({ code }) => {
    sentCodes.push(code);
  });
});

beforeEach(async () => {
  sentCodes = [];
  sendSpy.mockClear();
  await sql`TRUNCATE users, classes, rate_limits, audit_logs CASCADE`;
});

afterAll(async () => {
  sendSpy?.mockRestore();
  await sql?.end();
});

describe("Hito 1 — Anti-enumeración, cooldown y rate limits", () => {
  it("responde 200 idéntico para RUT inexistente, INACTIVE y ACTIVE; respeta cooldown 60s y 5/15m", async () => {
    await createUser({ rut: "12345670-K", email: "activo@example.com", status: "ACTIVE" });
    await createUser({ rut: "987654-5", email: "inactivo@example.com", status: "INACTIVE" });

    const rMissing = await requestOtpHandler(apiReq("/api/auth/request-otp", { body: { rut: "18963546-K" } }));
    const rInactive = await requestOtpHandler(apiReq("/api/auth/request-otp", { body: { rut: "987654-5" } }));
    const rActive = await requestOtpHandler(apiReq("/api/auth/request-otp", { body: { rut: "12345670-K" } }));

    expect(rMissing.status).toBe(200);
    expect(rInactive.status).toBe(200);
    expect(rActive.status).toBe(200);
    expect(await rMissing.json()).toEqual(await rInactive.json());
    await vi.waitFor(() => expect(sendSpy).toHaveBeenCalledTimes(1));

    // Reintento inmediato dentro de 60s: responde 200 igual pero NO envía segundo correo.
    const rCooldown = await requestOtpHandler(apiReq("/api/auth/request-otp", { body: { rut: "12345670-K" } }));
    expect(rCooldown.status).toBe(200);
    await new Promise((r) => setTimeout(r, 30));
    expect(sendSpy).toHaveBeenCalledTimes(1);

    // Expirando el cooldown 4 veces más llega a 5/15m; la 6ta solicitud queda bloqueada.
    for (let i = 2; i <= 5; i++) {
      await sql`DELETE FROM rate_limits WHERE key LIKE 'otp:cd:%'`;
      await requestOtpHandler(apiReq("/api/auth/request-otp", { body: { rut: "12345670-K" }, ip: `10.0.0.${i}` }));
    }
    await vi.waitFor(() => expect(sendSpy).toHaveBeenCalledTimes(5));

    await sql`DELETE FROM rate_limits WHERE key LIKE 'otp:cd:%'`;
    await requestOtpHandler(apiReq("/api/auth/request-otp", { body: { rut: "12345670-K" }, ip: "10.0.0.99" }));
    await new Promise((r) => setTimeout(r, 30));
    expect(sendSpy).toHaveBeenCalledTimes(5);
  });

  it("bloquea la 16va solicitud por IP en <15m y la 11va verificación fallida por IP", async () => {
    const active = await createUser({ rut: "12345670-K", email: "activo@example.com", status: "ACTIVE" });
    const ip = "203.0.113.50";

    // 15 solicitudes desde la misma IP con RUTs distintos (para no chocar con cooldown por RUT)
    for (let i = 0; i < 15; i++) {
      const r = await requestOtpHandler(apiReq("/api/auth/request-otp", { body: { rut: "18963546-K" }, ip }));
      expect(r.status).toBe(200);
    }
    // Ahora el usuario real con esa misma IP queda bloqueado en la 16va por límite de IP
    await requestOtpHandler(apiReq("/api/auth/request-otp", { body: { rut: active.rut }, ip }));
    await new Promise((r) => setTimeout(r, 30));
    expect(sendSpy).toHaveBeenCalledTimes(0);

    // Verificaciones fallidas por IP (10 permitidas con 401, 11va responde 429)
    for (let i = 0; i < 10; i++) {
      const r = await verifyOtpHandler(apiReq("/api/auth/verify-otp", { body: { rut: active.rut, code: "000000" }, ip }));
      expect(r.status).toBe(401);
    }
    const r11 = await verifyOtpHandler(apiReq("/api/auth/verify-otp", { body: { rut: active.rut, code: "000000" }, ip }));
    expect(r11.status).toBe(429);
  });

  it("rechaza RUT con formato o Mod 11 inválido con 400 antes de consultar BD", async () => {
    const res = await requestOtpHandler(apiReq("/api/auth/request-otp", { body: { rut: "11.111.111-1" } }));
    expect(res.status).toBe(400);
  });
});

describe("Hito 1 — Atomicidad OTP, fuerza bruta y race condition", () => {
  it("bloquea OTP tras 5 intentos fallidos (marca used_at) incluso si luego envían el código correcto", async () => {
    await createUser({ rut: "12345670-K", email: "u@example.com", status: "ACTIVE" });
    const realCode = await issueOtpAndGetCode("12345670-K");
    const wrongCode = realCode === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i++) {
      const r = await verifyOtpHandler(apiReq("/api/auth/verify-otp", { body: { rut: "12345670-K", code: wrongCode } }));
      expect(r.status).toBe(401);
    }

    const [otpRow] = await sql`SELECT attempts, used_at FROM otp_codes ORDER BY created_at DESC LIMIT 1`;
    expect(otpRow.attempts).toBe(5);
    expect(otpRow.used_at).not.toBeNull();

    const [{ failsBefore }] = await sql`SELECT count(*)::int AS fails_before FROM audit_logs WHERE action = 'OTP_FAILED'`.then(
      (r) => [{ failsBefore: r[0].fails_before as number }],
    );
    const sixth = await verifyOtpHandler(apiReq("/api/auth/verify-otp", { body: { rut: "12345670-K", code: realCode } }));
    expect(sixth.status).toBe(401);

    const [{ failsAfter }] = await sql`SELECT count(*)::int AS fails_after FROM audit_logs WHERE action = 'OTP_FAILED'`.then(
      (r) => [{ failsAfter: r[0].fails_after as number }],
    );
    expect(failsAfter).toBe(failsBefore);
  });

  it("ante race condition con Promise.all solo 1 verify-otp triunfa y crea 1 sesión", async () => {
    await createUser({ rut: "12345670-K", email: "race@example.com", status: "ACTIVE" });
    const code = await issueOtpAndGetCode("12345670-K");

    const [r1, r2] = await Promise.all([
      verifyOtpHandler(apiReq("/api/auth/verify-otp", { body: { rut: "12345670-K", code } })),
      verifyOtpHandler(apiReq("/api/auth/verify-otp", { body: { rut: "12345670-K", code } })),
    ]);

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 401]);

    const [{ n: sessionCount }] = await sql`SELECT count(*)::int AS n FROM sessions`;
    const [{ pending }] = await sql`SELECT count(*)::int AS pending FROM otp_codes WHERE used_at IS NULL`;
    expect(sessionCount).toBe(1);
    expect(pending).toBe(0);
  });

  it("solicitar nuevo OTP invalida OTPs previos no usados", async () => {
    await createUser({ rut: "12345670-K", email: "reemit@example.com", status: "ACTIVE" });
    const firstCode = await issueOtpAndGetCode("12345670-K");
    await sql`DELETE FROM rate_limits WHERE key LIKE 'otp:cd:%'`;
    const secondCode = await issueOtpAndGetCode("12345670-K");

    const [{ pending }] = await sql`SELECT count(*)::int AS pending FROM otp_codes WHERE used_at IS NULL`;
    expect(pending).toBe(1);

    if (firstCode !== secondCode) {
      const oldAttempt = await verifyOtpHandler(apiReq("/api/auth/verify-otp", { body: { rut: "12345670-K", code: firstCode } }));
      expect(oldAttempt.status).toBe(401);
    }
    const newAttempt = await verifyOtpHandler(apiReq("/api/auth/verify-otp", { body: { rut: "12345670-K", code: secondCode } }));
    expect(newAttempt.status).toBe(200);
  });
});

describe("Hito 1 — Origin, sesión, logout, PENDING_ONBOARDING y presencia", () => {
  it("rechaza mutaciones sin Origin, con Origin null o Origin tercero con 403", async () => {
    for (const badOrigin of [null, "null", "https://tercero.cl"]) {
      for (const [path, handler, body] of [
        ["/api/auth/request-otp", requestOtpHandler, { rut: "12345670-K" }],
        ["/api/auth/verify-otp", verifyOtpHandler, { rut: "12345670-K", code: "123456" }],
        ["/api/auth/onboarding", onboardingHandler, { fullName: "Ana Pérez" }],
        ["/api/auth/logout", logoutHandler, {}],
        ["/api/presence/ping", pingHandler, undefined],
      ] as const) {
        const res = await handler(apiReq(path, { origin: badOrigin, body }));
        expect(res.status, `${path} origin=${String(badOrigin)}`).toBe(403);
      }
    }
  });

  it("ciclo completo PENDING_ONBOARDING -> bloqueo ping (403) -> onboarding -> ping sin audit_logs -> logout (401)", async () => {
    const parent = await createUser({
      rut: "12345670-K",
      email: "padre@example.com",
      role: "PARENT",
      status: "PENDING_ONBOARDING",
    });
    const [cls] = await db.insert(classes).values({ name: "Párvulos" }).returning();
    const [kid] = await db.insert(students).values({ classId: cls.id, fullName: "Hijo Uno" }).returning();
    await db.insert(parentStudents).values({ parentId: parent.id, studentId: kid.id, relationship: "Papá" });

    const code = await issueOtpAndGetCode("12345670-K");
    const loginRes = await verifyOtpHandler(apiReq("/api/auth/verify-otp", { body: { rut: "12345670-K", code } }));
    expect(loginRes.status).toBe(200);
    const cookie = extractSessionCookie(loginRes);

    // En PENDING_ONBOARDING: /me responde 200 con hijos, /presence/ping responde 403
    const mePending = await meHandler(apiReq("/api/auth/me", { method: "GET", cookie }));
    expect(mePending.status).toBe(200);
    const meJson = (await mePending.json()) as { user: { status: string; children: { fullName: string }[] } };
    expect(meJson.user.status).toBe("PENDING_ONBOARDING");
    expect(meJson.user.children).toHaveLength(1);

    const pingPending = await pingHandler(apiReq("/api/presence/ping", { cookie }));
    expect(pingPending.status).toBe(403);

    // Completar onboarding -> ACTIVE + ONBOARDING_COMPLETED en audit_logs
    const onbRes = await onboardingHandler(
      apiReq("/api/auth/onboarding", { cookie, body: { fullName: "Padre Actualizado", phone: "+56912345678" } }),
    );
    expect(onbRes.status).toBe(200);
    const onbJson = (await onbRes.json()) as { user: { status: string; fullName: string } };
    expect(onbJson.user.status).toBe("ACTIVE");
    expect(onbJson.user.fullName).toBe("Padre Actualizado");

    const logsBeforePing = await sql`SELECT action FROM audit_logs ORDER BY created_at`;
    expect(logsBeforePing.map((l) => l.action)).toEqual(["OTP_REQUESTED", "LOGIN_OTP", "ONBOARDING_COMPLETED"]);

    // Ahora /presence/ping responde 200, actualiza last_seen_at y NO agrega fila en audit_logs
    const pingActive = await pingHandler(apiReq("/api/presence/ping", { cookie }));
    expect(pingActive.status).toBe(200);

    const [{ count: auditAfterPing }] = await sql`SELECT count(*)::int AS count FROM audit_logs`;
    expect(auditAfterPing).toBe(3);

    // Logout revoca sesión, desvincula push si viene endpoint y la misma cookie da 401
    await db.insert(pushSubscriptions).values({
      userId: parent.id,
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      p256dh: "k",
      auth: "a",
      platform: "android",
    });
    const outRes = await logoutHandler(
      apiReq("/api/auth/logout", { cookie, body: { pushEndpoint: "https://fcm.googleapis.com/fcm/send/abc" } }),
    );
    expect(outRes.status).toBe(200);
    const [{ subs }] = await sql`SELECT count(*)::int AS subs FROM push_subscriptions`;
    expect(subs).toBe(0);

    const meAfterLogout = await meHandler(apiReq("/api/auth/me", { method: "GET", cookie }));
    expect(meAfterLogout.status).toBe(401);
  });

  it("impide login si usuario pasa a INACTIVE tras emitir OTP y revoca sesiones", async () => {
    const teacher = await createUser({ rut: "987654-5", email: "profe@example.com", role: "TEACHER", status: "ACTIVE" });
    const [cls] = await db.insert(classes).values({ name: "Primarios" }).returning();
    await db.insert(classTeachers).values({ classId: cls.id, teacherId: teacher.id });

    const code = await issueOtpAndGetCode("987654-5");
    // Pasa a INACTIVE antes de verificar
    await db.update(users).set({ status: "INACTIVE" }).where(eq(users.id, teacher.id));
    const blocked = await verifyOtpHandler(apiReq("/api/auth/verify-otp", { body: { rut: "987654-5", code } }));
    expect(blocked.status).toBe(401);

    // Reactivado, inicia sesión y al revocar todas las sesiones + invalidar OTPs deja de entrar
    await db.update(users).set({ status: "ACTIVE" }).where(eq(users.id, teacher.id));
    await sql`DELETE FROM rate_limits WHERE key LIKE 'otp:cd:%'`;
    const code2 = await issueOtpAndGetCode("987654-5");
    const okRes = await verifyOtpHandler(apiReq("/api/auth/verify-otp", { body: { rut: "987654-5", code: code2 } }));
    const cookie = extractSessionCookie(okRes);

    await revokeAllSessions(teacher.id);
    await invalidatePendingOtps(teacher.id);
    const afterRevoke = await meHandler(apiReq("/api/auth/me", { method: "GET", cookie }));
    expect(afterRevoke.status).toBe(401);
  });

  it("requireAuth aplica matriz de roles y /api/auth/me incluye clases para TEACHER", async () => {
    const teacher = await createUser({ rut: "987654-5", email: "docente@example.com", role: "TEACHER", status: "ACTIVE" });
    const [cls] = await db.insert(classes).values({ name: "Intermedios" }).returning();
    await db.insert(classTeachers).values({ classId: cls.id, teacherId: teacher.id });

    const code = await issueOtpAndGetCode("987654-5");
    const loginRes = await verifyOtpHandler(apiReq("/api/auth/verify-otp", { body: { rut: "987654-5", code } }));
    const cookie = extractSessionCookie(loginRes);

    const meRes = await meHandler(apiReq("/api/auth/me", { method: "GET", cookie }));
    const meBody = (await meRes.json()) as { user: { role: string; classes: { name: string }[] } };
    expect(meBody.user.role).toBe("TEACHER");
    expect(meBody.user.classes.map((c) => c.name)).toEqual(["Intermedios"]);

    const adminCheck = await requireAuth(apiReq("/api/admin/users", { method: "GET", cookie }), {
      allowedRoles: ["SUPER_ADMIN"],
    });
    expect(adminCheck.ok).toBe(false);
    if (!adminCheck.ok) expect(adminCheck.response.status).toBe(403);

    const teacherCheck = await requireAuth(apiReq("/api/teacher/classes", { method: "GET", cookie }), {
      allowedRoles: ["TEACHER", "SUPER_ADMIN"],
    });
    expect(teacherCheck.ok).toBe(true);
  });

  it("rechaza con 401 tanto OTP expirado como sesión expirada y carga clases de SUPER_ADMIN si dicta clase", async () => {
    const admin = await createUser({ rut: "18963546-K", email: "admin@example.com", role: "SUPER_ADMIN", status: "ACTIVE" });
    const [cls] = await db.insert(classes).values({ name: "Juveniles" }).returning();
    await db.insert(classTeachers).values({ classId: cls.id, teacherId: admin.id });

    // OTP expirado (expires_at en el pasado) -> 401
    const expiredCode = await issueOtpAndGetCode("18963546-K");
    await sql`UPDATE otp_codes SET expires_at = now() - interval '1 minute' WHERE user_id = ${admin.id}`;
    const expiredOtpRes = await verifyOtpHandler(apiReq("/api/auth/verify-otp", { body: { rut: "18963546-K", code: expiredCode } }));
    expect(expiredOtpRes.status).toBe(401);

    // Nuevo OTP válido -> sesión activa incluye clases asignadas al SUPER_ADMIN
    await sql`DELETE FROM rate_limits WHERE key LIKE 'otp:cd:%'`;
    const validCode = await issueOtpAndGetCode("18963546-K");
    const okRes = await verifyOtpHandler(apiReq("/api/auth/verify-otp", { body: { rut: "18963546-K", code: validCode } }));
    expect(okRes.status).toBe(200);
    const cookie = extractSessionCookie(okRes);

    const meRes = await meHandler(apiReq("/api/auth/me", { method: "GET", cookie }));
    expect(meRes.status).toBe(200);
    const meJson = (await meRes.json()) as { user: { classes: { name: string }[] } };
    expect(meJson.user.classes.map((c) => c.name)).toEqual(["Juveniles"]);

    // Sesión expirada -> 401
    await sql`UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = ${admin.id}`;
    const meExpired = await meHandler(apiReq("/api/auth/me", { method: "GET", cookie }));
    expect(meExpired.status).toBe(401);
  });
});
