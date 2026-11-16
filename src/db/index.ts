import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Singleton en globalThis para evitar fugas de conexiones con el hot-reload de desarrollo.
const globalForDb = globalThis as unknown as { __edSql?: ReturnType<typeof postgres> };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está definida");
  return postgres(url, { prepare: false, max: 1 });
}

export const sql = globalForDb.__edSql ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.__edSql = sql;

export const db = drizzle(sql, { schema });
