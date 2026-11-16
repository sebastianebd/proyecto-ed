# Informe de Auditoría QA — Integración Hito 1 (Código vs Documentación)

> **Rol:** QA / Auditoría de Código, Seguridad y Cumplimiento Arquitectónico  
> **Fecha:** 2026-11-16  
> **Informe previo:** [auditoria-qa-hito0.md](./auditoria-qa-hito0.md)  
> **Alcance:** Auditoría completa del código integrado hasta el **Hito 1** frente a [04-codificacion.md](../04-codificacion.md) (`v1.2`), [01-analisis-y-requerimientos.md](../01-analisis-y-requerimientos.md) (`v1.5`), [02-diseno-y-arquitectura.md](../02-diseno-y-arquitectura.md) (`v1.6`), [03-seguridad.md](../03-seguridad.md) (`v1.4`), [05-pruebas-y-qa.md](../05-pruebas-y-qa.md) (`v1.1`) y [AGENTS.md](../../AGENTS.md).

---

## 1. Resumen Ejecutivo y Evidencia de Ejecución

La integración del **Hito 1** (RUT, OTP `HMAC-SHA256`, rate limiting en PostgreSQL, sesiones de 30 días en cookie `HttpOnly`, guard `Origin`/`Referer`, validadores Zod compartidos, endpoints `/api/auth/*` y `/api/presence/ping`, despachador `/` por rol, `/login`, `/onboarding` y `/perfil` compartido) presenta una implementación limpia y bien estructurada. Además, **todos los hallazgos del Hito 0 (`H0-01` a `H0-06`) fueron corregidos satisfactoriamente**.

Sin embargo, la auditoría detectó **1 bug funcional crítico** (`PresenceTracker` creado pero no montado en `AppShell` ni `layout.tsx`), **2 mejoras importantes de seguridad** (marcado `used_at` en el 5to fallo de OTP / concurrencia en `otp:vfail`, y prioridad de cabecera IP en `getClientIp`), **2 bugs de borde** (fecha UTC en `birthDateSchema`, UX/clases de `SUPER_ADMIN` e iPadOS) y **1 brecha puntual de cobertura en tests** (expiración temporal de OTP y sesión).

### Resultados de Verificación Ejecutados

| Verificación | Comando | Resultado observado |
| :--- | :--- | :--- |
| **Typecheck TypeScript** | `npx tsc --noEmit --incremental false` | ✅ `0` errores (exit `0`) |
| **Pruebas Unitarias** | `npm test` | ✅ **61/61 tests en verde** (4 archivos: `rut.test.ts` 12, `hito0-seguridad-http.test.ts` 9, `security-origin.test.ts` 9, `validators.test.ts` 31) |
| **Pruebas de Integración** | `npm run test:integration` | ✅ **16/16 tests en verde** contra `ed_test` (2 archivos: `hito0-rls-seed.test.ts` 6? — 16 totales entre Hito 0 y `hito1-auth.test.ts` 10) |

*(Corrección de conteo exacto observado en salida Vitest: `hito1-auth.test.ts` reportó 10 tests, total `2` archivos / `16` tests en verde).*

### Matriz Resumen de Hallazgos (Hito 1)

| ID | Severidad | Archivo(s) | Categoría | Título resumido |
| :--- | :---: | :--- | :--- | :--- |
| **H1-01** | 🔴 Crítica | `src/components/layout/PresenceTracker.tsx`, `AppShell.tsx`, `layout.tsx` | Integración / Funcional | `PresenceTracker` no está montado en ninguna pantalla; `/api/presence/ping` nunca se dispara |
| **H1-02** | 🟠 Alta | `src/lib/auth.ts` | Seguridad / OTP | 5to fallo de OTP no setea `used_at = now()` y `otp:vfail` opera fuera de lock ante ráfagas |
| **H1-03** | 🟠 Alta | `src/lib/http.ts` | Seguridad / Rate Limit | `getClientIp` prioriza `x-forwarded-for[0]` antes que `x-real-ip` / `x-vercel-forwarded-for` |
| **H1-04** | 🟡 Media | `src/lib/validators/domain.ts` | Validación / Zona horaria | `birthDateSchema` valida contra fecha UTC en lugar de `America/Santiago` |
| **H1-05** | 🟡 Media | `LoginForm.tsx`, `profile.ts`, `ProfileView.tsx`, `OnboardingWizard.tsx` | UX / Roles | Reenvío no limpia `code`; `SUPER_ADMIN` no ve sus clases asignadas; `isIos` en iPadOS 13+ |
| **H1-06** | 🟢 Baja | `tests/integration/hito1-auth.test.ts` | Cobertura QA | Faltan casos explícitos de OTP expirado (`expires_at <= now()`) y sesión expirada |

---

## 2. Verificación de Cierre de Hallazgos (Hito 0)

| Hallazgos Hito 0 | Estado | Evidencia verificada |
| :--- | :---: | :--- |
| **H0-01** (RUT `< 1.000.000` y Mod 11 en `seed.ts`) | ✅ Resuelto | [src/db/seed.ts](../../src/db/seed.ts#L14-L26) usa `normalizeRut()`, `ON CONFLICT DO NOTHING` y [hito0-rls-seed.test.ts](../../tests/integration/hito0-rls-seed.test.ts) prueba `987.654-5` y normalización. |
| **H0-02** (HSTS solo en producción) | ✅ Resuelto | [next.config.ts](../../next.config.ts#L16-L19) condiciona `Strict-Transport-Security` a `process.env.NODE_ENV === "production"`. |
| **H0-03** (`X-Robots-Tag` en estáticos + `/favicon.ico`) | ✅ Resuelto | [next.config.ts](../../next.config.ts#L9) agrega `X-Robots-Tag` y [src/proxy.ts](../../src/proxy.ts#L42) excluye `favicon\\.ico`. |
| **H0-04** (`body` dentro de `@layer base`) | ✅ Resuelto | [src/app/globals.css](../../src/app/globals.css#L25-L31) envuelve `body` en `@layer base`. |
| **H0-05** (Ampliación tests RLS y `proxy.ts`) | ✅ Resuelto | Probado en `hito0-rls-seed.test.ts` e `hito0-seguridad-http.test.ts` (9 tests). |
| **H0-06** (Comentarios actualizados) | ✅ Resuelto | Comentarios alineados en `next.config.ts` y `04-codificacion.md`. |

---

## 3. Verificación de Cumplimiento del Hito 1

- **RUT y Normalización ([src/lib/rut.ts](../../src/lib/rut.ts)):** Usa `@fdograph/rut-utilities` con `validateRut(clean, true)` (rechaza patrones repetidos), soporta `7..9` chars limpios (`< 1.000.000` incluido), normaliza a `DASH` en mayúsculas y limpia espacios al pegar (`onPaste`).
- **Seguridad Auth / OTP ([src/lib/security.ts](../../src/lib/security.ts), [src/lib/auth.ts](../../src/lib/auth.ts)):** OTP de 6 dígitos con `crypto.randomInt`, almacenado con `HMAC-SHA256(rut + ":" + otp, OTP_PEPPER)`, comparación en tiempo constante (`timingSafeEqual`), consumo atómico en SQL con `FOR UPDATE` y `attempts < 5`, verificación de `users.status` dentro de la transacción, cookie `__Host-ed_session` en HTTPS / `ed_session` en HTTP local, guard `Origin`/`Referer` con exención única `/api/cron/daily` y envío en segundo plano mediante `runInBackground()` (`waitUntil` + fallback local).
- **Endpoints Hito 1:** `GET /api/auth/me`, `POST /api/auth/request-otp` (respuesta `200` neutra anti-enumeración), `POST /api/auth/verify-otp`, `POST /api/auth/onboarding`, `POST /api/auth/logout` (revoca sesión, limpia cookie y desvincula `pushEndpoint`), `POST /api/presence/ping` (bloqueado en `PENDING_ONBOARDING` con `403`, sin `audit_logs`), usando `NextRequest`/`NextResponse` sin `next/headers` en APIs.
- **Ruteo y Pantallas:** `src/app/page.tsx` despacha según sesión/rol (`/login`, `/onboarding`, `ParentHomeView`, `/profesor/asistencia`, `/admin`), `(protected)/perfil` compartido entre los 3 roles, `(teacher)/layout.tsx` habilitado para `['TEACHER', 'SUPER_ADMIN']` y `(admin)/layout.tsx` exclusivo `['SUPER_ADMIN']`.

---

## 4. Detalle de Hallazgos (Hito 1)

### H1-01 — `PresenceTracker` no está montado en `AppShell` ni en `layout.tsx`
* **Severidad:** 🔴 Crítica
* **Ubicación:** [src/components/layout/PresenceTracker.tsx](../../src/components/layout/PresenceTracker.tsx), [src/components/layout/AppShell.tsx](../../src/components/layout/AppShell.tsx), [src/app/layout.tsx](../../src/app/layout.tsx).
* **Problema:** El componente `PresenceTracker` fue implementado según `04` §1 y §4 Hito 1 (con pausa tras 10 minutos de inactividad y recorte cuando la pestaña no está visible), pero **no se importa ni se renderiza en ningún archivo** de `src/app/` ni `src/components/`.
* **Impacto:** Al navegar en la PWA autenticada (como `PARENT`, `TEACHER` o `SUPER_ADMIN`), nunca se enviarán pulsos a `POST /api/presence/ping`, dejando `users.last_seen_at` congelado en la hora del login y haciendo inoperante el indicador en vivo `🟢 En línea` del Hito 2.
* **Solución recomendada:** Montar `<PresenceTracker enabled={true} />` dentro de [AppShell.tsx](../../src/components/layout/AppShell.tsx) (ya que `AppShell` envuelve exclusivamente vistas de usuarios `ACTIVE`: `/`, `/perfil`, `/profesor/*` y `/admin/*`, nunca `/login` ni `/onboarding`).

### H1-02 — 5to fallo de OTP no setea `used_at` y race en `otp:vfail`
* **Severidad:** 🟠 Alta
* **Ubicación:** [src/lib/auth.ts](../../src/lib/auth.ts#L168-L194).
* **Problema:**
  1. En [auth.ts L188-L190](../../src/lib/auth.ts#L188-L190), cuando `attempts` pasa de `4` a `5`, solo incrementa `attempts` sin marcar `used_at = now()`. Como el `SELECT` previo ([L181-L183](../../src/lib/auth.ts#L181-L183)) filtra solo `used_at IS NULL AND expires_at > now()`, en un 6to intento sigue seleccionando esa fila, ejecuta el `UPDATE` sin efecto y registra otro evento `OTP_FAILED` en `audit_logs`, en vez de quedar invalidado al 5to fallo ([03 §2](../03-seguridad.md#L23)).
  2. `isRateLimited(failKey, 10)` ([L169](../../src/lib/auth.ts#L169)) y `consumeRateLimit(failKey, 10, WINDOW_15M)` ([L207](../../src/lib/auth.ts#L207)) se ejecutan fuera de transacción; ráfagas concurrentes desde la misma IP probando múltiples RUTs pueden superar ligeramente el límite de `10` fallos antes de actualizar el contador.
* **Solución recomendada:**
  * Actualizar L189 a: `SET attempts = attempts + 1, used_at = CASE WHEN attempts + 1 >= ${OTP_MAX_ATTEMPTS} THEN now() ELSE used_at END` (y añadir `AND attempts < ${OTP_MAX_ATTEMPTS}` en el `SELECT` L182 como defensa adicional).
  * Opcionalmente incrementar `otp:vfail` al fallar de forma más temprana o aceptar que el impacto es acotado porque cada RUT tiene lock `FOR UPDATE`.

### H1-03 — Posible IP spoofing en `getClientIp` por orden de cabeceras
* **Severidad:** 🟠 Alta
* **Ubicación:** [src/lib/http.ts](../../src/lib/http.ts#L7-L11).
* **Problema:** `getClientIp(req)` lee primero `x-forwarded-for.split(",")[0]` y luego `x-real-ip`. En despliegues detrás de proxies que agregan la IP real al final o preservan la cabecera enviada por el cliente (fuera de edges que la sobreescriben), un atacante puede enviar `X-Forwarded-For: <ip-falsa>` distinta en cada petición y evadir los límites de `15` solicitudes / `10` verificaciones por IP.
* **Solución recomendada:** Priorizar `x-vercel-forwarded-for` o `x-real-ip` (establecidas por la plataforma Vercel en el edge) antes que `x-forwarded-for`.

### H1-04 — `birthDateSchema` valida contra fecha UTC en vez de `America/Santiago`
* **Severidad:** 🟡 Media
* **Ubicación:** [src/lib/validators/domain.ts](../../src/lib/validators/domain.ts#L29-L42).
* **Problema:** `new Date().toISOString().slice(0, 10)` evalúa el día actual en **UTC**. En Chile (`UTC-3` / `UTC-4`), desde las `20:00` o `21:00` hrs en adelante ya es el día siguiente en UTC, por lo que el validador aceptaría como válida una fecha de nacimiento futura en hora chilena (contradiciendo [AGENTS.md](../../AGENTS.md) e invariante de fechas Chile).
* **Solución recomendada:** Calcular `today` y la cota `-25 años` usando `Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date())` (o reutilizar `src/lib/timezone.ts` cuando se implemente).

### H1-05 — Detalles de UX y roles (`LoginForm`, `profile.ts`, `OnboardingWizard`)
* **Severidad:** 🟡 Media
* **Ubicación:** [LoginForm.tsx](../../src/components/auth/LoginForm.tsx#L199), [profile.ts](../../src/lib/profile.ts#L45), [ProfileView.tsx](../../src/components/auth/ProfileView.tsx#L109), [OnboardingWizard.tsx](../../src/components/auth/OnboardingWizard.tsx#L23).
* **Detalles:**
  1. En `LoginForm.tsx` L199, al presionar *"Reenviar código"* (`submitRut()`), no limpia el campo `code` (`setCode("")`) si el usuario había escrito un código antiguo inválido.
  2. En `profile.ts` L45 y `ProfileView.tsx` L109, `classes` solo se carga/muestra si `role === "TEACHER"`, omitiendo las clases que también pueda dictar un `SUPER_ADMIN` ([01 HU-ADM-01](../01-analisis-y-requerimientos.md#L210-L213)).
  3. En `OnboardingWizard.tsx` L23, `/iPad|iPhone|iPod/.test(navigator.userAgent)` no detecta iPads con iPadOS 13+ (que reportan `Macintosh` + `navigator.maxTouchPoints > 1`).

### H1-06 — Faltan pruebas explícitas de expiración temporal de OTP y sesión
* **Severidad:** 🟢 Baja
* **Ubicación:** [tests/integration/hito1-auth.test.ts](../../tests/integration/hito1-auth.test.ts).
* **Detalle:** El archivo cubre muy bien anti-enumeración, cooldown, rate limit IP/RUT, 5 intentos, race condition, `Origin`, `PENDING_ONBOARDING`, `INACTIVE` y roles; sin embargo, no hay ningún test que fuerce `expires_at <= now()` en `otp_codes` ni en `sessions` para comprobar el rechazo `401` ante expiración por tiempo.

---

## 5. Checklist de Cierre para Hito 1 (Antes de Iniciar Hito 2)

- [ ] **H1-01:** Montar `<PresenceTracker enabled={true} />` en `src/components/layout/AppShell.tsx`.
- [ ] **H1-02:** Marcar `used_at = now()` al llegar al 5to fallo en `verifyOtp` (`src/lib/auth.ts`) y filtrar `attempts < 5` en el `SELECT`.
- [ ] **H1-03:** Priorizar `x-vercel-forwarded-for` / `x-real-ip` antes de `x-forwarded-for` en `src/lib/http.ts`.
- [ ] **H1-04:** Calcular la fecha actual de `birthDateSchema` (`src/lib/validators/domain.ts`) en zona horaria `America/Santiago`.
- [ ] **H1-05:** Limpiar `code` al reenviar OTP en `LoginForm.tsx`, cargar clases asignadas también para `SUPER_ADMIN` en `profile.ts`/`ProfileView.tsx`, y sumar detección iPadOS (`maxTouchPoints > 1`) en `OnboardingWizard.tsx`.
- [ ] **H1-06:** Agregar casos de OTP expirado y sesión expirada en `tests/integration/hito1-auth.test.ts`.
