# Fase 5: Pruebas y Calidad (QA)

> **Versión:** 1.1 (Plan y Matriz de Pruebas — Ajustado tras auditoría QA Fases 4–5)  
> **Estado:** 🟡 Lista para revisión antes de codificar  
> **Basado en:** [01-analisis-y-requerimientos.md](./01-analisis-y-requerimientos.md) (`v1.5`), [02-diseno-y-arquitectura.md](./02-diseno-y-arquitectura.md) (`v1.6`), [03-seguridad.md](./03-seguridad.md) (`v1.4`) y [04-codificacion.md](./04-codificacion.md) (`v1.1`)  
> **Objetivo:** Definir la estrategia de pruebas automatizadas y manuales (`$0`, alto retorno sobre riesgo) que se ejecutará **en paralelo durante cada Hito** de la Fase 4 y en la validación final de PWA en Android e iOS.

---

## 1. Estrategia de Pruebas y Criterios de Riesgo (`$0 / mes`)

Para maximizar confiabilidad sin agregar infraestructura pesada ni sobre-ingeniería, cada módulo se prueba según su nivel de riesgo real:

| Tipo de Prueba | Alcance y cuándo aplica (Decision Gates) | Tamaño Google | Herramienta (`$0`) | Se ejecuta en |
| :--- | :--- | :---: | :--- | :--- |
| **Unitarias** | Lógica pura crítica: RUT (`@fdograph/rut-utilities`), esquemas **Zod**, `America/Santiago` + DST + ventana 3 días, `%PDF-`, sanitización `gemini.ts`, anti-SSRF `new URL`, `Origin` y fórmulas KPIs. | `Small` (< 100ms) | **Vitest** (`npm test`, solo `tests/unit/`, sin BD) | En paralelo desde **Hito 0–1** |
| **Integración (API + BD)** | Route Handlers (`req: NextRequest` / `NextResponse`) con PostgreSQL/Drizzle aislado: RLS `anon`, concurrencia OTP (`attempts < 5`), rate limits IP/RUT, RBAC (`PARENT`/`TEACHER`/`SUPER_ADMIN`), `DRAFT`, `MIN(created_at)`, `student_class_history`, `Origin`, Cron. | `Medium` (< 1s) | **Vitest** (`npm run test:integration`, **`fileParallelism: false`**, alias `@ -> ./src`) | En paralelo al cerrar cada **Hito 0–6** |
| **Smoke HTTP & Seguridad** | Cabeceras CSP con *nonce*, `next.config.ts`, `X-Robots-Tag`, `GET /robots.txt`, caché Service Worker (`public/sw.js` + `offline.html`), límites del bucket `unit-pdfs` y `/api/cron/daily`. | `Medium / Large` | `curl` / DevTools + ambiente **Vercel/Supabase dev** | **Hito 0**, **Hito 3** y **Hito 6** |
| **E2E Manual Móvil (PWA)** | Instalación en pantalla de inicio Android Chrome / iOS Safari (`!standalone` no bloqueante), ruteo `/` por rol, `/perfil` compartido, Push lunes, descarga PDF `{ download: true }` y pegado de RUT en celular. | `Large` | **Celulares reales** Android + iPhone (Checklist §4) | Cierre de **Hito 1**, **Hito 4** y **Hito 6** |

> **Aislamiento de BD de Pruebas (`QA45-06`, `QA45-07`):** En desarrollo y QA automatizado se utiliza **PostgreSQL local vía Docker (`docker-compose.yml`)** con dos bases separadas (`ed_dev` para uso manual y `ed_test` exclusiva para `npm run test:integration`), reservando **Supabase** para Storage en Hito 3 y despliegue productivo. Las pruebas corren secuencialmente (`fileParallelism: false`) con `TRUNCATE ... CASCADE` entre suites y llaman directamente a los handlers (`NextRequest`/`NextResponse`) evitando `next/headers`.

### Exclusiones Deliberadas (Sin Bloat ni Costos Extra)
- **Sin Contract Testing (`Pact`):** El frontend PWA y los Route Handlers viven y se despliegan juntos en el mismo proyecto Next.js; TypeScript + esquemas Zod compartidos evitan descalces sin mantener un broker externo.
- **Sin suite Playwright/Cypress en CI en el MVP:** Los flujos críticos de negocio/seguridad quedan cubiertos con pruebas de integración HTTP+BD en Vitest (más rápidas y sin falsos fallos), complementadas por el protocolo manual en dispositivos reales Android/iOS para lo que solo un celular real valida (`PushManager`, *standalone* Safari iOS, descarga PDF).
- **Sin Property-Based Testing (`fast-check`):** Las reglas finitas de RUT, longitudes Zod, estados de lección y fechas dominicales quedan cubiertas de forma determinista con Partición de Equivalencia (EP), Análisis de Valores Límite (`B-1 / B / B+1`) y Tablas de Decisión.

---

## 2. Casos de Pruebas Unitarias (`tests/unit/`, Vitest)

> **Convención:** Cuando 3 o más casos comparten el mismo setup y aserción (ej. BVA de largos o fechas DST), implementar como **table-driven tests** (`it.each` / bucle `for...of`) con nombre descriptivo por fila.

### 2.1. Validación y Normalización de RUT (`src/lib/rut.ts`)
*Archivo de prueba:* `tests/unit/rut.test.ts` — **Criticidad:** `HIGH`

| Técnica | Caso de prueba | Entrada | Resultado esperado |
| :--- | :--- | :--- | :--- |
| **BVA (`7..9` limpio)** | Menor al mínimo (`6` chars limpios, DV Mod 11 válido) | `"12.345-5"` *(6 caracteres tras `cleanRut()`)* | Inválido (`400` / error de longitud, no por DV) |
| **BVA (`7..9` limpio)** | RUT real `< 1.000.000` (`7` chars limpios, DV Mod 11 válido) | `"987.654-5"` | Válido $\rightarrow$ almacenado `DASH` mayúsculas (`987654-5`) |
| **EP** | RUT estándar `9` chars limpios + `k` minúscula (DV Mod 11 válido) | `"12.345.670-k"` | Válido $\rightarrow$ normalizado `DASH` con mayúscula (`12345670-K`) |
| **BVA (`7..9` limpio)** | Excede máximo (`10` chars limpios, DV Mod 11 válido) | `"123.456.789-2"` | Inválido (`> 9` chars limpios) |
| **EP (Patrón sospechoso)** | Dígitos repetidos rechazados por librería | `"11.111.111-1"`, `"22.222.222-2"` | Inválido (`validateRut(rut, true)` = `false`) |
| **EP (`QA4-04` Pegado UI)** | Helper de saneo de input al pegar con espacios (DV Mod 11 válido) | `"  12.345.678-5  "` *(>12 chars con espacios)* | Limpia espacios antes de recortar, conserva el `-5` y formatea `"12.345.678-5"` |

### 2.2. Esquemas Zod Compartidos (`src/lib/validators/`)
*Archivo de prueba:* `tests/unit/validators.test.ts` — **Criticidad:** `HIGH`

- **Nombres (`Usuario` / `Alumno` — mín. `3`, máx. `80`):**
  - BVA: `2` chars $\rightarrow$ falla; `3` chars $\rightarrow$ OK; `80` chars $\rightarrow$ OK; `81` chars $\rightarrow$ falla.
  - EP Unicode/seguridad: `"María José Ñancupil O'Connor"`, `"Ana-Lucía Pérez"` $\rightarrow$ OK (`\p{L}`, espacios, `-`, `'`, `’`); `"   "` (solo espacios) $\rightarrow$ falla; `"Juan2"`, `"Pedro 😀"`, `"<b>Ana</b>"` $\rightarrow$ falla.
- **Opcionales con `.min()` (`Teléfono 8..15`, `Parentesco 2..30`, `Rango edad 2..80`):**
  - `""` y `"   "` $\rightarrow$ preprocesado a `undefined` (pasa sin error de mínimo); `"123"` en teléfono $\rightarrow$ falla (`< 8`); `"+56912345678"` $\rightarrow$ OK.
- **`parent_summary` (`QA2-03` — `1..20` párrafos, suma `50..2.500` chars):**
  - `[]` (0 párrafos) $\rightarrow$ falla; `["   "]` $\rightarrow$ falla; `1` párrafo de `49` chars (B-1) $\rightarrow$ falla; `1` párrafo de `50` chars (B) $\rightarrow$ OK; `2` párrafos de `25 + 25` chars $\rightarrow$ OK; `20` párrafos sumando `2.500` chars (B) $\rightarrow$ OK; suma `2.501` chars (B+1) $\rightarrow$ falla; `21` párrafos válidos (B+1) $\rightarrow$ falla.
- **Preguntas de refuerzo (`2..5` ítems, `10..280` chars c/u):** BVA en cantidad (`1`/`2`/`5`/`6`) y en largo por ítem (`9`/`10`/`280`/`281`).
- **Parámetros `:id` y paginación:** UUID v4 válido $\rightarrow$ OK; `"123"` o SQLi string $\rightarrow$ falla; paginación `limit = 50` $\rightarrow$ OK, `limit = 51` $\rightarrow$ falla.
- **Observación asistencia (`0..200`), cuidados (`0..300`), preferencias (`<= 10` tags `<= 30` chars c/u):** BVA en límite exacto (`B` y `B+1`).

### 2.3. Zona Horaria `America/Santiago`, DST y Ventanas (`src/lib/timezone.ts`)
*Archivo de prueba:* `tests/unit/timezone.test.ts` — **Criticidad:** `HIGH` *(máxima prioridad por historial de bugs en DST y asistencia)*

- **Cálculo de `unlock_at` (`lunes 00:01 America/Santiago -> UTC`):**
  - Horario invierno estándar (`CLT UTC-4`, ej. junio): domingo `D` $\rightarrow$ `unlock_at` equivale exactamente a lunes `D+1` `04:01:00Z`.
  - Horario verano estándar (`CLST UTC-3`, ej. enero): domingo `D` $\rightarrow$ `unlock_at` equivale exactamente a lunes `D+1` `03:01:00Z`.
  - **Cruce cambio de hora CLT $\rightarrow$ CLST (primera semana septiembre, sábado noche +1h):** domingo siguiente recalculado con `class_sunday_date + 1 día 00:01` resulta en `03:01:00Z` (siempre `00:01` local, nunca `01:01` local).
  - **Cruce cambio de hora CLST $\rightarrow$ CLT (primera semana abril, sábado noche -1h):** `unlock_at` resulta en `04:01:00Z` (siempre `00:01` local, nunca `23:01` del domingo).
- **Reprogramación `+7 / -7 días` (`postpone` / `unpostpone`):**
  - Desplazar `class_sunday_date` en ±7 días calendario a través de fin de semana de cambio de hora DST mantiene `unlock_at` fijo en **`00:01` hora Chile**.
  - Búsqueda de inicio de lunes en `America/Santiago` (`inicio_lunes_00_00_chile`): `domingo 23:59 Chile` pertenece al domingo anterior; `lunes 00:01 Chile` ya pertenece al lunes actual; el lunes a las `16:00Z` / `17:00Z` (ventana cron `0 16 * * *` UTC) detecta `isMondayInSantiago === true`.
- **Validación de fecha dominical (`attendance_date`):**
  - Tabla de decisión: domingo pasado $\rightarrow$ OK; domingo hoy (`America/Santiago`) $\rightarrow$ OK; lunes–sábado $\rightarrow$ rechazado; domingo futuro $\rightarrow$ rechazado; edge `23:30 Chile` del domingo (ya es lunes `02:30Z`/`03:30Z` en UTC!) sigue siendo **domingo hoy** en `America/Santiago`.
- **Ventana de 3 días calendario desde `MIN(created_at)` (`QA-16`, `QA2-04`):**
  - Suponga `MIN(created_at)` = martes `2026-05-05 18:00 Chile`:
    - BVA día `+3` límite superior: viernes `2026-05-08 23:59 Chile` (`fecha_hoy === fecha_creacion + 3`) $\rightarrow$ **Permitido para `TEACHER`**.
    - BVA día `+4` límite inferior: sábado `2026-05-09 00:01 Chile` (`fecha_hoy === fecha_creacion + 4`) $\rightarrow$ **Bloqueado (`403`) para `TEACHER`**, **Permitido para `SUPER_ADMIN`**.
    - Caso creado cerca de medianoche (`23:55 Chile`): cuenta por **fecha calendario** en `America/Santiago`, no por `72 * 3600s`, incluso cruzando transición DST de 23h/25h.
- **Guarda `unpostpone` para `fromLessonNumber === 1` (`QA4-03`):**
  - El lunes `09:00 AM`, `domingo_semana_en_curso` es ayer domingo: si Lesson 1 había sido corrida +7d al próximo domingo, `-7d` vuelve a ayer domingo ($\ge$ `domingo_semana_en_curso`) $\rightarrow$ **OK**; un segundo `-7d` hacia hace 8 días $\rightarrow$ **Rechazado (`409`)**.

### 2.4. Utilidades de Seguridad, PDF, Gemini, Push y KPIs
*Archivos de prueba:* `tests/unit/security-utils.test.ts`, `tests/unit/pdf-gemini-push-kpi.test.ts` — **Criticidad:** `HIGH`

- **`Origin` / `Referer` (`auth.ts`):** Mismo origen exacto que `APP_URL` $\rightarrow$ OK; `Origin` ausente sin `Referer` válido $\rightarrow$ `403`; `Origin: null` $\rightarrow$ `403`; `Origin: https://evil-5acym.cl` $\rightarrow$ `403`; exención explícita únicamente para `/api/cron/daily`.
- **Anti-SSRF Web Push (`push.ts`):**
  - Acepta: `https://fcm.googleapis.com/fcm/send/...`, `https://web.push.apple.com/...`, `https://updates.push.services.mozilla.com/...`, `https://wns2-bl2p.notify.windows.com/...`.
  - Rechaza (`400`): `http://fcm.googleapis.com/...` (no HTTPS), `https://127.0.0.1/...`, `https://169.254.169.254/...`, `https://fcm.googleapis.com.attacker.com/...`, `https://attacker.com/?target=fcm.googleapis.com`, puertos no estándar o credenciales en URL.
- **PDF (`pdf.ts`):** Buffer iniciando en `%PDF-1.7` $\rightarrow$ OK; archivo `.exe` o HTML renombrado a `.pdf` $\rightarrow$ falla; extracción sobre texto que contiene portada e **índice inicial con "Lección 1..14"** salta la tabla de contenido y parte en los títulos reales; extracción vacía (`""` / solo saltos) en PDF escaneado retorna estado controlado `{ scannedWarning: true, drafts: [...] }` sin excepción.
- **Gemini (`gemini.ts` — `QA45-12`):** Respuesta mockeada con `<script>`, Markdown crudo (`**negrita**`) o JSON malformado es rechazada o saneada por el parser + Zod antes de persistir; ante HTTP `429` ejecuta backoff/reintento sin corromper ni perder lecciones ya generadas.
- **KPIs (`kpis.ts`):** `0` evaluados retorna `0` (nunca `NaN`/`Infinity`); semanas pausadas sin asistencia no distorsionan denominador; alumno sin padres vinculados no infla denominador de `Refuerzo en Casa`; padres `INACTIVE` no inflan denominador de `Apertura`.

---

## 3. Casos de Pruebas de Integración (`tests/integration/`, Vitest + API + PostgreSQL)

> **Entorno:** BD PostgreSQL aislada `ed_test` (Docker local vía `docker-compose.yml`) con `npm run db:migrate` aplicado, ejecución secuencial (`fileParallelism: false`), invocación directa a handlers (`NextRequest`/`NextResponse`) y *doubles* únicamente para servicios externos de red (Resend, Gemini, Web Push transport, Supabase Storage HTTP en tests).

### Hito 0 — Base de Datos, RLS e Idempotencia de `seed.ts`
1. **Verificación RLS en esquema (`QA45-08`, `QA45-09`):** Consulta sobre `pg_tables WHERE schemaname = 'public'` confirma `rowsecurity = true` en **100% de las tablas** tras `npm run db:migrate`.
2. **Bloqueo real al rol anónimo (`QA45-09`):** En Docker local se valida ejecutando consultas de lectura/escritura bajo `SET LOCAL ROLE anon` sobre `users`, `students`, `otp_codes`, `sessions` y `audit_logs` esperando denegación o `0` filas (y se repite contra `NEXT_PUBLIC_SUPABASE_ANON_KEY` vía `@supabase/supabase-js` al conectar Supabase en Hito 3 / Fase 6).
3. **Idempotencia `seed.ts` (`QA45-13`):** Ejecutar `seed.ts` dos veces consecutivas con `SEED_ADMIN_*` crea exactamente 1 Super Admin y 1 clase inicial sin error ni duplicación.

### Hito 1 — Auth (RUT + OTP + Sesión 30 días + `Origin` + Presencia)
1. **Anti-enumeración, cooldown y rate limit IP/RUT (`QA-12`, `QA45-11`):**
   - `POST /api/auth/request-otp` con RUT inexistente, RUT `INACTIVE` y RUT `ACTIVE` devuelven siempre `200 OK` con payload idéntico; segundo intento antes de `60s` respeta cooldown en `rate_limits` sin enviar segundo correo; `6ta` solicitud de mismo RUT en `< 15m` bloquea envío.
   - **Rate limits por IP:** `16va` solicitud OTP desde misma IP en `< 15m` y `11vo` intento fallido de `verify-otp` desde misma IP en `< 15m` quedan bloqueados por `rate_limits`.
2. **Atomicidad y fuerza bruta OTP (`QA-10`, `QA-11`):**
   - `verify-otp` con código erróneo incrementa `attempts` hasta `5`; al 5to fallo el código queda bloqueado incluso si el 6to intento envía el OTP correcto.
   - **Test de *Race Condition*:** `await Promise.all([verifyOtp(code), verifyOtp(code)])` con OTP válido $\rightarrow$ **exactamente 1** devuelve `200 OK` con cookie de sesión y **1** devuelve fallo (`401`/`400`), existiendo solo 1 fila en `sessions` con `used_at` marcado.
   - Al solicitar un nuevo OTP, cualquier OTP previo del usuario queda marcado con `used_at` (inválido).
3. **Validación `Origin` en Route Handlers (`QA45-12`):** `POST` real a mutaciones (ej. `/api/auth/logout`, `/api/push/subscribe`) sin header `Origin`, con `Origin: null` o desde `https://tercero.cl` devuelve `403 Forbidden`; `/api/cron/daily` permanece exento de `Origin` (protegido por `CRON_SECRET`).
4. **Ciclo de vida sesión, baja e cambio de correo (`QA-11`, `QA-13`, `QA45-13`):**
   - Cookie válida funciona en `GET /api/auth/me`; tras `POST /api/auth/logout` o revocación por `SUPER_ADMIN`, la misma cookie responde `401`.
   - Al editar `email` o desactivar usuario (`INACTIVE`) en Admin, sus sesiones previas quedan revocadas (`401`), sus `otp_codes` pendientes quedan invalidados y se registra en `audit_logs`.
   - Usuario `INACTIVE` con OTP previamente emitido no logra iniciar sesión dentro de la transacción de `verify-otp`.
5. **Restricciones `PENDING_ONBOARDING` y Presencia (`QA3-06`, `QA-22`):**
   - Usuario en `PENDING_ONBOARDING` accede a `/api/auth/me`, `/api/auth/onboarding`, `/api/push/subscribe`, `/api/auth/logout`; recibe `403` si llama a `/api/parent/*`, `/api/teacher/*`, `/api/admin/*` o `/api/presence/ping`.
   - Usuario `ACTIVE` llamando a `POST /api/presence/ping` actualiza `users.last_seen_at` y **no** genera filas en `audit_logs`.

### Hito 2 — Gestión Admin, Historial de Clases y Auditoría
1. **Unicidad y protección Super Admin:** Crear usuario con RUT o correo duplicado responde `409 Conflict`; el Super Admin intentando auto-desactivarse o cambiar su propio rol recibe `403`/`400`.
2. **Alta e historial de alumno (`QA2-08`, `QA-07`):** `POST /api/admin/students` crea alumno + fila inicial en `student_class_history (unassigned_at IS NULL)`; al trasladarlo de Clase A a Clase B, cierra `unassigned_at` de Clase A y abre nueva fila para Clase B conservando sus registros previos de `attendance_records` y `lesson_completions`.
3. **Auditoría paginada (`QA-15`):** `GET /api/admin/audit-logs?limit=51` responde `400`; `limit=50` pagina correctamente; ningún `details` contiene OTPs o tokens.

### Hito 3 — Unidades PDF, IA, Calendario DST y Descarga Profesor
1. **Listado Admin e índice único `ACTIVE` (`QA-18`, `QA45-13`):** `GET /api/admin/units` retorna unidades `DRAFT`/`ACTIVE`/`FINISHED`; tener 1 unidad `ACTIVE` en Clase A e intentar activar una 2da unidad en Clase A devuelve `409 Conflict`; coexistir `1 DRAFT` + `1 ACTIVE` + `1 FINISHED` en la misma clase funciona sin error.
2. **Subida segura, IA y reemplazo de `DRAFT` (`QA-01`, `QA3-01`, `QA3-03`, `QA4-02`, `QA45-13`):**
   - `upload-url` crea unidad `DRAFT` con `pdf_storage_key = NULL`.
   - `process-pdf` con archivo $> 25\text{ MB}$ o sin `%PDF-` rechaza, elimina el objeto inválido y **mantiene intacto** el `pdf_storage_key` anterior si se trataba de un reemplazo sobre `DRAFT`.
   - Al validar un nuevo PDF correcto en reemplazo de `DRAFT`, asigna nuevo `pdf_storage_key` y recién ahí elimina el archivo previo en Storage.
   - `POST /api/admin/lessons/:id/generate` persiste párrafos validados con Zod y registra `LESSON_AI_GENERATE` en `audit_logs`.
   - `PATCH /api/admin/units/:id` hacia `ACTIVE` rechaza `400` si `pdf_storage_key` es `NULL` o alguna de las 14 lecciones tiene campos/fechas nulas; al activar con éxito, marca `push_sent = true` en lecciones pasadas ya desbloqueadas.
   - `DELETE /api/admin/units/:id` en `DRAFT` elimina el archivo en Storage.
3. **Reprogramación `postpone` / `unpostpone` (`QA2-01`, `QA3-03`, `QA4-03`):**
   - **Caso lunes por la mañana:** Lección `N` con `unlock_at = lunes 00:01` y `push_sent = false`; Super Admin ejecuta `postpone` el lunes `09:00 AM` $\rightarrow$ Lección `N` y siguientes se desplazan `+7 días` (volviendo a quedar bloqueada hasta el próximo lunes `00:01`).
   - `unpostpone` (`-7 días`) revierte con exactitud; segundo clic consecutivo en `unpostpone` cuando `fromLessonNumber > 1` (colisionaría con `N-1`) o `fromLessonNumber === 1` (bajaría de `domingo_semana_en_curso`) devuelve `409 Conflict`.

### Hito 4 & Hito 5 — RBAC Padres, IDOR Profesor y Asistencia `MIN(created_at)`
1. **Matriz de Autorización `PARENT` (`QA3-02`, `QA3-07`, `QA4-01`, `QA45-11`):**
   - `GET /api/parent/units` y `lessons/:id` nunca exponen unidades `DRAFT` ni detalles de lecciones `SCHEDULED` futuras, `PAUSED` o `FORCE_LOCKED` (`403`).
   - **Mismo guard en mutaciones (`QA4-01`):** `POST /api/parent/lessons/:id/complete` y `POST .../uncomplete` sobre lección bloqueada, pausada o de unidad `DRAFT` devuelven **`403 Forbidden`**.
   - **Padre sin hijos activos (`QA3-07`, `QA45-11`):** Si **todos** sus hijos están `INACTIVE`, **`GET /api/parent/units` y `GET /api/parent/lessons/:id` devuelven `403 Forbidden`** (mientras `GET /api/auth/me` sigue devolviendo `200`); padre con hijo `ACTIVE` trasladado sí consulta `FINISHED` de clase anterior vía `student_class_history`.
   - Padre jamás ve `special_care`, `preferences`, asistencias, PDF ni endpoints `/api/teacher/*` o `/api/admin/*` (`403`).
2. **Visto y Completado con >1 hijo en misma clase (`QA-19`, `QA2-05`, `QA45-11`):**
   - Abrir la misma lección una 1ra vez crea `lesson_views`; abrirla por **2da vez** actualiza `last_viewed_at` manteniendo intacto `first_viewed_at`.
   - Padre con 2 hijos en Clase A envía `POST .../complete` con `{ studentIds: [hijo1] }` $\rightarrow$ marca solo `hijo1` (`hijo2` queda pendiente); otro padre vinculado lee `"Completada por [Nombre]"`; `POST .../uncomplete` sobre `[hijo1]` borra completado manteniendo `lesson_views`. Enviar un `studentId` de otro apoderado $\rightarrow$ `403`.
3. **IDOR Horizontal y Asistencia Profesor (`QA-16`, `QA2-04`, `QA3-04`, `QA45-10`):**
   - **Matriz IDOR `TEACHER` (asignado solo a Clase A recibe `403 Forbidden`):**
     - `GET /api/teacher/students/:id` sobre alumno de Clase B $\rightarrow$ `403`.
     - `GET /api/teacher/lessons/:id/tracking` sobre unidad de Clase B $\rightarrow$ `403`.
     - `GET /api/teacher/units/:id/pdf` sobre unidad `DRAFT` o de Clase B $\rightarrow$ `403`.
     - `GET` / `PUT /api/teacher/attendance` sobre Clase B, o `PUT` sobre Clase A incluyendo un `student_id` de Clase B $\rightarrow$ `403`.
   - `GET /api/teacher/units` excluye `DRAFT`.
   - Domingo olvidado hace 10 días **sin ningún registro previo** en `attendance_records` $\rightarrow$ `TEACHER` puede **crearlo** por primera vez (`200`), fijando `created_at = now()`.
   - Tras existir >=1 fila para `(class_id, attendance_date)` con `MIN(created_at)` hace **4 días calendario**: `TEACHER` recibe `403` tanto al modificar un alumno existente como al intentar agregar asistencia para un **alumno recién inscrito sin fila previa** en esa fecha; `SUPER_ADMIN` sí puede guardar generando `ATTENDANCE_ADMIN_OVERRIDE`.
   - Alumno que asistió el domingo en Clase A y fue trasladado el martes a Clase B (dentro de los 3 días): el profesor de Clase A **sí puede** corregir su asistencia de ese domingo (`200`) gracias a `student_class_history` / `attendance_records`.

### Hito 6 — Cron Diario y Web Push
1. **`GET /api/cron/daily` y conservación de sesiones activas (`QA45-11`):** Header ausente o `CRON_SECRET` inválido $\rightarrow$ `401`/`403`. En día distinto a lunes ejecuta `SELECT 1` y elimina **solo** filas expiradas de `otp_codes`, `rate_limits` y sesiones vencidas/revocadas antiguas, **manteniendo intactas las sesiones activas vigentes**, sin enviar Push.
2. **Envío lunes agrupado:** Dos lecciones desbloqueadas ese lunes en dos clases distintas donde un padre tiene 2 hijos activos $\rightarrow$ el padre recibe **exactamente 1 notificación agrupada**; padres con hijos en otra clase, padres con push inactivo, lecciones `PAUSED`/`FORCE_LOCKED` o de unidades `DRAFT`/`FINISHED` **no** reciben Push; ante respuesta `410 Gone` del endpoint Push, la suscripción se elimina de `push_subscriptions`.
3. **Logout + Push (`QA-04`):** Al ejecutar `DELETE /api/push/subscribe` desde logout, se elimina la suscripción del navegador para esa cuenta; si otro usuario inicia sesión en el mismo navegador y activa Push, el `UPSERT` por `endpoint` reasigna la suscripción al nuevo `user_id`.

---

## 4. Protocolo Manual E2E, Seguridad HTTP y PWA (Dispositivos Reales)

Ejecutar antes de pasar a producción (cierre de **Hito 6** y base de validación en celular real):

| # | Prueba en Dispositivo / Navegador | Pasos de verificación | Criterio de éxito |
| :---: | :--- | :--- | :--- |
| **E2E-01** | **Android Chrome (PWA + Ruteo por Rol + Push)** | Instalar desde banner/menú $\rightarrow$ abrir `/` $\rightarrow$ login RUT (pegando `" 12.345.678-5 "`) + OTP $\rightarrow$ Onboarding $\rightarrow$ activar Push $\rightarrow$ verificar también login con `TEACHER` y `SUPER_ADMIN` en `/` y `/perfil`. | RUT no pierde el `-5` al pegar; `/` enruta según rol y `/perfil` funciona para los 3 roles; llega Push con texto neutro sin nombres de menores. |
| **E2E-02** | **iPhone Safari (sin instalar vs instalada)** | 1) Abrir URL directo en Safari sin instalar y entrar a Onboarding. 2) Agregar a Pantalla de Inicio $\rightarrow$ abrir desde ícono (`standalone`) $\rightarrow$ activar Push en `/perfil`. | Paso 1 muestra guía iOS sin bloquear ni dar error JS en Onboarding; paso 2 activa Push correctamente y abre sin barra Safari. |
| **E2E-03** | **Descarga PDF en iOS *standalone*** | Iniciar sesión como Profesor en iPhone *standalone* $\rightarrow$ `/profesor/lecciones` $\rightarrow$ tocar *"Descargar PDF de la Unidad"*. | Archivo descarga/abre limpio mediante Signed URL con `{ download: true }`, sin dejar la PWA atrapada sin navegación. |
| **E2E-04** | **CSP, Cabeceras, `robots.txt` y SW Post-Logout (`QA45-12`)** | Verificar `GET /robots.txt`, headers HTTP en DevTools y `Application -> Cache Storage` tras navegar y ejecutar `Logout`. | `GET /robots.txt` responde `Disallow: /`; headers incluyen `CSP` con *nonce* (sin `'unsafe-inline'` en `script-src`), `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` y `X-Robots-Tag: noindex, nofollow`; SW cachea **solo** estáticos (`/_next/static/*`, `/icons/*`, `/offline.html`), cero `/api/*`, cero `?_rsc=`; cero fugas offline post-logout. |
| **E2E-05** | **UI/UX Táctil y Salida Gemini** | Revisar pantalla de lección en móvil `375px` (`iPhone SE`) y vista `/admin/unidades` al procesar un PDF de 14 lecciones. | Botones `>= 44px`, contraste limpio blanco/naranjo, resumen en párrafos limpios sin `**` crudos, progreso `1/14..14/14` fluido y botón *"Reintentar fallidas"* operativo ante HTTP `429`. |

---

## 5. Ejecución en Paralelo por Hito (Definición de Terminado)

Para no acumular deuda de pruebas al final de la codificación, ningún hito se da por terminado sin pasar sus checks correspondientes:

| Hito | Pruebas obligatorias antes de pasar al siguiente hito |
| :--- | :--- |
| **Hito 0** | `npm test` + `npm run test:integration` separados (`fileParallelism: false`, alias `@`) + `npm run db:migrate` en Docker (`ed_dev`/`ed_test`) verificando `rowsecurity = true` y denegación real RLS al rol `anon`, `seed.ts` idempotente y CSP con *nonce* + `offline.html` *(bucket `unit-pdfs` en Supabase se verifica en Hito 3/Fase 6)*. |
| **Hito 1** | Suites unitarias `rut.test.ts` (Mod 11 exacto) + `validators.test.ts` + integración Auth (rate limit IP/RUT, race condition OTP, `Origin`, `PENDING_ONBOARDING` sin `presence/ping`, cambio de email revoca sesión) + ruteo `/` por rol y `/perfil` en verde. |
| **Hito 2** | Integración CRUD Admin (unicidad `409`, `student_class_history` desde alta inicial, revocación/invalidación OTP al pasar a `INACTIVE`, paginación logs `<= 50`) en verde. |
| **Hito 3** | Suites `pdf-gemini-push-kpi.test.ts` (salto índice PDF, `<script>`/`**`/`429` en `gemini.ts`) + integración PDF/IA/Calendario (`GET /api/admin/units`, `DRAFT` nullable, swap seguro, `LESSON_AI_GENERATE`, índice parcial `ACTIVE`, `postpone` lunes AM, `unpostpone` `409` con DST) en verde. |
| **Hito 4** | Integración RBAC Padres (`DRAFT`/futuro/pausado `403` en `GET`/`complete`/`uncomplete`, `403` si `0` hijos `ACTIVE`, conservación `first_viewed_at` en 2da vista, modal por hijo en misma clase) en verde. |
| **Hito 5** | Suite `timezone.test.ts` (DST CLT/CLST + `MIN(created_at)`) + integración Profesor (IDOR horizontal completo `TEACHER`, `GET /api/teacher/units`, domingo olvidado, bloqueo al día `+4`, traslado dentro de 3 días) en verde. |
| **Hito 6** | Integración Cron/Push (`CRON_SECRET`, conservación sesiones activas, agrupación por padre, SSRF `new URL`, `410 Gone`) + **Checklist Manual Móvil §4 (`E2E-01` a `E2E-05`)** completado sin fallos críticos. |

---

## 6. Siguiente Fase

Una vez revisada y aprobada esta estrategia de pruebas, iniciaremos la **Fase 4: Codificación (`Hito 0 -> Hito 6`)** ejecutando estas pruebas hito por hito en paralelo, para finalmente documentar el despliegue productivo en **Fase 6 (`06-implementacion-y-despliegue.md`)**.
