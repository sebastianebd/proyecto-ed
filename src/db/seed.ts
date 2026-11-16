import postgres from "postgres";

function isValidRutMod11(rut: string): boolean {
  const [body, dv] = rut.split("-");
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const rem = 11 - (sum % 11);
  const expected = rem === 11 ? "0" : rem === 10 ? "K" : String(rem);
  return dv === expected;
}

// Seed idempotente: 1 Super Admin + 1ra clase desde variables de entorno (sin datos personales en Git).
// Uso: npm run db:seed
async function main() {
  const { DATABASE_URL, SEED_ADMIN_RUT, SEED_ADMIN_NAME, SEED_ADMIN_EMAIL } = process.env;
  const className = process.env.SEED_CLASS_NAME || "Primera Clase";
  if (!DATABASE_URL) throw new Error("DATABASE_URL no está definida");
  if (!SEED_ADMIN_RUT || !SEED_ADMIN_NAME || !SEED_ADMIN_EMAIL) {
    throw new Error("Faltan SEED_ADMIN_RUT, SEED_ADMIN_NAME o SEED_ADMIN_EMAIL");
  }

  // RUT normalizado: 6..8 dígitos + guion + DV en mayúscula (soporta < 1.000.000, ej. 987654-5 y 12345670-K)
  const rut = SEED_ADMIN_RUT.replace(/[.\s]/g, "").toUpperCase();
  if (!/^\d{6,8}-[\dK]$/.test(rut) || !isValidRutMod11(rut)) {
    throw new Error("SEED_ADMIN_RUT inválido (formato o dígito verificador Mod 11)");
  }
  const email = SEED_ADMIN_EMAIL.trim().toLowerCase();

  const client = postgres(DATABASE_URL, { prepare: false, max: 1 });
  try {
    await client.begin(async (tx) => {
      await tx`
        INSERT INTO users (rut, full_name, email, role, status, onboarded_at)
        VALUES (${rut}, ${SEED_ADMIN_NAME.trim()}, ${email}, 'SUPER_ADMIN', 'ACTIVE', now())
        ON CONFLICT DO NOTHING`;
      await tx`
        INSERT INTO classes (name)
        SELECT ${className}
        WHERE NOT EXISTS (SELECT 1 FROM classes)`;
    });
    console.log("db:seed OK");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("db:seed falló:", err instanceof Error ? err.message : err);
  process.exit(1);
});
