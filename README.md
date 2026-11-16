# Proyecto_ED — PWA Escuela Dominical (5ta ACyM)

> **Guía de Contexto para Agentes y Desarrolladores**  
> Especificación técnica, arquitectura, reglas de seguridad y plan de construcción de la **PWA (Progressive Web App) de Escuela Dominical**.

---

## 1. Documentación Técnica (`docs/`)

| Documento | Qué define |
| :--- | :--- |
| [docs/00-roadmap-fases.md](./docs/00-roadmap-fases.md) | Índice maestro y avance de fases del proyecto. |
| [docs/01-analisis-y-requerimientos.md](./docs/01-analisis-y-requerimientos.md) | Actores, reglas de negocio, requerimientos funcionales, historias de usuario y alcance MVP. |
| [docs/02-diseno-y-arquitectura.md](./docs/02-diseno-y-arquitectura.md) | Stack `$0`, ERD PostgreSQL, flujos críticos, identidad visual ACyM (naranjo/blanco) y contratos API. |
| [docs/03-seguridad.md](./docs/03-seguridad.md) | RUT/OTP, Cookie 30 días, RBAC/IDOR, RLS Supabase, matriz de validación Front+Back y auditoría. |
| [docs/04-codificacion.md](./docs/04-codificacion.md) | Estructura de carpetas, dependencias mínimas y plan de implementación por hitos. |
| `docs/05-pruebas-y-qa.md` | Matriz de pruebas unitarias, integración, seguridad y PWA Android/iOS. |
| `docs/06-implementacion-y-despliegue.md` | Configuración de Vercel, Supabase, Resend (`5acym.cl`), DNS y salida a producción. |

---

## 2. Propósito y Restricciones No Negociables

- **Objetivo:** Conectar la clase dominical de la iglesia con el refuerzo semanal en casa, permitiendo a padres/tutores leer un resumen adaptado + pasaje bíblico base + 2–3 preguntas por lección, y a los profesores tomar asistencia y medir seguimiento.
- **Formato:** **PWA instalable en Android e iOS** (sin publicar en App Store ni Google Play).
- **Presupuesto estricto (`$0/mes`, sin tarjeta de crédito):** Toda la arquitectura usa capas gratuitas que no solicitan tarjeta. *(Única inversión externa prevista por la iglesia: dominio `.cl` anual `5acym.cl` para correo institucional `iglesia@5acym.cl` y URL oficial).*
- **Zona horaria oficial:** Todas las reglas de calendario, desbloqueos y plazos operan en **`America/Santiago`** (con soporte automático de horario de verano/invierno).

---

## 3. Stack Tecnológico Definido

| Capa | Elección oficial | Notas críticas para implementación |
| :--- | :--- | :--- |
| **Frontend (PWA)** | **Next.js (App Router) + React + TypeScript + Tailwind CSS** | *Mobile-first*, fuente `Plus Jakarta Sans`, paleta **ACyM Naranjo (`#EA580C`) + Blanco cálido (`#FAFAF9` / `#FFFFFF`)**. |
| **PWA y Web Push** | `manifest.webmanifest` + **`public/sw.js` propio** + `web-push` (VAPID) | `sw.js` **nunca** debe cachear `/api/*` ni datos privados. |
| **Backend** | **Next.js Route Handlers (`/app/api/...`) + Drizzle ORM + Zod** | Mismo proyecto que el frontend. Todo input validado con esquemas Zod compartidos Front+Back. |
| **Validación RUT** | **`@fdograph/rut-utilities`** | `cleanRut()`, `validateRut(rut, true)` (rechaza `11.111.111-1`, etc.), visual `DOTS_DASH`, BD `DASH`. |
| **Hosting + Cron** | **Vercel (Plan Hobby)** + **Vercel Cron diario (`vercel.json`)** | Cron `0 16 * * *` UTC (`/api/cron/daily`): mantiene viva Supabase (`SELECT 1`), limpia tokens expirados y los **lunes** envía Web Push. |
| **Base de Datos y PDF** | **Supabase (PostgreSQL + Storage Private Bucket)** | **RLS habilitado en todas las tablas** sin acceso anónimo; PDFs guardados en bucket `Private` (máx. 25 MB, firma `%PDF-`). |
| **PDF + IA** | `unpdf` + **Google Gemini API (Free Tier)** | Procesar PDF en texto en entorno serverless y generar con IA **lección por lección (`1/14..14/14`)** para evitar timeouts; validar salida con Zod. |
| **Correos OTP** | **Resend** (3.000/mes gratis, `iglesia@5acym.cl`) | Sin dominio aún: usar respaldo SMTP temporal solo en pruebas locales. |

---

## 4. Actores, Roles y Reglas de Negocio Clave

### Roles del Sistema
1. **`SUPER_ADMIN`:** Hereda **todas las capacidades de `TEACHER`** (puede enseñar, pasar asistencia sin límite de días y descargar PDFs) + administra clases, usuarios, niños, carga/edición de PDFs y calendario, ve usuarios **conectados en vivo** y accede a **`audit_logs`**. No puede auto-desactivarse.
2. **`TEACHER` (Profesor):** Solo accede a sus clases asignadas (`class_teachers`). Ve las **14 lecciones sin bloqueo**, descarga el PDF de respaldo vía Signed URL, consulta la **ficha interna del niño**, crea asistencias dominicales (y puede modificarlas hasta **3 días calendario desde su creación**) y revisa seguimiento/KPIs. **No** gestiona usuarios/clases ni ve logs.
3. **`PARENT` (Padre/Madre/Tutor):** Requiere cuenta `ACTIVE` y al menos un hijo `ACTIVE` en `parent_students`; accede a unidades `ACTIVE` actuales y `FINISHED` históricas (`student_class_history`) de esos hijos (nunca `DRAFT`). Ve unidades pasadas en **acordeón colapsable** (`> Unidad 1`) y la activa desplegada (`v Unidad 2`) con lecciones futuras bloqueadas. **Nunca** ve asistencia, ficha interna del niño, logs ni el PDF del profesor.
4. **Niño / Alumno:** Entidad sin login; vinculado **N:M** a padres/tutores y asignado a 1 clase actual (registrando historial en `student_class_history` desde el alta inicial).

### Reglas de Negocio Críticas (No Alterar sin Actualizar `docs/`)
- **Pre-registro obligatorio (Opción A):** No hay auto-registro (primer `SUPER_ADMIN` vía `seed`). El Super Admin crea el usuario (`rut` único + `email` único). Primer login completa wizard de Onboarding (datos, guía instalación PWA iOS/Android, permiso Web Push sin bloquear iOS no instalado).
- **Auth y Sesión única de 30 días:** Login por RUT $\rightarrow$ OTP de 6 dígitos (HMAC-SHA256, expira 10 min, máx. 5 intentos atómicos, cooldown 60s sin enumeración, rate limit en Postgres) $\rightarrow$ **único token opaco de 30 días** en cookie **`__Host-ed_session` (`HttpOnly; Secure; SameSite=Lax`)** (o `ed_session` en HTTP local) validado contra `sessions` para permitir revocación inmediata. (Si el Super Admin cambia el correo de un usuario, revoca sus sesiones activas e invalida OTPs pendientes).
- **Desbloqueo lunes `00:01` (`America/Santiago`):** Calculado en servidor (`schedule_status = 'FORCE_UNLOCKED' OR (schedule_status = 'SCHEDULED' AND now() >= unlock_at)`), nunca solo en frontend. Super Admin puede pausar/correr `+7` o `-7 días` desde la lección seleccionada —incluyendo lunes por la mañana antes de Push— (recalculando horario CLT/CLST) o bloquear manualmente (`FORCE_LOCKED`).
- **Visto vs. Completado:**
  - **Visto (`lesson_views`):** Individual por cada cuenta de padre (`(lesson_id, parent_id)`). Mide engagement individual y no se borra al desmarcar completado.
  - **Completado (`lesson_completions`):** Por alumno en esa clase (`(lesson_id, student_id)` + `completed_by_user_id`), compartido entre padres vinculados. Si hay >1 hijo en la misma clase, el modal permite elegir a qué hijo(s) marcar/desmarcar (`POST .../complete` y `POST .../uncomplete`).
- **Asistencia dominical con ventana de 3 días desde creación:** Solo fechas de **domingo** (`<= hoy` en `America/Santiago`) con `Presente` / `Ausente` + `observación` opcional. Si un domingo se olvidó, el profesor puede crearla después; **una vez creada** la asistencia de `(class_id, attendance_date)`, dispone de **3 días calendario desde `MIN(created_at)`** de esa clase/fecha para modificar o completar alumnos. Pasado ese plazo queda solo lectura para profesores y solo `SUPER_ADMIN` puede editar sin límite.
- **Ficha interna del niño:** Campos opcionales `special_care` (alergias/cuidados) y `preferences` (`dibujar`, `pintar`, `cantar`, `escribir`, etc.). Se consultan en `/profesor/alumnos`, **no** en la lista rápida de asistencia y **nunca** para `PARENT`.
- **Presencia en vivo (`$0`):** Heartbeat ligero (`POST /api/presence/ping`) cada ~60s mientras la PWA está visible (solo con usuario `ACTIVE`; se pausa tras 10 min de inactividad), mostrado al Super Admin como 🟢 `En línea` (<=90s) o última conexión.
- **Auditoría inmutable (`audit_logs`):** Tabla *append-only* de todas las acciones relevantes del sistema (excluyendo `presence/ping`), consultable únicamente por `SUPER_ADMIN`.

---

## 5. Convenciones Obligatorias para Agentes que Trabajen en este Repo

1. **Leer contrato raíz y especificaciones antes de codificar:** Todo agente debe respetar [AGENTS.md](./AGENTS.md) y consultar [docs/01-analisis-y-requerimientos.md](./docs/01-analisis-y-requerimientos.md), [docs/02-diseno-y-arquitectura.md](./docs/02-diseno-y-arquitectura.md), [docs/03-seguridad.md](./docs/03-seguridad.md), [docs/04-codificacion.md](./docs/04-codificacion.md) y [docs/05-pruebas-y-qa.md](./docs/05-pruebas-y-qa.md).
2. **Protocolo estricto hito por hito (anti-desviación):** Se implementa en orden (`Hito 0` $\rightarrow$ `Hito 6` en [docs/04-codificacion.md](./docs/04-codificacion.md)). Prohibido pasar al siguiente hito sin escribir y aprobar en verde las pruebas exigidas para el hito actual en [docs/05-pruebas-y-qa.md](./docs/05-pruebas-y-qa.md) (§5) y actualizar el tablero de avance.
3. **Backend es la única autoridad:** Validar siempre sesión (`NextRequest`/`NextResponse`), rol, relación padre/profesor, ventana de 3 días (`MIN(created_at)`), desbloqueo `00:01`, `Origin` (en mutaciones), UUIDs en parámetros y esquemas **Zod** en cada Route Handler.
4. **Cero secretos expuestos:** Nunca usar prefijo `NEXT_PUBLIC_` para claves privadas (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`, `OTP_PEPPER`, `CRON_SECRET`).
5. **Cero HTML crudo:** Nunca renderizar respuestas de IA ni entradas de usuario con `dangerouslySetInnerHTML`.
6. **Mantener sincronizada la documentación:** Si cambia una regla de negocio, límite de campo o endpoint durante el desarrollo, actualizar el `.md` correspondiente en `docs/`.
