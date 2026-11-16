import { sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";

// Rate limiting en PostgreSQL ($0). Ventana fija que arranca en el primer hit.

/** Incrementa atómicamente el contador de `key` y devuelve si aún está dentro del máximo. */
export async function consumeRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
  executor: DbOrTx = db,
): Promise<{ allowed: boolean; count: number }> {
  const rows = await executor.execute(sql`
    INSERT INTO rate_limits (key, count, reset_at)
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= now()
                      THEN now() + make_interval(secs => ${windowSeconds})
                      ELSE rate_limits.reset_at END
    RETURNING count`);
  const count = Number((rows[0] as { count: number | string }).count);
  return { allowed: count <= max, count };
}

/** Consulta (sin consumir) si `key` ya alcanzó `max` dentro de su ventana vigente. */
export async function isRateLimited(key: string, max: number, executor: DbOrTx = db): Promise<boolean> {
  const rows = await executor.execute(
    sql`SELECT count FROM rate_limits WHERE key = ${key} AND reset_at > now()`,
  );
  return rows.length > 0 && Number((rows[0] as { count: number | string }).count) >= max;
}
