import { spawnSync } from "node:child_process";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL ?? "";
const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
let sql: ReturnType<typeof postgres>;

function runScript(script: string) {
  const r = spawnSync(process.execPath, [tsxCli, script], { env: process.env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${script} falló:\n${r.stdout}\n${r.stderr}`);
}

beforeAll(async () => {
  // Salvaguarda: estas pruebas truncan tablas; solo corren contra la BD aislada ed_test.
  if (!/\/ed_test(\?|$)/.test(url)) {
    throw new Error("DATABASE_URL debe apuntar a ed_test (copia .env.test.example a .env.test)");
  }
  runScript("src/db/migrate.ts");
  sql = postgres(url, { prepare: false, max: 1 });
});

afterAll(async () => {
  await sql?.end();
});

describe("Hito 0 — RLS", () => {
  it("rowsecurity = true en el 100% de las tablas de public tras db:migrate", async () => {
    const rows = await sql`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`;
    expect(rows.length).toBe(16);
    expect(rows.filter((r) => !r.rowsecurity)).toEqual([]);
  });

  it("db:migrate es idempotente (segunda ejecución sin error)", () => {
    expect(() => runScript("src/db/migrate.ts")).not.toThrow();
  });

  const tables = ["users", "students", "otp_codes", "sessions", "audit_logs"];
  for (const table of tables) {
    it(`el rol anon no puede leer ni escribir en ${table}`, async () => {
      const denied = async (query: string) => {
        try {
          const rows = await sql.begin(async (tx) => {
            await tx.unsafe("SET LOCAL ROLE anon");
            return tx.unsafe(query);
          });
          return rows.length === 0; // 0 filas también cuenta como bloqueo
        } catch (e) {
          return (e as { code?: string }).code === "42501"; // insufficient_privilege
        }
      };
      expect(await denied(`SELECT * FROM ${table}`)).toBe(true);
      expect(await denied(`DELETE FROM ${table}`)).toBe(true);
    });
  }
});

describe("Hito 0 — seed idempotente", () => {
  it("ejecutar seed dos veces crea exactamente 1 Super Admin y 1 clase", async () => {
    await sql`TRUNCATE users, classes CASCADE`;
    runScript("src/db/seed.ts");
    runScript("src/db/seed.ts");

    const [{ n: admins }] = await sql`SELECT count(*)::int AS n FROM users WHERE role = 'SUPER_ADMIN'`;
    const [{ n: classes }] = await sql`SELECT count(*)::int AS n FROM classes`;
    const [admin] = await sql`SELECT rut, status FROM users WHERE role = 'SUPER_ADMIN'`;
    expect(admins).toBe(1);
    expect(classes).toBe(1);
    expect(admin.status).toBe("ACTIVE");
    expect(admin.rut).toBe(process.env.SEED_ADMIN_RUT);
  });
});
