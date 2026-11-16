import { NextRequest, NextResponse } from "next/server";
import { checkOrigin, sessionCookieName, sessionCookieOptions, verifyOtp } from "@/lib/auth";
import { getClientIp, jsonError, parseBody, withErrorHandling } from "@/lib/http";
import { verifyOtpSchema } from "@/lib/validators";

export const POST = withErrorHandling(async (req: NextRequest) => {
  const originError = checkOrigin(req);
  if (originError) return originError;

  const parsed = await parseBody(req, verifyOtpSchema);
  if (!parsed.ok) return parsed.response;

  const result = await verifyOtp({
    rut: parsed.data.rut,
    code: parsed.data.code,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  if (!result.ok) {
    return result.reason === "RATE_LIMITED"
      ? jsonError(429, "Demasiados intentos fallidos. Espera unos minutos.")
      : jsonError(401, "Código inválido o expirado");
  }

  const res = NextResponse.json({ ok: true, user: result.user });
  res.cookies.set(sessionCookieName(), result.rawToken, sessionCookieOptions());
  return res;
});
