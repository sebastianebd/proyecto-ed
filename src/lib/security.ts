import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/http";

// Utilidades de seguridad puras (sin BD) para auth.ts. docs/03-seguridad.md §3.2, §3.3 y §6.5.

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_TTL_DAYS = 30;
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

export function appUrl(): string {
  const url = process.env.APP_URL;
  if (url) return url;
  if (process.env.NODE_ENV === "production") throw new Error("APP_URL no está definida");
  return "http://localhost:3000";
}

export function otpPepper(): string {
  const pepper = process.env.OTP_PEPPER;
  if (!pepper) throw new Error("OTP_PEPPER no está definida");
  return pepper;
}

/** OTP de 6 dígitos criptográficamente seguro (nunca Math.random). */
export const generateOtp = () => String(randomInt(100000, 1000000));

/** HMAC-SHA256(rut + ":" + otp, OTP_PEPPER) en hex. */
export const hashOtp = (rut: string, otp: string) =>
  createHmac("sha256", otpPepper()).update(`${rut}:${otp}`).digest("hex");

/** HMAC de un identificador (rut/ip) para claves de rate_limits sin guardar datos en claro. */
export const hashIdentifier = (kind: "rut" | "ip", value: string) =>
  createHmac("sha256", otpPepper()).update(`${kind}:${value}`).digest("hex");

export const generateSessionToken = () => randomBytes(32).toString("hex");
export const hashToken = (rawToken: string) => createHash("sha256").update(rawToken).digest("hex");

/** Comparación de hex en tiempo constante. */
export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

/** Cookie segura (`__Host-ed_session`) solo si APP_URL es HTTPS; en HTTP local `ed_session`. */
export const isSecureContext = () => new URL(appUrl()).protocol === "https:";
export const sessionCookieName = () => (isSecureContext() ? "__Host-ed_session" : "ed_session");
export const sessionCookieOptions = () =>
  ({
    httpOnly: true,
    secure: isSecureContext(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  }) as const;

/**
 * Anti-CSRF: exige `Origin` (o `Referer` si no hay Origin) con esquema+host idénticos a APP_URL.
 * Rechaza ausentes, `null` y orígenes distintos.
 */
export function isAllowedOrigin(headers: Headers, expectedAppUrl: string = appUrl()): boolean {
  let expected: string;
  try {
    expected = new URL(expectedAppUrl).origin;
  } catch {
    return false;
  }
  const origin = headers.get("origin");
  if (origin !== null) {
    if (origin === "null") return false;
    try {
      return new URL(origin).origin === expected;
    } catch {
      return false;
    }
  }
  const referer = headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === expected;
    } catch {
      return false;
    }
  }
  return false;
}

export const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** Única ruta exenta de Origin (protegida por CRON_SECRET). */
export const ORIGIN_EXEMPT_PATHS = new Set(["/api/cron/daily"]);

export type Role = "SUPER_ADMIN" | "TEACHER" | "PARENT";

export function homePathForRole(role: Role): string {
  if (role === "SUPER_ADMIN") return "/admin";
  if (role === "TEACHER") return "/profesor/asistencia";
  return "/";
}

/** Anti-CSRF: 403 si una mutación no trae Origin/Referer válido (exento: /api/cron/daily). */
export function checkOrigin(req: NextRequest): NextResponse | null {
  if (!MUTATING_METHODS.has(req.method)) return null;
  if (ORIGIN_EXEMPT_PATHS.has(new URL(req.url).pathname)) return null;
  return isAllowedOrigin(req.headers) ? null : jsonError(403, "Origen no permitido");
}
