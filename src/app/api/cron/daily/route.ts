import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runDailyCron } from "@/lib/cron";
import { jsonError, withErrorHandling } from "@/lib/http";

function isValidCronAuthorization(headerValue: string | null): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret || !headerValue) return false;

  const expected = `Bearer ${secret}`;
  const a = crypto.createHash("sha256").update(headerValue, "utf8").digest();
  const b = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

// Exento de validación Origin (invocado por Vercel Cron con CRON_SECRET).
export const GET = withErrorHandling(async (req: NextRequest) => {
  if (!isValidCronAuthorization(req.headers.get("authorization"))) {
    return jsonError(401, "No autorizado");
  }

  const result = await runDailyCron();
  return NextResponse.json({ ok: true, ...result });
});
