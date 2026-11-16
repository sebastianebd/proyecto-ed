import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Migraciones Drizzle + rls.sql idempotente. Uso: npm run db:migrate
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está definida");

  const client = postgres(url, { prepare: false, max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: path.resolve("drizzle") });
    await client.unsafe(readFileSync(path.resolve("src/db/rls.sql"), "utf8"));
    console.log("db:migrate OK (migraciones + RLS)");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("db:migrate falló:", err instanceof Error ? err.message : err);
  process.exit(1);
});
