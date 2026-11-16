import { spawnSync } from "node:child_process";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL ?? "";
const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
let sql: ReturnType<typeof postgres>;

function runScript(script: string, extraEnv?: Record<string, string>) {
  return spawnSync(process.execPath, [tsxCli, script], {
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    encoding: "utf8",
  });
}

function assertScriptOk(script: string, extraEnv?: Record<string, string>) {
  const r = runScript(script, extraEnv);
  if (r.status !== 0) throw new Error(`${script} falló:\n${r.stdout}\n${r.stderr}`);
}

beforeAll(async () => {
  // Salvaguarda: estas pruebas truncan tablas; solo corren contra la BD aislada ed_test.
  if (!/\/ed_test(\?|$)/.test(url)) {
    throw new Error("DATABASE_URL debe apuntar a ed_test (copia .env.test.example a .env.test)");
  }
  assertScriptOk("src/db/migrate.ts");
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
    expect(() => assertScriptOk("src/db/migrate.ts")).not.toThrow();
  });

  it("el rol anon no puede leer, insertar ni eliminar en ninguna de las 16 tablas public", async () => {
    const tables = await sql<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    expect(tables.length).toBe(16);

    const denied = async (query: string) => {
      try {
        const rows = await sql.begin(async (tx) => {
          await tx.unsafe("SET LOCAL ROLE anon");
          return tx.unsafe(query);
        });
        return rows.length === 0;
      } catch (e) {
        return (e as { code?: string }).code === "42501";
      }
    };

    for (const { tablename } of tables) {
      expect(await denied(`SELECT * FROM "${tablename}"`), `SELECT ${tablename}`).toBe(true);
      expect(await denied(`INSERT INTO "${tablename}" DEFAULT VALUES`), `INSERT ${tablename}`).toBe(true);
      expect(await denied(`DELETE FROM "${tablename}"`), `DELETE ${tablename}`).toBe(true);
    }
  });
});

describe("Hito 0 — seed idempotente y validación de RUT", () => {
  it("ejecutar seed dos veces crea exactamente 1 Super Admin y 1 clase (normalizando RUT)", async () => {
    await sql`TRUNCATE users, classes CASCADE`;
    assertScriptOk("src/db/seed.ts");
    assertScriptOk("src/db/seed.ts");
    // Segundo intento con otro RUT pero mismo email: no debe fallar por constraint único en email
    assertScriptOk("src/db/seed.ts", { SEED_ADMIN_RUT: "987.654-5" });

    const [{ n: admins }] = await sql`SELECT count(*)::int AS n FROM users WHERE role = 'SUPER_ADMIN'`;
    const [{ n: classes }] = await sql`SELECT count(*)::int AS n FROM classes`;
    const [admin] = await sql`SELECT rut, status FROM users WHERE role = 'SUPER_ADMIN'`;
    const expectedRut = (process.env.SEED_ADMIN_RUT ?? "").replace(/[.\s]/g, "").toUpperCase();

    expect(admins).toBe(1);
    expect(classes).toBe(1);
    expect(admin.status).toBe("ACTIVE");
    expect(admin.rut).toBe(expectedRut);
  });

  it("acepta RUT real < 1.000.000 (7 chars limpios) con formato visual y DV minúsculo", async () => {
    await sql`TRUNCATE users, classes CASCADE`;
    assertScriptOk("src/db/seed.ts", {
      SEED_ADMIN_RUT: " 987.654-5 ",
      SEED_ADMIN_EMAIL: "menor.millon@example.com",
    });
    const [admin] = await sql`SELECT rut FROM users WHERE email = 'menor.millon@example.com'`;
    expect(admin.rut).toBe("987654-5");
  });

  it("rechaza RUT con dígito verificador Mod 11 inválido o longitud fuera de rango", () => {
    const badDv = runScript("src/db/seed.ts", { SEED_ADMIN_RUT: "12345670-1" });
    expect(badDv.status).not.toBe(0);

    const tooShort = runScript("src/db/seed.ts", { SEED_ADMIN_RUT: "12345-K" });
    expect(tooShort.status).not.toBe(0);
  });
});
