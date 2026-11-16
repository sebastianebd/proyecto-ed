# Instrucciones Obligatorias de Desarrollo — Proyecto ED (5ta ACyM)

Todo agente o desarrollador que trabaje en este repositorio **debe seguir estrictamente la documentación aprobada en `docs/`** sin improvisar arquitectura, rutas, validaciones ni reglas fuera de especificación.

## 1. Documentos Fuente (Lectura Obligatoria)
1. [docs/01-analisis-y-requerimientos.md](./docs/01-analisis-y-requerimientos.md) (`v1.5`) — Reglas de negocio, historias de usuario y KPIs.
2. [docs/02-diseno-y-arquitectura.md](./docs/02-diseno-y-arquitectura.md) (`v1.6`) — Stack `$0`, ERD, sistema visual ACyM, flujos técnicos y contratos API.
3. [docs/03-seguridad.md](./docs/03-seguridad.md) (`v1.4`) — Matriz Zod Front+Back, RBAC, RLS, CSP con *nonce*, Service Worker, anti-SSRF, `Origin` y `audit_logs`.
4. [docs/04-codificacion.md](./docs/04-codificacion.md) (`v1.2`) — Estructura de archivos, estándares de código, hitos (`0..6`) y tablero de avance.
5. [docs/05-pruebas-y-qa.md](./docs/05-pruebas-y-qa.md) (`v1.1`) — Pruebas unitarias, de integración por hito y protocolo E2E PWA.

## 2. Protocolo Obligatorio por Hito (Anti-Desviación)
El desarrollo avanza **estrictamente en orden (`Hito 0 -> Hito 1 -> ... -> Hito 6`)**. Para cada **Hito `N`**:
1. **Consultar antes de codificar:** Leer las secciones aplicables de `01`, `02`, `03`, `04` y `05` indicadas en el tablero de `docs/04-codificacion.md §4` para el **Hito `N`**.
2. **Alcance acotado:** Implementar únicamente los módulos y endpoints del **Hito `N`**, sin adelantar funcionalidades ni atajos fuera de plan.
3. **Pruebas en paralelo:** Escribir y ejecutar las pruebas unitarias (`npm test`) y de integración (`npm run test:integration` con `fileParallelism: false` sobre BD de pruebas aislada) requeridas por `docs/05-pruebas-y-qa.md` para el **Hito `N`**.
4. **Compuerta de cierre (DoD):** **Prohibido iniciar el Hito `N+1`** si las pruebas del Hito `N` no están 100% en verde. Al aprobarlas, actualizar el estado del hito en el tablero de `docs/04-codificacion.md §4`.
5. **Control de cambios:** Si durante la codificación se detecta un ajuste necesario en una regla, campo o endpoint, actualizar el documento correspondiente en `docs/` antes o junto con el código.

## 3. Invariantes Técnicas No Negociables
- **Entornos & Pooler BD:** Desarrollo (`ed_dev`) y pruebas (`ed_test`) corren localmente en **PostgreSQL vía Docker (`docker-compose.yml`)**; **Supabase** se usa para producción (BD + Storage privado `unit-pdfs` desde Hito 3 / Fase 6). Siempre usar `postgres(DATABASE_URL, { prepare: false, max: 1 })` + *singleton* dev en `globalThis`; migraciones con `npm run db:migrate` (Drizzle + `rls.sql`).
- **Route Handlers testables:** Leer `req: NextRequest` y responder con `NextResponse` (no usar `next/headers` en API routes; reservarlo para Server Components).
- **PDF & IA:** Subida/descarga solo vía Signed URLs (`unit-pdfs` privado, `25 MB`, `application/pdf`, `{ download: true }`); usar únicamente `unpdf`; salida IA en párrafos limpios validados con Zod (`parent_summary`), cero `dangerouslySetInnerHTML`.
- **Seguridad & PWA:** CSP con `nonce` + `matcher` en `src/proxy.ts` (`x-nonce` en `layout.tsx`), `public/sw.js` con *allowlist* sin `/api/*` ni `?_rsc=`, `Origin`/`Referer` en mutaciones, cero secretos con `NEXT_PUBLIC_`.
- **Fechas Chile:** Todas las reglas de domingo `<= hoy`, `MIN(created_at)` + 3 días calendario, lunes `00:01` y Cron lunes `12:00–14:00` pasan exclusivamente por `src/lib/timezone.ts` (`America/Santiago`).
