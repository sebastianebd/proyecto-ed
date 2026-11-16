# Informe de Auditoría QA — Integración Hito 2 (Administración y Control de Usuarios)

**Fecha de auditoría:** 2026-11-16  
**Alcance:** Verificación de la integración del **Hito 2** (`docs/04-codificacion.md §4`) frente a los documentos fuente (`01`, `02`, `03`, `04`, `05` y `AGENTS.md`), revisión del cierre de hallazgos del **Hito 1**, detección de bugs reales o potenciales y ejecución de validaciones automatizadas.

---

## 1. Resumen Ejecutivo

La integración del **Hito 2** cubre la gestión administrativa de usuarios, clases, alumnos, vínculos familiares, historial de traslados (`student_class_history`), revocación de sesiones, KPIs y visor de auditoría (`audit_logs`), con tipado estricto y pruebas unitarias/integración actualmente en verde.

Sin embargo, la auditoría detectó **1 hallazgo crítico** (`H2-01`) que provoca un error **`500`** al actualizar solo relaciones (`teacherIds` o `parents`) o enviar payloads vacíos en `PATCH` debido a `.set({})` en Drizzle ORM, **2 hallazgos altos** (`H2-02` sobre asignación de apoderados `INACTIVE` o clases `ARCHIVED`, y `H2-03` sobre riesgo de *hydration mismatch* en fechas relativas/locales en React), además de **3 hallazgos medios/bajos** relacionados con manejo de errores en UI y cobertura de pruebas.

### Resultado de Comandos Ejecutados
| Verificación | Comando | Resultado observado |
| :--- | :--- | :--- |
| TypeScript (`tsc`) | `npx tsc --noEmit --incremental false` | Exit `0` (sin errores) |
| Pruebas unitarias | `npm test` | Exit `0` — **5 archivos, 64 pruebas aprobadas** (`kpis.test.ts`: 2, `rut.test.ts`: 12, `hito0-seguridad-http.test.ts`: 9, `security-origin.test.ts`: 10, `validators.test.ts`: 31) |
| Pruebas de integración | `npm run test:integration` | Exit `0` — **3 archivos, 24 pruebas aprobadas** (`hito0-rls-seed.test.ts`, `hito1-auth.test.ts`, `hito2-admin.test.ts`: 7) |

---

## 2. Verificación de Cierre del Hito 1

Se comprobó la corrección en código de los hallazgos previos del Hito 1 relevantes para la base actual:

| ID | Descripción | Estado | Evidencia en código |
| :--- | :--- | :--- | :--- |
| `H1-01` | Montaje de `PresenceTracker` en el layout autenticado | ✅ Corregido | [AppShell.tsx](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/components/layout/AppShell.tsx#L10) (`<PresenceTracker enabled />`) |
| `H1-02` | Bloqueo en el 5° fallo OTP (`used_at = now()`) y filtro `attempts < 5` | ✅ Corregido | [auth.ts](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/lib/auth.ts#L182-L191) |
| `H1-03` | Prioridad de IP real en `getClientIp` (`x-vercel-forwarded-for` / `x-real-ip` antes que `x-forwarded-for`) | ✅ Corregido | [http.ts](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/lib/http.ts#L10-L15) |
| `H1-04` | Validación de `birthDateSchema` en zona `America/Santiago` (`todayInSantiago()`) | ✅ Corregido | [domain.ts](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/lib/validators/domain.ts#L29-L43), [timezone.ts](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/lib/timezone.ts#L1-L43) |
| `H1-05` | Carga de clases para `TEACHER` y `SUPER_ADMIN` en `loadUserProfile` | ✅ Corregido en backend | [profile.ts](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/lib/profile.ts#L45) *(Nota: en esta pasada enfocada en Hito 2 no se re-auditó `LoginForm.tsx`, `ProfileView.tsx` ni `OnboardingWizard.tsx`)* |
| `H1-06` | Cobertura de integración para OTP expirado y clases de `SUPER_ADMIN` | ✅ Corregido | [hito1-auth.test.ts](file:///C:/Users/sebas/Workspace/Proyecto_ED/tests/integration/hito1-auth.test.ts#L344-L360) |

---

## 3. Hallazgos del Hito 2

### 🔴 Crítico — `H2-01`: Error `500` en Drizzle `.set({})` cuando un `PATCH` no incluye columnas directas de la tabla

**Ubicación:**
- [src/app/api/admin/classes/[id]/route.ts](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/app/api/admin/classes/%5Bid%5D/route.ts#L40-L55)
- [src/app/api/admin/students/[id]/route.ts](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/app/api/admin/students/%5Bid%5D/route.ts#L46-L58)
- [src/app/api/admin/users/[id]/route.ts](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/app/api/admin/users/%5Bid%5D/route.ts#L44-L54)

**Descripción:**  
Los tres endpoints construyen el objeto de actualización dentro de `.set({ ... })` mediante *spread* condicional de campos escalares (`name`, `ageRange`, `status`, `fullName`, etc.). En Drizzle ORM, invocar `.update(table).set({})` con un objeto vacío lanza una excepción (`No values to set`), lo que termina en un **HTTP 500** no controlado capturado por `withErrorHandling`.

**Escenarios que disparan el bug en producción:**
1. `PATCH /api/admin/classes/:id` enviando únicamente `{ "teacherIds": ["..."] }` para reasignar profesores sin modificar nombre/estado/rango etario.
2. `PATCH /api/admin/students/:id` enviando únicamente `{ "parents": [...] }` para reasignar apoderados sin modificar columnas de `students`.
3. `PATCH` con cuerpo `{}` en cualquiera de los tres endpoints (`users`, `classes`, `students`).

**Recomendación:**
- Construir un objeto `patchValues` con las columnas escalares presentes en `parsed.data`.
- Rechazar con `400 Bad Request` si no viene ningún campo escalar ni campo relacional (`teacherIds` / `parents`).
- Ejecutar `tx.update(...).set(patchValues).where(...).returning()` **solo cuando `Object.keys(patchValues).length > 0`**; en caso contrario, reutilizar `existing` para el resto de la transacción (asignación de `classTeachers` / `parentStudents` y registro en `audit_logs`).

---

### 🟠 Alto — `H2-02`: `students` permite vincular apoderados `INACTIVE` y asignar/trasladar alumnos a clases `ARCHIVED`

**Ubicación:**
- [src/app/api/admin/students/route.ts](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/app/api/admin/students/route.ts#L72-L84)
- [src/app/api/admin/students/[id]/route.ts](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/app/api/admin/students/%5Bid%5D/route.ts#L27-L40)
- [src/components/admin/StudentsManager.tsx](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/components/admin/StudentsManager.tsx#L258-L262)

**Descripción:**
1. Al crear o editar un alumno, la validación de clase consulta `classes.id` sin comprobar `classes.status === "ACTIVE"`. Además, el selector `<select id="s-class">` en `StudentsManager.tsx` lista también clases archivadas sin filtrarlas para nuevas asignaciones o traslados.
2. Al validar `parents`, se comprueba `u.role !== "PARENT"`, pero **no** `u.status === "INACTIVE"`. En contraste, [src/app/api/admin/classes/route.ts](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/app/api/admin/classes/route.ts#L57) sí rechaza docentes inactivos (`u.status === "INACTIVE"`).

**Impacto:**  
Se puede matricular o trasladar un alumno a una clase archivada, o vincularlo con un tutor desactivado que no puede iniciar sesión ni recibir notificaciones/resúmenes.

**Recomendación:**
- En `POST /api/admin/students` y `PATCH /api/admin/students/[id]` (cuando cambia `classId` o se reactiva el alumno), exigir que la clase destino tenga `status === "ACTIVE"` (retornar `400` en caso contrario).
- Exigir `u.status === "ACTIVE"` al validar `parentIds` en creación y actualización de alumnos.
- En `StudentsManager.tsx`, mostrar solo clases activas en el selector (manteniendo la clase archivada actual únicamente como opción informativa/seleccionada si se edita un alumno que ya pertenece a ella).

---

### 🟠 Alto — `H2-03`: Riesgo de *Hydration Mismatch* en React por uso de `Date.now()` y `toLocaleString()` durante el render

**Ubicación:**
- [src/components/admin/UsersManager.tsx](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/components/admin/UsersManager.tsx#L34-L41) y [L388](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/components/admin/UsersManager.tsx#L388)
- [src/components/admin/AuditLogsViewer.tsx](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/components/admin/AuditLogsViewer.tsx#L201-L203)

**Descripción:**
1. `formatLastSeen` en `UsersManager.tsx` llama directamente a `Date.now()` durante el renderizado inicial (SSR vs cliente). Si el último acceso está cerca de un umbral (ej. cambio de minuto u hora) entre el render en servidor y la hidratación en navegador, el texto difiere y React emite un *hydration mismatch*.
2. `AuditLogsViewer.tsx` renderiza `new Date(log.createdAt).toLocaleString("es-CL", { timeZone: "America/Santiago" })` directamente en SSR y cliente, lo cual puede variar según configuración ICU/locale entre Node.js y distintos navegadores.

**Recomendación:**
- Usar un formateador determinista compartido en ambos entornos (ej. `Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", ... })` o formato explícito por partes) y/o sincronizar el tiempo relativo en cliente mediante `useEffect` (o pasar `serverNowMs` como prop inicial para `UsersManager`).

---

### 🟡 Medio — `H2-04`: Fallos silenciosos en acciones de UI Admin y carga de KPIs/Logs

**Ubicación:**
- [src/components/admin/UsersManager.tsx](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/components/admin/UsersManager.tsx#L172-L177) (`revokeUserSessions`)
- [src/components/admin/ClassesManager.tsx](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/components/admin/ClassesManager.tsx#L110-L113) (`toggleStatus`)
- [src/components/admin/StudentsManager.tsx](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/components/admin/StudentsManager.tsx#L211-L214) (`toggleStatus`)
- [src/components/admin/AdminDashboard.tsx](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/components/admin/AdminDashboard.tsx#L30-L37)
- [src/components/admin/AuditLogsViewer.tsx](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/components/admin/AuditLogsViewer.tsx#L64-L77)

**Descripción:**
- En los botones de acción rápida (`revokeUserSessions`, `toggleStatus` en clases y alumnos), los bloques `if (res.ok) { ... }` carecen de rama `else` para informar errores (`400`, `403`, `500`) mediante `setError(...)`.
- En `AdminDashboard.tsx`, `fetch(...).then((r) => r.json())` no verifica `r.ok` ni captura errores de red con `.catch(...)`.
- En `AuditLogsViewer.tsx`, `fetchLogs` ignora silenciosamente respuestas `!res.ok`.

**Recomendación:**  
Manejar explícitamente `!res.ok` y excepciones de red mostrando mensajes claros de error en la UI para evitar que el usuario perciba que una acción se ignoró sin motivo.

---

### 🟡 Medio — `H2-05`: Casos borde en cambio de rol, transferencia+desactivación simultánea y tag de preferencia personalizada

**Ubicación:**
- [src/app/api/admin/users/[id]/route.ts](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/app/api/admin/users/%5Bid%5D/route.ts#L56-L59) (y UI [L131](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/components/admin/UsersManager.tsx#L131))
- [src/app/api/admin/students/[id]/route.ts](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/app/api/admin/students/%5Bid%5D/route.ts#L60-L92)
- [src/components/admin/StudentsManager.tsx](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/components/admin/StudentsManager.tsx#L321-L337)

**Descripción:**
1. **Cambio de rol sin revocación / aviso propio de email:** Al cambiar el `email` de un usuario, se revocan sus sesiones (correcto). Sin embargo, al cambiar `role` (por ejemplo de `TEACHER` a `PARENT`), las sesiones activas no se revocan; aunque `requireAuth` lee el rol actualizado desde BD, la UI abierta del usuario conserva rutas/estado previo hasta recargar. Además, el aviso en `UsersManager.tsx` L131 asume siempre edición de terceros si cambia el correo, aunque el propio `SUPER_ADMIN` puede cambiar su correo y quedar desconectado inmediatamente.
2. **Traslado + desactivación en un mismo `PATCH` de alumno:** En `students/[id]/route.ts`, si `classChanged` y `status = "INACTIVE"` llegan juntos, se abre una fila nueva en `student_class_history` (`unassignedAt = null`) para la clase destino y además la rama `else if` omite el registro `STUDENT_UPDATE` en `audit_logs` para el cambio de estado/datos.
3. **Preferencia personalizada en `StudentsManager.tsx`:** Si el administrador escribe un texto en `"Otra preferencia..."` y guarda el formulario sin presionar antes el botón `"Agregar"`, el valor queda en el input local y no se incluye en `preferences`. Tampoco se valida longitud/formato antes de agregar el chip al estado local.

**Recomendación:**
- Evaluar revocar sesiones activas cuando cambia `role` en `PATCH /api/admin/users/[id]`.
- En `PATCH /api/admin/students/[id]`, evitar abrir un historial activo si el alumno queda `INACTIVE`, o registrar explícitamente el cambio de estado cuando coincida con un traslado.
- En `StudentsManager.tsx`, incorporar automáticamente el texto pendiente de `customPref` al enviar el formulario (o advertir antes de guardar) y validar con el mismo límite de Zod antes de añadirlo al array.

---

### 🟢 Bajo — `H2-06`: Brechas menores de proyección y cobertura en pruebas de integración

**Ubicación:**
- [src/app/api/admin/users/route.ts](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/app/api/admin/users/route.ts#L18) y [src/app/(admin)/admin/usuarios/page.tsx](file:///C:/Users/sebas/Workspace/Proyecto_ED/src/app/%28admin%29/admin/usuarios/page.tsx#L13)
- [tests/integration/hito2-admin.test.ts](file:///C:/Users/sebas/Workspace/Proyecto_ED/tests/integration/hito2-admin.test.ts#L1-L436)

**Descripción:**
1. `GET /api/admin/users` y `/admin/usuarios` usan `db.select().from(users)` trayendo todas las columnas de la tabla; aunque actualmente `users` no almacena contraseñas ni secretos, es más mantenible y seguro usar proyección explícita de columnas.
2. En `tests/integration/hito2-admin.test.ts` faltan casos que habrían detectado `H2-01`, `H2-02` y bordes de filtros/autorización:
   - `PATCH /api/admin/classes/:id` enviando solo `{ teacherIds }`.
   - `PATCH /api/admin/students/:id` enviando solo `{ parents }`.
   - Rechazo al asignar apoderado `INACTIVE` o clase `ARCHIVED`.
   - Filtros de `audit-logs` por `actorUserId`, `actorRole` y rango `from`/`to` (`America/Santiago`).
   - `GET /api/admin/kpis` con `classId` inválido (`400`) y verificación `403` sobre endpoints `POST`/`PATCH` (actualmente el loop de L101 solo cubre `GET`).

---

## 4. Checklist Priorizado antes de Iniciar el Hito 3

Según la compuerta de cierre de `AGENTS.md`, aunque las pruebas existentes pasan, se recomienda corregir antes de pasar al **Hito 3**:

1. **[Crítico — `H2-01`]** Corregir `.set({})` vacío en `PATCH` de `classes/[id]`, `students/[id]` y `users/[id]`, y agregar tests de integración enviando solo `teacherIds` y solo `parents`.
2. **[Alto — `H2-02`]** Bloquear clases `ARCHIVED` y apoderados `INACTIVE` en `POST`/`PATCH` de alumnos y reflejarlo en `StudentsManager.tsx`.
3. **[Alto — `H2-03`]** Eliminar el riesgo de *hydration mismatch* en `UsersManager.tsx` (`Date.now()`) y `AuditLogsViewer.tsx` (`toLocaleString`).
4. **[Medio — `H2-04` / `H2-05`]** Mostrar errores `!res.ok` en botones de acción, dashboard KPI y visor de logs; revisar `customPref` al guardar alumno y casos borde de cambio de rol / traslado+desactivación.
5. **[Bajo — `H2-06`]** Ampliar pruebas de integración (`403` en mutaciones, filtros completos de `audit-logs`, `classId` inválido en `kpis`) y usar proyección explícita en `users`.
