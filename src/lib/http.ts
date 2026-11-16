import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";

export const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

const firstIp = (raw: string | null) => raw?.split(",")[0].trim().slice(0, 64) || "";

/** IP del cliente: prioriza cabeceras de borde de Vercel antes que x-forwarded-for. */
export function getClientIp(req: NextRequest): string {
  return (
    firstIp(req.headers.get("x-vercel-forwarded-for")) ||
    firstIp(req.headers.get("x-real-ip")) ||
    firstIp(req.headers.get("x-forwarded-for")) ||
    "unknown"
  );
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** Parsea JSON + valida con Zod compartido; 400 con detalle seguro por campo. */
export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: jsonError(400, "Cuerpo JSON inválido") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    return { ok: false, response: NextResponse.json({ error: "Datos inválidos", fields }, { status: 400 }) };
  }
  return { ok: true, data: parsed.data };
}

/** Detecta un código SQLSTATE de PostgreSQL (directo o envuelto por Drizzle en `cause`). */
export function getPgErrorInfo(err: unknown): { code?: string; constraint?: string } {
  if (!err || typeof err !== "object") return {};
  const obj = err as { code?: string; constraint?: string; constraint_name?: string; cause?: unknown };
  if (obj.code) return { code: obj.code, constraint: obj.constraint ?? obj.constraint_name };
  if (obj.cause && typeof obj.cause === "object") {
    const c = obj.cause as { code?: string; constraint?: string; constraint_name?: string };
    return { code: c.code, constraint: c.constraint ?? c.constraint_name };
  }
  return {};
}

/** Errores 500 genéricos: el detalle queda solo en logs de servidor. */
export function withErrorHandling<A extends unknown[]>(handler: (...args: A) => Promise<NextResponse>) {
  return async (...args: A): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error("[api] error no controlado:", err instanceof Error ? err.message : err);
      return jsonError(500, "Error interno del servidor");
    }
  };
}
