import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, type DbOrTx } from "@/db";
import { otpCodes, sessions, users } from "@/db/schema";
import { recordAuditLog } from "@/lib/audit";
import { runInBackground } from "@/lib/background";
import { sendOtpEmail } from "@/lib/email";
import { jsonError } from "@/lib/http";
import { consumeRateLimit, isRateLimited } from "@/lib/rate-limit";
import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MINUTES,
  SESSION_TTL_DAYS,
  checkOrigin,
  generateOtp,
  generateSessionToken,
  hashIdentifier,
  hashOtp,
  hashToken,
  safeEqualHex,
  sessionCookieName,
  type Role,
} from "@/lib/security";

export * from "@/lib/security";

export type LoginStatus = "PENDING_ONBOARDING" | "ACTIVE";
export type AuthUser = {
  id: string;
  rut: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  status: LoginStatus;
};

const LOGIN_STATUSES: LoginStatus[] = ["PENDING_ONBOARDING", "ACTIVE"];

// ───────────────────────── Sesiones ─────────────────────────

/** Busca una sesión vigente (no revocada, no vencida) cuyo usuario puede iniciar sesión. */
export async function findActiveSession(rawToken: string | undefined | null) {
  if (!rawToken) return null;
  const rows = await db
    .select({
      sessionId: sessions.id,
      id: users.id,
      rut: users.rut,
      fullName: users.fullName,
      email: users.email,
      phone: users.phone,
      role: users.role,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(rawToken)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, sql`now()`),
        inArray(users.status, LOGIN_STATUSES),
      ),
    )
    .limit(1);
  if (rows.length === 0) return null;
  const { sessionId, ...user } = rows[0];
  return { sessionId, user: user as AuthUser };
}

async function createSession(tx: DbOrTx, userId: string, userAgent: string | null) {
  const rawToken = generateSessionToken();
  await tx.insert(sessions).values({
    userId,
    tokenHash: hashToken(rawToken),
    expiresAt: sql`now() + make_interval(days => ${SESSION_TTL_DAYS})` as unknown as Date,
    userAgent: userAgent?.slice(0, 300) ?? null,
  });
  return rawToken;
}

export async function revokeSession(sessionId: string, executor: DbOrTx = db) {
  await executor.update(sessions).set({ revokedAt: sql`now()` }).where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Revoca TODAS las sesiones activas de un usuario (desactivación, cambio de correo, revocación admin). */
export async function revokeAllSessions(userId: string, executor: DbOrTx = db) {
  await executor.update(sessions).set({ revokedAt: sql`now()` }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/** Invalida OTP pendientes de un usuario (`used_at = now()`). */
export async function invalidatePendingOtps(userId: string, executor: DbOrTx = db) {
  await executor.update(otpCodes).set({ usedAt: sql`now()` }).where(and(eq(otpCodes.userId, userId), isNull(otpCodes.usedAt)));
}

// ───────────────────────── Guards HTTP ─────────────────────────

type AuthOptions = { allowedRoles?: Role[]; allowOnboarding?: boolean };
type AuthResult = { ok: true; user: AuthUser; sessionId: string } | { ok: false; response: NextResponse };

/**
 * Guard unificado: Origin (mutaciones) → sesión en BD → estado (onboarding) → rol.
 * 401 sin sesión válida; 403 por onboarding pendiente, rol no permitido u Origin inválido.
 */
export async function requireAuth(req: NextRequest, options: AuthOptions = {}): Promise<AuthResult> {
  const originError = checkOrigin(req);
  if (originError) return { ok: false, response: originError };

  const found = await findActiveSession(req.cookies.get(sessionCookieName())?.value);
  if (!found) return { ok: false, response: jsonError(401, "No autenticado") };

  const { user, sessionId } = found;
  if (user.status === "PENDING_ONBOARDING" && !options.allowOnboarding) {
    return { ok: false, response: jsonError(403, "Debes completar tu onboarding") };
  }
  if (options.allowedRoles && !options.allowedRoles.includes(user.role)) {
    return { ok: false, response: jsonError(403, "No tienes permiso para esta acción") };
  }
  return { ok: true, user, sessionId };
}

// ───────────────────────── OTP ─────────────────────────

const WINDOW_15M = 15 * 60;

/**
 * Solicita un OTP. Nunca revela si el RUT existe: ante cooldown, límites o RUT inexistente
 * retorna sin enviar nada y el handler responde igual (200 neutro).
 * Orden: IP (15/15m) → cooldown 60s por rut_hash → 5/15m por rut_hash.
 */
export async function requestOtp(rut: string, ip: string): Promise<void> {
  const rutKey = hashIdentifier("rut", rut);
  if (!(await consumeRateLimit(`otp:ip:${hashIdentifier("ip", ip)}`, 15, WINDOW_15M)).allowed) return;
  if (!(await consumeRateLimit(`otp:cd:${rutKey}`, 1, 60)).allowed) return;
  if (!(await consumeRateLimit(`otp:rut:${rutKey}`, 5, WINDOW_15M)).allowed) return;

  const [user] = await db
    .select({ id: users.id, role: users.role, email: users.email, fullName: users.fullName })
    .from(users)
    .where(and(eq(users.rut, rut), inArray(users.status, LOGIN_STATUSES)))
    .limit(1);
  if (!user) return;

  const code = generateOtp();
  await db.transaction(async (tx) => {
    await invalidatePendingOtps(user.id, tx);
    await tx.insert(otpCodes).values({
      userId: user.id,
      codeHash: hashOtp(rut, code),
      expiresAt: sql`now() + make_interval(mins => ${OTP_TTL_MINUTES})` as unknown as Date,
    });
    await recordAuditLog({ actorUserId: user.id, actorRole: user.role, action: "OTP_REQUESTED", entityType: "user", entityId: user.id }, tx);
  });
  runInBackground(() => sendOtpEmail({ to: user.email, name: user.fullName, code }));
}

export type VerifyOtpResult =
  | { ok: true; rawToken: string; user: { id: string; role: Role; status: LoginStatus } }
  | { ok: false; reason: "RATE_LIMITED" | "INVALID" };

/**
 * Verifica el OTP de forma atómica (docs/03 §3.2): fila bloqueada FOR UPDATE, `attempts < 5`,
 * `used_at IS NULL`, `expires_at > now()` y usuario en PENDING_ONBOARDING/ACTIVE dentro de la
 * misma transacción. Máx. 10 verificaciones fallidas por IP cada 15 min.
 */
export async function verifyOtp(params: { rut: string; code: string; ip: string; userAgent: string | null }): Promise<VerifyOtpResult> {
  const failKey = `otp:vfail:${hashIdentifier("ip", params.ip)}`;
  if (await isRateLimited(failKey, 10)) return { ok: false, reason: "RATE_LIMITED" };

  const result = await db.transaction(async (tx): Promise<VerifyOtpResult> => {
    const [user] = await tx
      .select({ id: users.id, role: users.role, status: users.status })
      .from(users)
      .where(and(eq(users.rut, params.rut), inArray(users.status, LOGIN_STATUSES)))
      .limit(1)
      .for("update");
    if (!user) return { ok: false, reason: "INVALID" };

    const pending = await tx.execute(sql`
      SELECT id, code_hash FROM otp_codes
      WHERE user_id = ${user.id} AND used_at IS NULL AND expires_at > now() AND attempts < ${OTP_MAX_ATTEMPTS}
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE`);
    if (pending.length === 0) return { ok: false, reason: "INVALID" };
    const otp = pending[0] as { id: string; code_hash: string };

    if (!safeEqualHex(otp.code_hash, hashOtp(params.rut, params.code))) {
      await tx.execute(sql`
        UPDATE otp_codes
        SET attempts = attempts + 1,
            used_at = CASE WHEN attempts + 1 >= ${OTP_MAX_ATTEMPTS} THEN now() ELSE used_at END
        WHERE id = ${otp.id} AND used_at IS NULL AND attempts < ${OTP_MAX_ATTEMPTS}`);
      await recordAuditLog({ actorUserId: user.id, actorRole: user.role, action: "OTP_FAILED", entityType: "user", entityId: user.id }, tx);
      return { ok: false, reason: "INVALID" };
    }

    const consumed = await tx.execute(sql`
      UPDATE otp_codes SET used_at = now()
      WHERE id = ${otp.id} AND used_at IS NULL AND expires_at > now() AND attempts < ${OTP_MAX_ATTEMPTS}
      RETURNING id`);
    if (consumed.length === 0) return { ok: false, reason: "INVALID" };

    const rawToken = await createSession(tx, user.id, params.userAgent);
    await tx.update(users).set({ lastSeenAt: sql`now()` }).where(eq(users.id, user.id));
    await recordAuditLog({ actorUserId: user.id, actorRole: user.role, action: "LOGIN_OTP", entityType: "user", entityId: user.id }, tx);
    return { ok: true, rawToken, user: { id: user.id, role: user.role as Role, status: user.status as LoginStatus } };
  });

  if (!result.ok) await consumeRateLimit(failKey, 10, WINDOW_15M);
  return result;
}
