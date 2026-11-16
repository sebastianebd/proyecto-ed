# Informe de Auditoría QA — Implementación Hito 0 (Código vs Documentación)

> **Rol:** QA / Auditoría de Código y Cumplimiento Arquitectónico  
> **Fecha:** 2026-11-16  
> **Alcance:** Auditoría del código implementado para el **Hito 0** frente a [04-codificacion.md](../04-codificacion.md) (`v1.2`), [01-analisis-y-requerimientos.md](../01-analisis-y-requerimientos.md) (`v1.5`), [02-diseno-y-arquitectura.md](../02-diseno-y-arquitectura.md) (`v1.6`), [03-seguridad.md](../03-seguridad.md) (`v1.4`), [05-pruebas-y-qa.md](../05-pruebas-y-qa.md) (`v1.1`) y [AGENTS.md](../../AGENTS.md).

---

## 1. Resumen Ejecutivo y Evidencia de Ejecución

La implementación base del **Hito 0** refleja con alta fidelidad las definiciones de arquitectura, modelo físico de datos, RLS, separación de entornos Docker (`ed_dev` / `ed_test`) y seguridad HTTP/CSP especificadas en `docs/`.

### Resultados de Verificación Ejecutados
| Verificación | Comando | Resultado observado |
| :--- | :--- | :--- |
| **Typecheck TypeScript** | `npx tsc --noEmit --incremental false` | ✅ `0` errores (exit `0`) *(nota: `npm run lint` con `--incremental` chocó en sandbox al sobrescribir `tsconfig.tsbuildinfo`)* |
| **Pruebas Unitarias** | `npm test` | ✅ **7/7 tests en verde** ([hito0-seguridad-http.test.ts](../../tests/unit/hito0-seguridad-http.test.ts)) |
| **Pruebas de Integración** | `npm run test:integration` | ✅ **8/8 tests en verde** contra `ed_test` ([hito0-rls-seed.test.ts](../../tests/integration/hito0-rls-seed.test.ts)) |

### Matriz Resumen de Hallazgos

| ID | Severidad | Archivo(s) | Categoría | Título resumido |
| :--- | :---: | :--- | :--- | :--- |
| **H0-01** | 🟠 Alta | `src/db/seed.ts`, `tests/integration/hito0-rls-seed.test.ts` | Validación / Seed | Regex de RUT rechaza `< 1.000.000`, falta validar Mod 11 y `ON CONFLICT` no contempla `email` |
| **H0-02** | 🟠 Alta | `next.config.ts` | Seguridad / DevX | `Strict-Transport-Security` (HSTS) se envía también en desarrollo local HTTP/LAN |
| **H0-03** | 🟡 Media | `next.config.ts`, `src/proxy.ts` | Privacidad / Proxy | `X-Robots-Tag` ausente en estáticos excluidos del `matcher` y falta `/favicon.ico` en exclusión |
| **H0-04** | 🟢 Baja | `src/app/globals.css` | CSS / Tailwind v4 | Regla global `body` fuera de `@layer base` supera especificidad de `@layer utilities` |
| **H0-05** | 🟢 Baja | `tests/integration/hito0-rls-seed.test.ts`, `tests/unit/hito0-seguridad-http.test.ts` | Cobertura QA | Ampliar pruebas RLS a `INSERT`/16 tablas y cubrir `NODE_ENV=production` + `SUPABASE_URL` en `proxy()` |
| **H0-06** | 🟢 Baja | `next.config.ts`, `docs/04-codificacion.md` | Documentación | Comentarios menores desactualizados (`middleware.ts` $\rightarrow$ `proxy.ts`, nota `unit-pdfs` en `rls.sql`) |

---

## 2. Verificación de Cumplimiento (Docs vs Código)

| Requisito / Invariante | Estado | Evidencia en el repositorio |
| :--- | :---: | :--- |
| **Esquema Drizzle (`16` tablas, `VARCHAR(N)`, índices y PKs compuestas)** | ✅ Cumple | [src/db/schema.ts](../../src/db/schema.ts) y migración [0000_watery_maggott.sql](../../drizzle/0000_watery_maggott.sql) alineados 1:1 con `02` §3 y `03` §7. |
| **Driver Postgres para Pooler (`prepare: false, max: 1` + singleton dev)** | ✅ Cumple | Implementado en [src/db/index.ts](../../src/db/index.ts) y [src/db/migrate.ts](../../src/db/migrate.ts). |
| **Migración + RLS idempotente + creación condicional de rol `anon`** | ✅ Cumple | [src/db/rls.sql](../../src/db/rls.sql) activa RLS en el 100% de tablas `public` sin políticas y revoca privilegios a `anon`. |
| **Entornos Docker aislados (`ed_dev` y `ed_test`) + salvaguarda** | ✅ Cumple | [docker-compose.yml](../../docker-compose.yml), [init-databases.sql](../../docker/init-databases.sql), [vitest.config.ts](../../vitest.config.ts) (`fileParallelism: false`) y guarda `/\/ed_test/` en el test. |
| **CSP dinámica con *nonce* (`src/proxy.ts` + `layout.tsx`)** | ✅ Cumple | [src/proxy.ts](../../src/proxy.ts) propaga `x-nonce` y `Content-Security-Policy` en request y response; [layout.tsx](../../src/app/layout.tsx) lee `headers()` sin `dangerouslySetInnerHTML`. |
| **Activos base anti-indexación y offline** | ✅ Cumple | [public/robots.txt](../../public/robots.txt) (`Disallow: /`), [public/offline.html](../../public/offline.html) (HTML estático sin scripts) y [.gitignore](../../.gitignore). |

---

## 3. Detalle de Hallazgos y Soluciones Recomendadas

### H0-01 — Validación de RUT e idempotencia parcial en `src/db/seed.ts`
* **Severidad:** 🟠 Alta
* **Ubicación:** [src/db/seed.ts](../../src/db/seed.ts#L14-L28) y [tests/integration/hito0-rls-seed.test.ts](../../tests/integration/hito0-rls-seed.test.ts#L71).
* **Problema:**
  1. La expresión `/^\d{7,8}-[\dK]$/` ([seed.ts L15](../../src/db/seed.ts#L15)) rechaza RUTs chilenos reales menores a `1.000.000` (6 dígitos + guion + DV = `7` caracteres limpios, ej. `987654-5`), contradiciendo [03 §7](../03-seguridad.md#L164) y [05 §2.1](../05-pruebas-y-qa.md#L40).
  2. No valida el dígito verificador Módulo 11 antes de insertar; si se carga un RUT con DV inválido en `.env.local`, el `seed` lo creará pero el login en Hito 1 lo rechazará.
  3. El `INSERT` solo maneja `ON CONFLICT (rut) DO NOTHING` ([seed.ts L24](../../src/db/seed.ts#L24)): si ya existe un usuario con el mismo `email` (`UNIQUE`), fallará con error `23505`.
  4. En [hito0-rls-seed.test.ts L71](../../tests/integration/hito0-rls-seed.test.ts#L71), `expect(admin.rut).toBe(process.env.SEED_ADMIN_RUT)` compara contra la variable sin normalizar (fallaría si `.env.test` incluyera puntos o `k` minúscula).
* **Solución recomendada:** Actualizar la regex a `/^\d{6,8}-[\dK]$/` (y validar Módulo 11), usar `ON CONFLICT DO NOTHING` / verificación previa por `rut` o `email`, y normalizar el valor esperado en el test de integración.

### H0-02 — `Strict-Transport-Security` (HSTS) activo en desarrollo local HTTP
* **Severidad:** 🟠 Alta
* **Ubicación:** [next.config.ts](../../next.config.ts#L4-L10).
* **Problema:** `Strict-Transport-Security: max-age=63072000; includeSubDomains` se envía en todos los entornos. Al probar la PWA en desarrollo desde celulares en la red local vía HTTP plano (`http://192.168.x.x:3000`), el navegador puede cachear la directiva HSTS durante 2 años y forzar `https://`, bloqueando las pruebas locales.
* **Solución recomendada:** Emitir `Strict-Transport-Security` únicamente cuando `process.env.NODE_ENV === "production"` (y adaptar el test unitario en consecuencia).

### H0-03 — `X-Robots-Tag` ausente en estáticos y falta `/favicon.ico` en `matcher` de `src/proxy.ts`
* **Severidad:** 🟡 Media
* **Ubicación:** [next.config.ts](../../next.config.ts#L4-L16) y [src/proxy.ts](../../src/proxy.ts#L36-L43).
* **Problema:**
  1. `X-Robots-Tag: noindex, nofollow` se inyecta solo en `src/proxy.ts` ([L36](../../src/proxy.ts#L36)), por lo que los archivos excluidos del `matcher` (`offline.html`, `icons/*`, etc.) no lo reciben.
  2. `/favicon.ico` no está excluido del `matcher` ([L42](../../src/proxy.ts#L42)), disparando generación innecesaria de *nonce* y CSP en cada petición automática de favicon del navegador.
* **Solución recomendada:** Agregar `{ key: "X-Robots-Tag", value: "noindex, nofollow" }` en `securityHeaders` de `next.config.ts` y añadir `favicon\\.ico` a la exclusión del `matcher` en `src/proxy.ts`.

### H0-04 — Especificidad de `body` en `src/app/globals.css` con Tailwind v4
* **Severidad:** 🟢 Baja
* **Ubicación:** [src/app/globals.css](../../src/app/globals.css#L25-L29).
* **Problema:** La regla sin capa `body { background: ...; color: ...; }` en Tailwind CSS v4 tiene mayor especificidad que `@layer utilities`, pudiendo anular clases utilitarias si se aplican directamente sobre `<body>`.
* **Solución recomendada:** Envolver los estilos base de `body` dentro de `@layer base { ... }`.

### H0-05 — Ampliación puntual de cobertura en tests de Hito 0
* **Severidad:** 🟢 Baja
* **Ubicación:** [tests/integration/hito0-rls-seed.test.ts](../../tests/integration/hito0-rls-seed.test.ts#L39-L56) y [tests/unit/hito0-seguridad-http.test.ts](../../tests/unit/hito0-seguridad-http.test.ts#L12-L34).
* **Mejoras sugeridas:**
  * En `hito0-rls-seed.test.ts`: probar también `INSERT` bajo `SET LOCAL ROLE anon` y consultar dinámicamente todas las tablas `public` (no solo 5).
  * En `hito0-seguridad-http.test.ts`: añadir casos de `proxy()` con `NODE_ENV=production` (verificando ausencia de `'unsafe-eval'`) y con `SUPABASE_URL` definida (verificando su origen en `connect-src`).

### H0-06 — Comentarios menores desactualizados
* **Severidad:** 🟢 Baja
* **Ubicación:** [next.config.ts](../../next.config.ts#L3) y [docs/04-codificacion.md](../04-codificacion.md#L66).
* **Detalle:** El comentario de `next.config.ts` L3 referencia `src/middleware.ts` en lugar de `src/proxy.ts`; y `04` §1 L66 menciona `+ bucket unit-pdfs` junto a `rls.sql`, aunque la creación real del bucket en Supabase corresponde al Hito 3 ([04 L184](../04-codificacion.md#L184)).

---

## 4. Checklist de Ajustes Recomendados (Antes de Iniciar Hito 1)

- [ ] **H0-01:** Permitir RUTs de 6–8 dígitos + DV (`/^\d{6,8}-[\dK]$/`) con validación Mod 11 en `src/db/seed.ts`, manejo de conflicto en `email` y normalización esperada en `hito0-rls-seed.test.ts`.
- [ ] **H0-02:** Condicionar `Strict-Transport-Security` en `next.config.ts` a `process.env.NODE_ENV === "production"`.
- [ ] **H0-03:** Mover/replicar `X-Robots-Tag: noindex, nofollow` en `next.config.ts` y excluir `favicon\\.ico` en el `matcher` de `src/proxy.ts`.
- [ ] **H0-04 a H0-06:** Envolver `body` en `@layer base` (`globals.css`), ampliar casos de `INSERT`/16 tablas + `NODE_ENV=production` + `SUPABASE_URL` en tests, y corregir comentarios menores.
