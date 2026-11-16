# Fase 4: Plan de Codificación

> **Versión:** 1.2 (Sincronizada con Fases 1–5 + Protocolo Obligatorio y Tablero de Hitos)  
> **Estado:** 🟢 Lista para inicio de código (con compuerta Hito a Hito)  
> **Basado en:** [01-analisis-y-requerimientos.md](./01-analisis-y-requerimientos.md) (`v1.5`), [02-diseno-y-arquitectura.md](./02-diseno-y-arquitectura.md) (`v1.6`), [03-seguridad.md](./03-seguridad.md) (`v1.4`) y alineado con [05-pruebas-y-qa.md](./05-pruebas-y-qa.md) (`v1.1`)  
> **Objetivo:** Definir la estructura exacta del proyecto, las dependencias mínimas necesarias, los estándares de programación y el orden paso a paso para construir la PWA sin retrabajo ni sobre-ingeniería.

---

## 1. Estructura del Proyecto

Todo vivirá en un único repositorio Next.js (`TypeScript`), manteniendo la documentación en `docs/`:

```text
Proyecto_ED/
├── docs/                                # Documentación por fases (.md)
├── public/
│   ├── icons/                           # Íconos PWA (192x192, 512x512, apple-touch-icon)
│   ├── manifest.webmanifest             # Manifiesto PWA (Naranjo ACyM #EA580C + Blanco)
│   ├── sw.js                            # Service Worker (Push + allowlist estricto sin /api/* ni ?_rsc=)
│   ├── offline.html                     # Pantalla offline estática pura (sin scripts ni datos privados)
│   └── robots.txt                       # Disallow: / (no indexar datos de menores)
├── src/
│   ├── proxy.ts                         # (Next 16, antes middleware.ts) CSP dinámica con nonce + header x-nonce + matcher (excluye estáticos) + X-Robots-Tag
│   ├── app/
│   │   ├── layout.tsx                   # Lee x-nonce (headers), Plus Jakarta Sans + metadata PWA + PresenceTracker
│   │   ├── globals.css                  # Tokens visuales Tailwind (ACyM Naranjo/Blanco)
│   │   ├── page.tsx                     # Despachador servidor por rol (/ -> Padre, /profesor/asistencia, /admin o /login)
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx           # Ingreso por RUT (saneo onPaste) + verificación OTP
│   │   │   └── onboarding/page.tsx      # Wizard 3 pasos (datos, guía PWA iOS/Android, Push no bloqueante)
│   │   ├── (protected)/
│   │   │   └── perfil/page.tsx          # Compartido (3 roles): datos/hijos, activar/desvincular Push, guía PWA y logout
│   │   ├── (parent)/
│   │   │   └── lecciones/[id]/page.tsx  # Pasaje, párrafos limpios, preguntas, modal completar/desmarcar
│   │   ├── (teacher)/                   # Layout habilitado para ['TEACHER', 'SUPER_ADMIN']
│   │   │   └── profesor/
│   │   │       ├── asistencia/page.tsx  # Toma rápida Presente/Ausente + historial (domingos, 3d MIN(created_at))
│   │   │       ├── alumnos/page.tsx     # Lista clase + ficha interna (cuidados y preferencias)
│   │   │       ├── lecciones/page.tsx   # 14 lecciones sin bloqueo + Signed Download PDF + seguimiento
│   │   │       └── resumen/page.tsx     # KPIs limpios de la clase (asistencia, apertura, completado)
│   │   ├── (admin)/                     # Layout exclusivo para ['SUPER_ADMIN']
│   │   │   └── admin/
│   │   │       ├── page.tsx             # Resumen global Super Admin + KPIs globales
│   │   │       ├── clases/page.tsx      # CRUD Clases + asignación profesores
│   │   │       ├── usuarios/page.tsx    # CRUD Profesores/Padres + onboarding + 🟢 En línea + revocar
│   │   │       ├── alumnos/page.tsx     # CRUD Niños + historial de clases + ficha interna + vínculo N:M
│   │   │       ├── unidades/page.tsx    # Signed Upload PDF + IA 1/14..14/14 + reintentar + +7/-7d + publicar
│   │   │       └── logs/page.tsx        # Visor paginado (limit <= 50) e inmutable de Auditoría
│   │   └── api/                         # Route Handlers (leen req: NextRequest y escriben en NextResponse)
│   │       ├── auth/                    # me, request-otp, verify-otp, onboarding, logout
│   │       ├── presence/ping/route.ts   # Heartbeat ~60s (solo ACTIVE, pausa tras 10m inactivo, sin audit log)
│   │       ├── push/subscribe/route.ts  # POST (UPSERT endpoint + anti-SSRF) y DELETE (desvincular)
│   │       ├── parent/                  # units, lessons/[id], lessons/[id]/complete, lessons/[id]/uncomplete
│   │       ├── teacher/                 # classes, units, students/[id], units/[id]/pdf, attendance, lessons/[id]/tracking, kpis
│   │       ├── admin/                   # users, students, classes, units (GET), units/upload-url, units/[id], units/[id]/process-pdf, postpone, unpostpone, lessons/[id], lessons/[id]/generate, kpis, audit-logs
│   │       └── cron/daily/route.ts      # Cron diario Vercel (SELECT 1 + limpieza expirados + push lunes agrupado)
│   ├── components/
│   │   ├── ui/                          # Botones, tarjetas, modales, badges (estilo moderno ACyM)
│   │   ├── layout/                      # AppHeader, BottomNav por rol, PresenceTracker (solo ACTIVE)
│   │   ├── lessons/                     # ParentHomeView, UnitAccordion, LessonCard, CompleteModal (checklist por hijo)
│   │   └── pwa/                         # InstallGuideModal (iOS Safari / Android Chrome)
│   ├── db/
│   │   ├── index.ts                     # postgres(DATABASE_URL, { prepare: false, max: 1 }) + singleton dev + Drizzle
│   │   ├── schema.ts                    # Tablas + rate_limits + student_class_history + índice parcial ACTIVE
│   │   ├── rls.sql                      # RLS idempotente en todas las tablas (aplicado vía npm run db:migrate) + bucket unit-pdfs
│   │   └── seed.ts                      # Idempotente vía env (SEED_ADMIN_RUT, SEED_ADMIN_NAME, SEED_ADMIN_EMAIL) + 1ra clase
│   └── lib/
│       ├── validators/                  # Esquemas Zod compartidos Front+Back ("" -> undefined, límites exactos)
│       ├── rut.ts                       # Wrapper @fdograph/rut-utilities (cleanRut 7..9, DASH mayúsculas, onPaste)
│       ├── auth.ts                      # OTP HMAC-SHA256 (attempts < 5), cookie __Host-/ed_session (NextRequest), requireAuth/Role, Origin
│       ├── background.ts                # Helper runInBackground() sobre waitUntil (@vercel/functions) + fallback dev
│       ├── rate-limit.ts                # Control en PostgreSQL ($0): cooldown 60s por rut_hash + límites por IP/RUT
│       ├── timezone.ts                  # Helpers America/Santiago (domingo <= hoy, 3d MIN(created_at), lunes 00:01 DST)
│       ├── audit.ts                     # recordAuditLog() con catálogo unificado (excluye presence/ping)
│       ├── email.ts                     # Envío OTP vía Resend (iglesia@5acym.cl) sin datos de menores
│       ├── storage.ts                   # Signed Upload/Download URLs ({ download: true }), check metadatos, swap seguro
│       ├── pdf.ts                       # Exclusivo unpdf: %PDF-, salto portada/índice + extracción editable en 14 borradores
│       ├── gemini.ts                    # Generación estructurada Zod (parent_summary en párrafos limpios, throttle/backoff 429)
│       ├── push.ts                      # Envío Web Push VAPID agrupado por padre + validación new URL anti-SSRF + limpieza 410
│       └── kpis.ts                      # Fórmulas explícitas de KPI Asistencia, Apertura y Refuerzo en Casa
├── next.config.ts                       # Cabeceras HTTP estáticas (HSTS, nosniff, X-Frame-Options, Referrer, Permissions)
├── tests/
│   ├── unit/                            # Pruebas unitarias Vitest (npm test — sin BD, < 1s)
│   └── integration/                     # Pruebas integración API + BD pruebas aislada (npm run test:integration, secuencial)
├── vitest.config.ts                     # Alias @ -> ./src y fileParallelism: false para integración
├── vercel.json                          # Cron diario: "0 16 * * *"
├── AGENTS.md                            # Reglas obligatorias raíz e invariantes técnicas para agentes
├── .gitignore                           # Protege .env*, .next/, node_modules/ y secretos locales
├── docker-compose.yml                   # PostgreSQL local (ed_dev para app local + ed_test aislada para QA)
├── drizzle.config.ts
├── .env.example                         # Plantilla de variables de entorno dev/prod (sin secretos reales)
└── .env.test.example                    # Plantilla de variables para BD aislada de pruebas (ed_test)
```

---

## 2. Dependencias Mínimas (Sin Bloat)

| Paquete | Rol |
| :--- | :--- |
| `next`, `react`, `react-dom`, `typescript`, `tailwindcss` | Base del framework fullstack y estilos |
| `drizzle-orm`, `postgres` *(y `drizzle-kit` en dev)* | ORM ligero tipado + driver PostgreSQL para Supabase |
| `@supabase/supabase-js` | Cliente servidor exclusivo para Signed URLs y metadatos del bucket privado `unit-pdfs` |
| `@vercel/functions` | `waitUntil` para despacho OTP en segundo plano (con fallback local en `runInBackground()`) |
| `zod` | Validación compartida Front+Back de formularios, longitudes, payloads API y salidas Gemini |
| `@fdograph/rut-utilities` | Limpieza, formateo y validación de RUT chileno (incluye rechazo de patrones sospechosos) |
| `resend` | Envío de correos OTP |
| `@google/genai` | Integración oficial gratuita con Gemini API |
| `unpdf` | Extracción de texto del PDF único de 14 lecciones compatible con Vercel Serverless (`serverExternalPackages` si aplica) |
| `web-push` *(y `@types/web-push`)* | Envío de notificaciones Web Push VAPID |
| `lucide-react` | Íconos limpios y modernos para UI móvil |
| `vitest` *(solo devDependency)* | Suite rápida de pruebas unitarias y de integración por Hito (`$0`) |

---

## 3. Estándares de Codificación y Calidad

1. **Validación estricta en la frontera y compatibilidad con Vitest:** Todos los Route Handlers API reciben `req: NextRequest` (leyendo `req.cookies` y `req.headers`) y devuelven `NextResponse` —reservando `next/headers` solo para Server Components (`layout.tsx`/`page.tsx`)— para permitir pruebas directas en Vitest sin errores de scope. Validan `Origin`/`Referer` en mutaciones (rechazando ausentes y `'null'`), UUID v4 en `:id`, paginación (`limit <= 50`) y `body` con **Zod** compartido (`"" -> undefined` en opcionales con `.min()`), devolviendo errores `500` genéricos sin exponer SQL ni stack traces.
2. **Entornos BD (Docker Local vs Supabase Producción) y RLS:**
   - **Desarrollo (`ed_dev`) y Pruebas (`ed_test`):** Corren localmente en **PostgreSQL vía `docker-compose.yml`** (misma compatibilidad SQL/RLS sin gastar cuota de Supabase).
   - **Producción (y Storage real en Hito 3 / Fase 6):** Usa **Supabase** (`Transaction Pooler` puerto `6543` + bucket privado `unit-pdfs`).
   - En todos los entornos `src/db/index.ts` usa `postgres(DATABASE_URL, { prepare: false, max: 1 })` + *singleton* en `globalThis`. El script `npm run db:migrate` ejecuta migraciones Drizzle seguidas de `src/db/rls.sql` idempotente (creando el rol `anon` si no existe localmente para validar RLS sin excepción).
3. **Guardias unificados y rechazo de `DRAFT`:**
   - Toda ruta protegida inicia con `requireAuth({ allowedRoles, allowOnboarding })`.
   - `GET /api/parent/lessons/:id`, `POST /api/parent/lessons/:id/complete` y `POST /api/parent/lessons/:id/uncomplete` reutilizan el mismo guard único (exigiendo padre y >=1 hijo `ACTIVE`, **`units.status IN ('ACTIVE', 'FINISHED')`** y lección desbloqueada; `403` si no cumple).
   - `TEACHER` valida igualmente **`units.status IN ('ACTIVE', 'FINISHED')`** y membresía vigente en `students.class_id` o `student_class_history` al tomar/corregir asistencia.
4. **Fechas siempre en UTC en BD, reglas en `America/Santiago`:** Un único módulo `src/lib/timezone.ts` calcula: domingo `<= hoy`, ancla **`MIN(created_at)`** por `(class_id, attendance_date)` para la ventana de **3 días calendario**, `inicio_lunes_00_00_chile`, `domingo_semana_en_curso` y recálculo exacto de `unlock_at` desde `class_sunday_date` en `postpone`/`unpostpone` (seguro ante cambios de horario CLT/CLST).
5. **Seguridad de contenido, CSP y SW:** `parent_summary` se almacena como array de `1..20` párrafos (suma `50..2.500` chars) sin Markdown crudo y se renderiza como `<p>` limpio (prohibido `dangerouslySetInnerHTML`); `proxy.ts` (convención Next 16 que reemplaza a `middleware.ts`, runtime Node) excluye estáticos mediante `matcher`, inyecta `x-nonce` (leído en `layout.tsx`) y emite CSP con nonce dinámico (`script-src` sin `'unsafe-inline'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`); `public/sw.js` usa *allowlist* estricto sin cachear `/api/*` ni `?_rsc=`, apoyado en `public/offline.html`.
6. **Auditoría sin saturación y PDFs sin pasar por Vercel Body:** Toda mutación/vista/descarga relevante invoca `recordAuditLog(...)` con el catálogo unificado (excluyendo `POST /api/presence/ping`). Los PDFs hasta **25 MB** suben/bajan vía Signed URLs contra Supabase Storage (con topes en el bucket y reemplazo seguro diferido tras validar en `process-pdf`).
7. **UX Moderna *Mobile-First*:** Diseño limpio blanco/naranjo ACyM (`#EA580C`), skeletons de carga, ergonomía táctil (`min-h-11`), feedback inmediato y modales accesibles.

---

## 4. Plan de Desarrollo por Hitos (Sprints)

### Protocolo Obligatorio por Hito (Compuerta Anti-Desviación)
Para garantizar que el desarrollo siga exactamente lo diseñado en las Fases 1 a 5 sin atajos ni saltos:
1. **Lectura previa del Hito `N`:** Antes de escribir código del hito, consultar obligatoriamente las secciones mapeadas abajo en `01`, `02`, `03`, `04` y `05`.
2. **Alcance estricto:** Codificar únicamente los módulos del **Hito `N`** respetando las invariantes de [AGENTS.md](../AGENTS.md) y §3.
3. **Pruebas en paralelo:** Escribir y ejecutar las pruebas unitarias (`npm test`) y de integración (`npm run test:integration`) exigidas para el **Hito `N`** en [05-pruebas-y-qa.md](./05-pruebas-y-qa.md).
4. **Cierre bloqueante:** **No iniciar el Hito `N+1`** hasta que el 100% de las pruebas del Hito `N` pasen en verde y se actualice su estado a ✅ en el tablero siguiente.

### Tablero de Seguimiento y Consulta Obligatoria por Hito

| Hito | Estado | Secciones obligatorias a consultar antes de codificar | Cierre obligatorio (`05`) |
| :--- | :---: | :--- | :--- |
| **Hito 0** — Base, BD Docker y RLS | ✅ Completado | `01` RF-01 · `02` §1, §3, §5.1 · `03` §5, §6.1, §6.2 · `04` §3 | `db:migrate` en Docker (`ed_dev`/`ed_test`) + `rowsecurity = true` + test RLS `anon` + `seed` + CSP nonce |
| **Hito 1** — Auth, Ruteo `/` y Presencia | ⚪ Pendiente | `01` RF-01..05, RF-10 · `02` §2.3, §4.1, §6 · `03` §3, §6.5, §7 (`Auth`) · `04` §3 | `rut.test.ts` + `validators.test.ts` + integración Auth/OTP/Origin/Presencia |
| **Hito 2** — Admin Clases/Usuarios/Niños/Logs | ⚪ Pendiente | `01` RF-06..10, RF-26..27 · `02` §3, §5.2 C, §6 · `03` §3.3, §4.3, §7, §8 · `04` §3 | Integración Admin (`409`, `student_class_history`, baja `INACTIVE`, logs `<= 50`) |
| **Hito 3** — PDF 25 MB, IA, DST y Descarga Prof. | ⚪ Pendiente | `01` RF-11..18 · `02` §2.4, §4.2, §4.4, §6 · `03` §5.2, §6.3, §7 (`Unidad`/`Lección`) · `04` §3 | `pdf-gemini-push-kpi.test.ts` + integración PDF/IA/Calendario/`LESSON_AI_GENERATE` |
| **Hito 4** — Experiencia Padres | ⚪ Pendiente | `01` RF-15..22 · `02` §4.5, §5.1–5.2 A, §6 · `03` §4.1 (`PARENT`) · `04` §3 | Integración RBAC Padres (`403` `DRAFT`/bloqueada/sin hijos `ACTIVE`, modal hijos) |
| **Hito 5** — Módulo Profesor y KPIs | ⚪ Pendiente | `01` RF-14, RF-23..25 · `02` §4.3, §4.5, §5.2 B, §6 · `03` §4.2 (`TEACHER`), §7 (`Asistencia`) | `timezone.test.ts` (DST + `MIN(created_at)`) + IDOR `TEACHER` + traslados |
| **Hito 6** — PWA Final, Push y Cron | ⚪ Pendiente | `01` RF-19 · `02` §4.4, §6 · `03` §6.2, §6.4 · `04` §3 | Integración Cron/Push (`410`, agrupación, SSRF) + Checklist Móvil `E2E-01..05` |

### Acciones Manuales del Usuario (Guiadas Paso a Paso)
Lo que requiere cuentas externas, secretos o DNS fuera del código se ejecuta con guía clic a clic en el momento exacto:
- **Hito 0:** Abrir **Docker Desktop** y confirmar si crearás repositorio privado en **GitHub** (el agente ejecuta `git init` + `.gitignore` antes de crear archivos).
- **Hito 1:** Ninguna cuenta externa obligatoria en local (fallback consola OTP). *(Opcional si deseas correo real temprano: cuenta Resend).*
- **Hito 3:** Obtener **`GEMINI_API_KEY`** (Google AI Studio) y crear proyecto gratuito en **Supabase** + bucket privado **`unit-pdfs`** (`25 MB`, `application/pdf`).
- **Hito 6 / Fase 6 ([06-implementacion-y-despliegue.md](./06-implementacion-y-despliegue.md)):** Preparar **BD de producción en Supabase** (`db:migrate` + `seed` real), cuenta **Resend** + registros DNS (`SPF`/`DKIM`/`DMARC`) en **`5acym.cl`**, llaves `VAPID`/`CRON_SECRET`/`OTP_PEPPER` y despliegue en **Vercel Hobby**.

### Hito 0 — Base del Proyecto, Git, BD Local Docker y RLS
- Inicializar repositorio Git (`git init`) y crear **`.gitignore`** estricto (bloqueando `.env`, `.env*.local`, `.env.test`, `node_modules/`, `.next/`) antes del primer código para evitar fuga de secretos.
- Inicializar proyecto Next.js (App Router, TypeScript, Tailwind CSS), configurar `vitest.config.ts` (alias `@ -> ./src`, scripts `npm test` para unitarias y `npm run test:integration` con `fileParallelism: false` sobre BD aislada `ed_test`), tokens ACyM, fuente `Plus Jakarta Sans`, `public/offline.html`, `next.config.ts` (cabeceras estáticas) y `src/proxy.ts` (CSP con *nonce* + `x-nonce` leído en `layout.tsx` + `matcher` excluyendo estáticos + `X-Robots-Tag`).
- Levantar entorno PostgreSQL local con **`docker-compose.yml`** creando dos bases aisladas: **`ed_dev`** (desarrollo manual) y **`ed_test`** (pruebas automatizadas).
- Configurar Drizzle: `src/db/index.ts` con `postgres(DATABASE_URL, { prepare: false, max: 1 })` + *singleton* en `globalThis`; definir `src/db/schema.ts` completo (`users`, `otp_codes`, `rate_limits`, `sessions`, `push_subscriptions`, `classes`, `class_teachers` con PK compuesta, `students`, `student_class_history`, `parent_students` con PK compuesta, `units` con `pdf_storage_key` nullable en `DRAFT` e índice único parcial `(class_id) WHERE status = 'ACTIVE'`, `lessons` con columnas `DRAFT` nullables y `FORCE_LOCKED`, `lesson_views`, `lesson_completions`, `attendance_records` con `created_at`, `audit_logs`); unificar migración + `rls.sql` idempotente (incluyendo creación segura del rol `anon` si no existe localmente) en `npm run db:migrate`.
- Crear script idempotente `src/db/seed.ts` leyendo `SEED_ADMIN_RUT`, `SEED_ADMIN_NAME` y `SEED_ADMIN_EMAIL` desde variables de entorno (sin datos personales en Git) para dar de alta al **Super Admin inicial** y la primera clase.
- **Entregable verificable:** Proyecto corriendo en local conectado a PostgreSQL Docker (`ed_dev` y `ed_test`), RLS activo (`rowsecurity = true` y denegación al rol `anon`), CSP con nonce, `vitest` operativo y Super Admin creado vía `seed`.

### Hito 1 — Autenticación (RUT + OTP + 30 días), Onboarding, Ruteo Inicial y Presencia
- Implementar `src/lib/rut.ts` (validación `7..9` tras `cleanRut()`, normalización `DASH` en mayúsculas, saneo de espacios en `onPaste` UI), `rate-limit.ts` (cooldown 60s por `rut_hash` sin enumeración + límites por IP/RUT), `background.ts` (`runInBackground()` sobre `waitUntil` con fallback local), `email.ts` (Resend en prod/staging y log seguro en consola solo cuando falta `RESEND_API_KEY` en dev local) y `auth.ts` (`HMAC-SHA256`, verificación SQL atómica con `attempts < 5`, cookie `__Host-ed_session` + fallback `ed_session` en HTTP local vía `NextRequest`/`NextResponse`, guard `Origin`/`Referer`).
- Implementar `GET /api/auth/me`, `POST /api/auth/request-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/onboarding` y `POST /api/auth/logout` (desvinculando Push del navegador).
- Construir `src/app/page.tsx` como despachador servidor por rol (`PARENT` $\rightarrow$ `ParentHomeView`; `TEACHER` $\rightarrow$ `/profesor/asistencia`; `SUPER_ADMIN` $\rightarrow$ `/admin`; sin sesión $\rightarrow$ `/login`), pantallas `/login`, `/onboarding` (wizard 3 pasos; iOS no bloqueante) y ruta compartida `(protected)/perfil/page.tsx` accesible para los 3 roles.
- Implementar `POST /api/presence/ping` + `PresenceTracker` (solo activo cuando `user.status === 'ACTIVE'`, pausa tras 10 min de inactividad, sin `audit_logs`).
- **Entregable verificable:** Flujo completo de login real con correo OTP sin enumeración, ruteo automático según rol desde `/`, `/perfil` compartido, cookie 30 días y registro en `audit_logs`.

### Hito 2 — Módulo Super Admin: Clases, Usuarios, Niños y Auditoría
- Construir CRUD `/admin/clases`, `/admin/usuarios` (badges `Pendiente`/`Activo`/`Inactivo`, indicador 🟢 `En línea`, botón revocar sesiones; tanto al cambiar correo como al desactivar usuario a `INACTIVE`, revoca sesiones activas e invalida OTPs pendientes) y `/admin/alumnos` (vínculo N:M con padres, ficha interna de cuidados/alergias y preferencias, registro inicial y traslados en `student_class_history`, baja lógica conservando historial).
- Construir visor `/admin/logs` (`GET /api/admin/audit-logs` paginado `limit <= 50` con catálogo unificado) y dashboard `/admin` (`GET /api/admin/kpis`).
- **Entregable verificable:** Puedes crear clases, profesores, padres, niños con historial de clases, desactivar usuarios cortando sesiones/OTPs al instante y revisar cada movimiento en Logs.

### Hito 3 — Motor PDF (hasta 25 MB, 14 Lecciones) + IA + Calendario + Descarga Profesor
- Conectar Storage privado: configurar proyecto gratuito **Supabase** con bucket privado **`unit-pdfs`** (`file_size_limit = 26214400` / `25 MB` y `allowed_mime_types = ['application/pdf']`) para Signed Upload/Download URLs reales (o usar *double* Storage en tests automatizados locales).
- Implementar listado `GET /api/admin/units` (`src/app/api/admin/units/route.ts`) y subida privada en dos pasos sin pasar el archivo por Vercel (`4.5 MB` límite): `POST /api/admin/units/upload-url` (crea `DRAFT` con `pdf_storage_key = NULL` o nueva ruta de reemplazo sin borrar la previa) + `POST /api/admin/units/:id/process-pdf` (chequeo de metadatos `<= 25 MB` antes de descargar, magic bytes `%PDF-`, extracción exclusivamente con **`unpdf`** saltando portada/índice inicial + aviso si es PDF escaneado, generación de 14 borradores editables manualmente, swap seguro de `pdf_storage_key` y limpieza del PDF anterior).
- Implementar generación IA secuencial `1/14..14/14` (`POST /api/admin/lessons/:id/generate`) con pausa 4–5s, backoff ante `429`, botón **"Reintentar fallidas"**, registro obligatorio de **`recordAuditLog('LESSON_AI_GENERATE', ...)`** y validación Zod de `parent_summary` (`1..20` párrafos limpios, suma `50..2.500` chars).
- Construir `/admin/unidades`: editor por lección (incluyendo corrección manual de texto/cortes previo a IA), compuerta de publicación `PATCH /api/admin/units/:id` hacia `ACTIVE` (exige `pdf_storage_key` y las 14 lecciones completas; marca `push_sent = true` en pasadas), `DELETE` borrador limpiando Storage, `postpone` (`+7 días` con `fromLessonNumber`, soportando lunes por la mañana antes de Push), `unpostpone` (`-7 días` con guarda `409` vs lección previa y `>= domingo_semana_en_curso` si `fromLessonNumber === 1`), y cambios manuales (`FORCE_UNLOCKED`/`FORCE_LOCKED`).
- Implementar descarga segura `GET /api/teacher/units/:id/pdf` (solo `ACTIVE`/`FINISHED`, entrega Signed Download URL `{ download: true }` de 60s + `PDF_DOWNLOAD`).
- **Entregable verificable:** Subes el PDF real hasta 25 MB, `unpdf` extrae sin chocar en el índice, se generan párrafos/preguntas auditando `LESSON_AI_GENERATE`, publicas, reprogramas `+7/-7 días` sin desfases DST y el profesor descarga el PDF incluso en iOS *standalone*.

### Hito 4 — Experiencia Padres (Acordeón, Visto y Completado)
- Construir vista padre en `src/app/page.tsx` (`GET /api/parent/units`): requiere cuenta y >=1 hijo `ACTIVE` (si tiene `0` hijos `ACTIVE`, `/api/parent/*` devuelve `403 Forbidden` y la UI muestra aviso claro usando `GET /api/auth/me` con acceso a `/perfil`); selector de clase/hijo + acordeón de unidades `ACTIVE` y `FINISHED` históricas (`student_class_history`, nunca `DRAFT`).
- Construir `/lecciones/[id]`: guard compartido de autorización para `GET /api/parent/lessons/:id`, `POST /api/parent/lessons/:id/complete` y `POST /api/parent/lessons/:id/uncomplete` (`ACTIVE`/`FINISHED` + desbloqueada; `403` si `DRAFT`/`PAUSED`/`FORCE_LOCKED`/futura), registro individual `lesson_views` (`first_viewed_at` fijo en 2da vista), render limpio `<p>` de `parent_summary`, y `CompleteModal` con checklist por hijo cuando hay >1 hijo en la misma clase.
- **Entregable verificable:** Padre A abre lección (Visto individual) y marca completado eligiendo hijo(s) $\rightarrow$ Padre B la ve completada por A; lecciones futuras/pausadas/draft devuelven `403` en lectura y en `complete`/`uncomplete`.

### Hito 5 — Módulo Profesor (Asistencia 3 días, Ficha Niño y KPIs)
- Habilitar `['TEACHER', 'SUPER_ADMIN']` en layout `(teacher)` y construir `/profesor/asistencia`: solo domingos (`<= hoy` en `America/Santiago`), permite crear asistencia olvidada de domingos sin registro previo, y **ancla la ventana de 3 días calendario en `MIN(created_at)` por `(class_id, attendance_date)`** (aceptando alumnos trasladados recientemente dentro de los 3 días vía `student_class_history`, bloqueando al resto tras el 3er día para `TEACHER` y habilitado sin límite para `SUPER_ADMIN`).
- Construir `/profesor/alumnos` (ficha interna de cuidados y preferencias).
- Construir `/profesor/lecciones` (`GET /api/teacher/units` excluyendo `DRAFT`, 14 lecciones sin bloqueo semanal + descarga PDF `{ download: true }` + seguimiento de padres) y `/profesor/resumen` (`GET /api/teacher/kpis` con fórmulas exactas).
- **Entregable verificable:** Profesor y Super Admin toman asistencia respetando domingos, `MIN(created_at)` y traslados, con IDOR horizontal cerrado en todas las rutas `/api/teacher/*`.

### Hito 6 — PWA Final, Web Push y Cron Diario Vercel
- Configurar `public/manifest.webmanifest`, íconos ACyM naranjo/blanco y `public/sw.js` (*allowlist* estricto solo para shell estática pública —nunca `/api/*`, `?_rsc=` ni `RSC: 1`— más eventos `push` y `notificationclick`).
- Implementar `POST /api/push/subscribe` (`UPSERT` por `endpoint` + validación anti-SSRF con `new URL`) y `DELETE /api/push/subscribe` (desde Perfil y Logout).
- Implementar `GET /api/cron/daily` protegido con `CRON_SECRET` (`crypto.timingSafeEqual`) y `vercel.json` (`0 16 * * *` UTC): todos los días ejecuta `SELECT 1` + limpieza de `otp_codes`/`rate_limits`/`sessions` expirados, y los lunes en ventana `12:00–14:00` Chile envía máximo 1 Web Push agrupado por padre (`unlock_at >= inicio_lunes_00_00_chile AND unlock_at <= now()`, `units.status = 'ACTIVE'`, padres/hijos `ACTIVE`, limpieza de `410 Gone`).
- **Entregable verificable:** PWA instalable en Android e iOS sin cacheo indebido de RSC/datos privados, recibiendo Push agrupado del lunes y ejecutando mantenimiento diario.

---

## 5. Ejecución y Siguiente Fase

Las pruebas definidas en **Fase 5 ([05-pruebas-y-qa.md](./05-pruebas-y-qa.md) `v1.1`)** se codifican y ejecutan en paralelo al cierre de cada hito (`Hito 0` a `Hito 6`). Al completar el **Hito 6**, se redactará y ejecutará contigo paso a paso la **Fase 6: Implementación y Despliegue (`06-implementacion-y-despliegue.md`)**: creación/migración de **BD Supabase de producción**, configuración de **Resend + DNS (`SPF`/`DKIM`/`DMARC`) en `5acym.cl`**, generación de llaves `VAPID`/`CRON_SECRET`/`OTP_PEPPER`, alta en **Vercel Hobby**, respaldos y salida a producción.
