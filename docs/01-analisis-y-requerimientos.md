# Fase 1: Análisis y Requerimientos

> **Versión:** 1.5 (Baseline Final Aprobado — ajustado tras auditoría QA Ronda 2)  
> **Estado:** ✅ Cerrada y aprobada  
> **Objetivo:** Especificar de forma completa y sin ambigüedades qué debe hacer la PWA de Escuela Dominical, sus roles, reglas de negocio, historias de usuario con criterios de aceptación, datos mínimos, KPIs y alcance MVP como base oficial para las fases siguientes.

---

## 1. Visión General y Contexto

- **Propósito:** Proveer una herramienta digital para la **Escuela Dominical** de una iglesia que conecte la enseñanza del domingo con el refuerzo semanal en casa por parte de padres, madres o tutores.
- **Formato:** **PWA (Progressive Web App)** instalable en **Android e iOS** sin costos de publicación en tiendas oficiales.
- **Restricción presupuestaria:** Sin financiamiento externo; las fases siguientes priorizarán herramientas y hosting gratuitos (free tier) o de costo mínimo.

---

## 2. Actores, Roles y Jerarquía de Permisos

| Rol / Entidad | Acceso a App | Permisos y responsabilidades |
| :--- | :---: | :--- |
| **Super Admin** | Sí | **Hereda todas las capacidades del Profesor** (ver las 14 lecciones sin bloqueo, descargar PDF, pasar lista, ver perfil del niño y seguimiento) **más administración total**: crea, modifica y desactiva usuarios (profesores, padres, niños); crea y gestiona clases/cursos; asigna alumnos, profesores y unidades; carga y revisa el PDF de 14 lecciones; controla/reprograma el calendario; corrige asistencias **sin límite de plazo**; ve **usuarios conectados en tiempo real** y consulta los **logs de auditoría completos**. |
| **Profesor (Admin de clase)** | Sí | Accede a sus clases asignadas; **visualiza las 14 lecciones completas sin bloqueo** y puede **descargar el PDF original** de la unidad como respaldo; consulta el **perfil del niño** (datos, cuidados y preferencias); pasa la **lista de asistencia** dominical (con plazo limitado de corrección); y revisa el **seguimiento de padres** (KPIs, *Visto* y *Completado*). **No** crea, edita ni elimina usuarios, clases ni materiales, ni ve los logs del sistema. |
| **Padre / Madre / Tutor** | Sí | Accede a la PWA tras su enrolamiento; visualiza las unidades (activa + historial en acordeón) de la(s) clase(s) de su(s) hijo(s); lee el **pasaje bíblico base**, **resumen adaptado** y **preguntas de refuerzo** de las lecciones desbloqueadas; y marca/desmarca la lección como **completada**. **No** ve la asistencia, **no** accede al PDF original del profesor ni a logs. |
| **Niño / Alumno** | **No** | Entidad de datos sin credenciales ni acceso a la app. Pertenece a una clase/curso, tiene perfil con cuidados y preferencias, uno o más padres/tutores vinculados y acumula historial de asistencia y de refuerzo en casa. |

---

## 3. Requerimientos Funcionales (RF)

### 3.1. Autenticación, Enrolamiento (Onboarding) y Sesiones
- **RF-01 — Pre-registro obligatorio y Bootstrap inicial:** No existe auto-registro abierto. El Super Admin crea previamente al Profesor o Padre/Tutor con **RUT** único, nombre completo y **correo electrónico único por usuario**. El primer `SUPER_ADMIN` se inicializa mediante script de carga inicial (`seed`).
- **RF-02 — Acceso por RUT + OTP por correo:**
  1. Al abrir la PWA sin sesión activa, el usuario ingresa su **RUT** (validando formato y dígito verificador chileno).
  2. Si el RUT corresponde a un usuario activo (o pendiente de onboarding), el sistema envía un **código OTP** de un solo uso y corta duración al correo electrónico registrado (con opción de reenvío tras una espera breve).
  3. Si el RUT no existe o el usuario está inactivo, el sistema muestra un mensaje genérico solicitando contactar al encargado/Super Admin.
- **RF-03 — Flujo de Onboarding (primer ingreso):** Al validar su primer OTP, el usuario completa un onboarding breve:
  - Confirmación de datos básicos (nombre, clase(s) o hijos vinculados si es padre).
  - Guía visual corta para instalar la PWA en pantalla de inicio (Android / iOS Safari).
  - Solicitud amigable de permiso para **notificaciones push** únicamente si el dispositivo/navegador ya soporta `PushManager` (en iOS Safari abierto fuera de la pantalla de inicio, informa cómo activarlo luego en **Mi Perfil** una vez instalada la app, sin bloquear el onboarding).
- **RF-04 — Token de sesión de 30 días:** Tras validar el OTP, el sistema emite un token de sesión con vigencia de **30 días** para evitar autenticarse cada semana.
- **RF-05 — Cierre y revocación de sesión:** El usuario puede cerrar sesión manualmente (desvinculando también la suscripción Web Push de ese dispositivo para esa cuenta); el Super Admin puede desactivar un usuario o revocar sus sesiones activas en cualquier momento.

### 3.2. Gestión de Clases, Usuarios y Alumnos (Exclusivo Super Admin)
- **RF-06 — Gestión de Clases/Cursos:** Crear, editar y archivar clases (soportando múltiples cursos a futuro aunque hoy exista 1), asignando profesores, alumnos y unidades.
- **RF-07 — Gestión de Profesores:** Alta, edición, asignación a una o más clases y desactivación.
- **RF-08 — Gestión de Padres/Madres/Tutores:** Alta, edición (incluyendo actualización de correo) y desactivación.
- **RF-09 — Gestión de Niños/Alumnos (Ficha enriquecida e historial de clase):** Alta, edición, cambio de clase (conservando el historial de asistencias y unidades finalizadas de su clase anterior) y desactivación (baja lógica conservando historial), con vínculo **N:M** hacia sus padres/tutores. Además de sus datos personales, la ficha permite registrar opcionalmente:
  - **Cuidados especiales / Alergias / Notas médicas.**
  - **Preferencias o intereses de aprendizaje** (ej. *dibujar, pintar, cantar, escribir*, u otras etiquetas/notas).
  - *Regla de presentación y privacidad:* Estos cuidados y preferencias forman parte de una **ficha interna** consultable únicamente por los **Profesores de su clase y el Super Admin** (los padres **no** tienen visibilidad de esta ficha), y **no** recargan la pantalla rápida de toma de asistencia.
- **RF-10 — Estado de Enrolamiento y Presencia en Vivo (Super Admin):** En el panel de usuarios, el Super Admin puede ver el estado de onboarding (`Pendiente` / `Activo` / `Inactivo`) y consultar qué usuarios se encuentran **conectados en tiempo real** (en línea / última actividad reciente).

### 3.3. Carga de PDF, Extracción y Navegación por Unidades
- **RF-11 — Carga de PDF único de Unidad (14 lecciones):** El Super Admin sube un único documento PDF que contiene las **14 lecciones** completas de la unidad (guía detallada del profesor).
- **RF-12 — Extracción y generación automática para padres:** Al procesar el PDF, el sistema separa las **14 lecciones** y genera por cada una:
  - Título de la lección.
  - **Pasaje bíblico base** de la clase.
  - **Resumen adaptado para padres** (extensión media equilibrada: comprensible y sustancioso, sin detalles operativos/tiempos del profesor).
  - **2 a 3 preguntas de refuerzo** (o más si aporta valor) para trabajar con los hijos en casa.
- **RF-13 — Revisión y edición previa (Control Super Admin):** El Super Admin puede revisar, editar y ajustar el título, pasaje bíblico, resumen y preguntas de cada lección antes de dejarla programada.
- **RF-14 — Acceso total y respaldo PDF para Profesores (y Super Admin):** Profesores asignados a la clase (y Super Admin) ven las **14 lecciones sin restricciones ni bloqueos** y pueden **descargar el PDF original** de la unidad desde la app si se les extravía. Los padres **nunca** tienen acceso ni descarga de ese PDF.
- **RF-15 — Historial de Unidades en formato Acordeón (Desplegable):**
  - Las unidades finalizadas/anteriores permanecen accesibles para consulta en formato colapsable/acordeón:
    - `> Unidad 1` (colapsada; al pincharla se despliegan sus 14 lecciones ya pasadas).
    - `v Unidad 2` (unidad activa desplegada por defecto, mostrando sus 14 lecciones con desbloqueo semanal progresivo).

### 3.4. Desbloqueo Semanal, Reprogramación y Notificación
- **RF-16 — Regla de desbloqueo lunes 00:01:** Cada lección impartida en un domingo $D$ se desbloquea automáticamente para los padres el **lunes siguiente a las 00:01** (hora local `America/Santiago`).
- **RF-17 — Visibilidad de lecciones bloqueadas (Padres):** En la unidad activa, los padres ven la lista de las 14 lecciones; las aún no desbloqueadas se muestran visibles en el listado pero **bloqueadas** (sin acceso al contenido ni a marcar completado).
- **RF-18 — Pausa, reprogramación y ajuste manual de clases:** El Super Admin puede pausar/postergar la clase pendiente seleccionando desde qué lección aplicar `+7 días` en bloque para esa lección y todas las siguientes programadas (**incluyendo la lección del lunes en curso si se ejecuta el lunes por la mañana antes de que los padres entren / antes del Push**, con opción de revertir `-7 días` en caso de error), además de poder desbloquear (`FORCE_UNLOCKED`) o bloquear (`FORCE_LOCKED`) manualmente una lección puntual.
- **RF-19 — Notificación de nueva lección (Lunes ventana mediodía `12:00–14:00 hrs`):** El sistema envía una **notificación Push Web** el día lunes dentro de la ventana de mediodía (**`12:00–14:00 hrs America/Santiago`**, considerando horario de verano/invierno y cron gratuito) a los padres activos con notificaciones activadas cuando exista al menos una nueva lección desbloqueada ese lunes en alguna clase activa de sus hijos (si la semana fue pausada, no se envía notificación; máx. 1 notificación agrupada por padre).

### 3.5. Seguimiento de Lectura ("Visto") y "Completado"
- **RF-20 — Flag "Visto / Abierto" (Individual por Padre/Tutor):** Cada vez que una cuenta de padre o madre abre una lección desbloqueada, se registra `primera_vista_at` y `ultima_vista_at` para `(leccion_id, usuario_padre_id)`. Este registro es individual y permanente (no se borra si se desmarca el completado).
- **RF-21 — Flag "Completado" (Compartido por Alumno en la clase):**
  - El botón **"Marcar como completada"** abre primero un **modal de confirmación** para evitar clics accidentales. Si el padre tiene **más de un hijo en esa misma clase**, el modal permite **seleccionar a qué hijo(s)** se les realizó el refuerzo en casa.
  - Al confirmar, se registra el cumplimiento para `(leccion_id, alumno_id)` del/de los hijo(s) seleccionado(s), guardando qué tutor lo ejecutó (`completado_por_usuario_id`, `fecha_completado`).
  - Si **mamá y papá** tienen cuentas separadas para el mismo alumno y uno marca como completada la lección, el otro padre la ve automáticamente como **"✅ Completada (por [Nombre del otro tutor])"**.
- **RF-22 — Deshacer "Completado":** Si un padre marcó completada una lección por error a pesar del modal, puede presionar **"Desmarcar / Revertir"** (seleccionando el/los hijo(s) si tiene >1 en la clase y con confirmación previa), devolviendo la lección a estado pendiente para su(s) hijo(s).

### 3.6. Asistencia Dominical e Indicadores (KPIs)
- **RF-23 — Toma de asistencia con plazo de corrección (Interna):**
  - Todas las clases se realizan **en domingo**. El profesor (o Super Admin) selecciona su clase y una fecha dominical (`<= hoy`, nunca futura), y marca para cada alumno activo **Presente** o **Ausente**, con una **observación opcional**. Esta información **no es visible para los padres**.
  - Si un profesor olvidó pasar lista ese domingo, puede **crear por primera vez** el registro de asistencia de ese domingo pasado posteriormente.
  - **Una vez creada** la asistencia de esa clase/fecha dominical (al existir al menos un registro guardado para esa clase y domingo), el **Profesor** tiene un plazo de **3 días calendario** desde esa fecha inicial de creación (en `America/Santiago`) para modificar o completar alumnos de esa fecha. Vencido ese plazo, toda la lista de ese domingo queda en modo solo lectura para el Profesor.
  - El **Super Admin** puede crear o corregir asistencias **sin límite de plazo**.
- **RF-24 — Historial de asistencia:** Consulta histórica por fecha dominical o por alumno para Profesores y Super Admin (conservando registros históricos incluso si un alumno cambió de clase o pasó a inactivo).
- **RF-25 — Panel de seguimiento y KPIs (Sin alertas automáticas):** Métricas limpias con fórmulas explícitas:
  - **KPI Asistencia Dominical:** `%` de presentes sobre total de alumnos evaluados en los domingos con asistencia registrada (excluyendo semanas pausadas sin clase).
  - **KPI Apertura (Engagement de apoderados):** `%` de pares `(lección ya desbloqueada, padre activo vinculado)` que cuentan con registro de **Visto**.
  - **KPI Refuerzo en Casa (Cobertura por alumno):** `%` de pares `(lección ya desbloqueada, alumno activo con al menos un padre vinculado)` que cuentan con registro de **Completado**.

### 3.7. Auditoría y Trazabilidad del Sistema (Exclusivo Super Admin)
- **RF-26 — Registro completo de Logs de Auditoría:** El sistema debe registrar automáticamente un historial inmutable de cada acción relevante realizada en la aplicación:
  - Quién realizó la acción (`usuario_id`, nombre, rol).
  - Qué acción ejecutó según catálogo unificado (ej. `LOGIN_OTP`, `ONBOARDING_COMPLETED`, `LOGOUT`, `USER_CREATE`, `USER_EMAIL_CHANGED`, `STUDENT_UPDATE`, `UNIT_PDF_UPLOAD`, `UNIT_ACTIVATE`, `UNIT_POSTPONE`, `UNIT_UNPOSTPONE`, `PDF_DOWNLOAD`, `ATTENDANCE_SAVE`, `ATTENDANCE_ADMIN_OVERRIDE`, `LESSON_VIEW`, `LESSON_COMPLETE`, `LESSON_UNCOMPLETE`, `SESSION_REVOKED`). Los pulsos frecuentes de presencia (`presence/ping`) **no** se registran en auditoría para no saturar la BD.
  - Entidad afectada, resumen de cambio (valores previos/nuevos relevantes) y fecha/hora exacta (`timestamp`).
- **RF-27 — Visor de Logs (Solo Super Admin):** El Super Admin cuenta con un módulo de Auditoría filtrable por fecha, usuario, rol o tipo de evento. Ningún Profesor ni Padre tiene acceso a los logs.

---

## 4. Historias de Usuario por Rol

### 4.1. Historias de Usuario — Padre / Madre / Tutor

- **HU-PAD-01 — Inicio de sesión con RUT y OTP por correo**  
  *Yo como* Padre/Madre/Tutor *quiero* ingresar mi RUT y recibir un código temporal en mi correo electrónico *para* autenticarme de forma simple sin tener que crear ni recordar contraseñas.  
  *Criterios de aceptación:*
  - Valida formato y dígito verificador del RUT antes de enviar.
  - Si el RUT está registrado y activo/pendiente, envía un OTP al correo asociado (con opción de reenviar código tras espera breve).
  - Si el RUT no está registrado, muestra un mensaje amigable indicando contactar al encargado sin exponer datos sensibles.

- **HU-PAD-02 — Onboarding inicial e instalación PWA**  
  *Yo como* Padre/Madre/Tutor nuevo *quiero* pasar por una bienvenida guiada en mi primer acceso *para* confirmar mis datos, ver a mis hijos vinculados, aprender a instalar la app en mi teléfono y activar las notificaciones.  
  *Criterios de aceptación:*
  - Muestra nombre del tutor y la lista de hijo(s)/clase(s) vinculados.
  - Muestra instrucciones simples según dispositivo (Android o iPhone/Safari) para agregar a la pantalla de inicio.
  - Permite activar (o postergar para más tarde desde el perfil) el permiso de notificaciones push; si el usuario accede desde iOS Safari sin instalar la PWA (fuera de modo *standalone*), muestra instrucción para instalar primero sin bloquear ni fallar el onboarding.

- **HU-PAD-03 — Sesión persistente por 30 días**  
  *Yo como* Padre/Madre/Tutor *quiero* que la aplicación mantenga mi sesión iniciada durante 30 días *para* poder abrirla cada semana sin tener que pedir un código OTP todos los domingos.  
  *Criterios de aceptación:*
  - Mientras el token de 30 días esté vigente y no haya sido revocado, la app abre directo en el inicio.
  - Puedo cerrar sesión manualmente desde mi perfil si cambio de teléfono o uso un equipo compartido, revocando la sesión y desvinculando la suscripción Web Push de ese navegador.

- **HU-PAD-04 — Explorar unidades en acordeón y ver estado de lecciones**  
  *Yo como* Padre/Madre/Tutor *quiero* ver las 14 lecciones de la unidad actual (distinguiendo cuáles están desbloqueadas y cuáles bloqueadas) y poder desplegar unidades anteriores *para* ubicar fácilmente el tema de esta semana o repasar uno pasado.  
  *Criterios de aceptación:*
  - La unidad activa aparece desplegada; las unidades finalizadas aparecen colapsadas (`> Unidad 1`) y se despliegan al tocarlas.
  - Las lecciones futuras muestran título/número e ícono de candado y no permiten abrir su contenido.
  - Si tuviera hijos en más de una clase, puedo cambiar o filtrar fácilmente por clase/hijo.

- **HU-PAD-05 — Leer resumen, pasaje bíblico y preguntas de refuerzo (y registrar "Visto")**  
  *Yo como* Padre/Madre/Tutor *quiero* abrir una lección desbloqueada y leer su pasaje bíblico base, un resumen claro de la clase y 2–3 preguntas guía *para* poder conversar y reforzar la enseñanza con mi(s) hijo(s) en casa.  
  *Criterios de aceptación:*
  - Muestra título, pasaje bíblico base, resumen adaptado y preguntas de refuerzo en formato legible en celular.
  - Al ingresar a la lección, el sistema registra automáticamente mi "Visto" individual con fecha/hora y deja registro en auditoría.
  - No existe ningún enlace ni opción para ver/descargar el PDF original del profesor.

- **HU-PAD-06 — Marcar lección como completada (sincronizado con el otro padre)**  
  *Yo como* Padre/Madre/Tutor *quiero* marcar la lección como completada después de confirmarlo en un mensaje emergente *para* dejar constancia de que la trabajamos en casa y evitar que el otro padre tenga que marcarla de nuevo.  
  *Criterios de aceptación:*
  - Al tocar "Marcar como completada", aparece un modal de confirmación indicando el/los hijo(s) de esa clase; si el padre tiene más de un hijo en la misma clase, el modal permite seleccionar específicamente a qué hijo(s) marcar (con todos preseleccionados por defecto).
  - Al confirmar, se marca como completada para los alumnos seleccionados y el otro padre vinculado ve en su propia app quién la completó y cuándo.

- **HU-PAD-07 — Desmarcar una lección completada por error**  
  *Yo como* Padre/Madre/Tutor *quiero* poder revertir el estado de completado si presioné confirmar por equivocación *para* que el registro refleje la realidad antes de trabajar la lección con mi hijo.  
  *Criterios de aceptación:*
  - Una lección completada ofrece la opción de "Desmarcar" con confirmación previa (permitiendo elegir el/los hijo(s) si aplica en la misma clase).
  - Al revertir, vuelve a estado pendiente para ambos padres en los alumnos seleccionados, el flag de "Visto" se mantiene y la acción queda registrada en los logs.

- **HU-PAD-08 — Recibir notificación push los lunes entre 12:00 y 14:00 hrs**  
  *Yo como* Padre/Madre/Tutor *quiero* recibir una notificación en mi celular el lunes al mediodía cuando haya una nueva lección disponible *para* acordarme de repasarla durante la semana con mi(s) hijo(s).  
  *Criterios de aceptación:*
  - Si tengo la PWA instalada (Android o iOS) con permisos activos y se desbloqueó una lección ese lunes a las `00:01` en alguna de las clases de mis hijos activos, recibo **1 notificación agrupada** en la ventana de `12:00–14:00` hrs Chile (`America/Santiago`).
  - Si la clase de ese domingo fue pausada/reprogramada o corresponde a otra clase donde no tengo hijos, no recibo notificación engañosa.

- **HU-PAD-09 — Gestionar notificaciones y perfil propio**  
  *Yo como* Padre/Madre/Tutor *quiero* ver mi información básica, mis hijos vinculados y el estado de mis notificaciones en mi perfil *para* poder activar los avisos después del onboarding si en su momento los rechacé o cambié de celular.  
  *Criterios de aceptación:*
  - Muestra nombre, correo, hijos/clases y botón para activar notificaciones / cerrar sesión.

---

### 4.2. Historias de Usuario — Profesor (Admin de Clase)

- **HU-PRO-01 — Ingreso y sesión de 30 días**  
  *Yo como* Profesor *quiero* ingresar con mi RUT + OTP por correo y mantener mi sesión por 30 días *para* acceder rápidamente cada domingo en la sala sin perder tiempo logueándome.  
  *Criterios de aceptación:* Mismo flujo de RUT + OTP + token 30 días + onboarding inicial.

- **HU-PRO-02 — Visualizar las 14 lecciones sin bloqueo y descargar el PDF de respaldo**  
  *Yo como* Profesor *quiero* acceder a las 14 lecciones de mi clase sin restricciones de fecha y poder descargar el PDF original de la unidad *para* preparar con anticipación mis clases o recuperarlo si se me extravía.  
  *Criterios de aceptación:*
  - Todas las lecciones de la unidad activa y unidades anteriores de mi(s) clase(s) están abiertas para mí en cualquier momento.
  - Puedo descargar el PDF de la unidad desde la app (quedando registrada la descarga en auditoría).

- **HU-PRO-03 — Pasar lista de asistencia dominical dentro del plazo habilitado**  
  *Yo como* Profesor *quiero* marcar qué niños estuvieron presentes o ausentes en la fecha del domingo y agregar una observación opcional *para* llevar el registro real de asistencia desde el celular.  
  *Criterios de aceptación:*
  - Veo únicamente los alumnos activos de mi(s) clase(s) asignada(s), sin saturar la lista con datos de perfil/preferencias.
  - Solo permite seleccionar fechas que correspondan estrictamente a domingo (`<= hoy` en `America/Santiago`). Si olvidé tomar la lista un domingo anterior sin registro, puedo **crearla** posteriormente.
  - Puedo marcar Presente / Ausente rápidamente y escribir una observación opcional por alumno.
  - Una vez creada la asistencia para un domingo, puedo modificarla únicamente dentro de los **3 días calendario desde su creación** en `America/Santiago`; vencido ese plazo, solo puedo consultarla en modo lectura.

- **HU-PRO-04 — Consultar la ficha interna del niño (cuidados y preferencias)**  
  *Yo como* Profesor *quiero* abrir la ficha individual interna de un alumno de mi clase para conocer sus cuidados especiales (ej. alergias) y qué actividades prefiere (ej. dibujar, pintar, cantar, escribir) *para* cuidar mejor al niño y adaptar la dinámica de la clase.  
  *Criterios de aceptación:*
  - Al tocar el nombre de un niño en la sección de alumnos de mi clase, veo su ficha interna con edad/fecha de nacimiento, cuidados/alergias y preferencias/intereses (no visible para padres).
  - Esta información no estorba en la vista rápida de pasar lista.

- **HU-PRO-05 — Consultar historial de asistencia**  
  *Yo como* Profesor *quiero* revisar el historial de asistencias de domingos pasados o por alumno *para* conocer la constancia de asistencia de los niños de mi grupo.  
  *Criterios de aceptación:*
  - Puedo navegar por fechas de domingo pasadas y ver quién estuvo presente/ausente y sus observaciones.

- **HU-PRO-06 — Ver seguimiento de padres ("Visto" y "Completado") por lección**  
  *Yo como* Profesor *quiero* revisar en cada lección qué padres la abrieron y qué alumnos la tienen marcada como completada *para* saber cómo está funcionando el refuerzo en casa.  
  *Criterios de aceptación:*
  - Por cada lección veo lista de alumnos (`Completado por [Nombre]` / `Pendiente`) y detalle individual por cada apoderado (`Visto el [fecha/hora]` / `No visto`).

- **HU-PRO-07 — Consultar KPIs de mi clase**  
  *Yo como* Profesor *quiero* ver indicadores resumidos de asistencia, apertura de lecciones y completado en casa de mi clase *para* evaluar la participación general del curso de un vistazo.  
  *Criterios de aceptación:*
  - Muestra porcentajes claros de asistencia, `% de padres que abrieron` y `% de alumnos que completaron` sin alertas invasivas.

---

### 4.3. Historias de Usuario — Super Admin

- **HU-ADM-01 — Operar también como Profesor**  
  *Yo como* Super Admin *quiero* tener acceso a todas las funciones de Profesor en las clases donde enseño *para* poder pasar lista, ver fichas de niños, descargar el PDF, revisar lecciones y ver el seguimiento de padres usando una sola cuenta.  
  *Criterios de aceptación:*
  - Desde mi sesión de Super Admin accedo tanto al módulo de gestión administrativa como a todas las vistas y acciones de Profesor.

- **HU-ADM-02 — Crear y administrar Clases/Cursos**  
  *Yo como* Super Admin *quiero* crear, editar o archivar clases y asignarles profesores *para* organizar la Escuela Dominical ahora con un curso y escalar fácilmente cuando se creen nuevos grupos por edad.  
  *Criterios de aceptación:*
  - Permite crear clase (nombre, descripción/rango de edad), asignar 1 o más profesores y archivar clases antiguas.

- **HU-ADM-03 — Pre-registrar, gestionar usuarios y ver conectados en tiempo real**  
  *Yo como* Super Admin *quiero* crear, modificar y desactivar cuentas de Profesores y Padres, ver su estado de onboarding y saber quiénes están conectados en tiempo real *para* administrar el acceso y acompañar la adopción de la app.  
  *Criterios de aceptación:*
  - Permite ingresar RUT (validado, sin duplicados), nombre completo, correo y rol.
  - Muestra estado de cuenta (`Pendiente onboarding` / `Activo` / `Inactivo`) e indicador en tiempo real de usuarios actualmente conectados.
  - Permite revocar sesiones o desactivar cuentas inmediatamente.

- **HU-ADM-04 — Crear y enriquecer el perfil de los Niños/Alumnos**  
  *Yo como* Super Admin *quiero* registrar a cada niño con sus datos personales, cuidados especiales, preferencias (dibujar, pintar, cantar, escribir, etc.), clase y padres vinculados *para* centralizar toda la información relevante del alumno.  
  *Criterios de aceptación:*
  - Permite asociar N padres/tutores a 1 niño y N niños a 1 padre.
  - Incluye campos opcionales de cuidados/alergias y preferencias/intereses del niño.
  - Permite cambiar un niño de clase cuando crezca o desactivarlo conservando su historial.

- **HU-ADM-05 — Cargar PDF único de 14 lecciones y generar material para padres**  
  *Yo como* Super Admin *quiero* subir el PDF completo de la unidad (14 lecciones) para que quede disponible como respaldo para profesores y el sistema extraiga automáticamente cada lección con su pasaje bíblico, resumen y 2–3 preguntas *para* ahorrar horas de redacción manual.  
  *Criterios de aceptación:*
  - Guarda el PDF de forma privada (descargable solo por Profesores de la clase y Super Admin, nunca por Padres).
  - Separa las 14 lecciones y genera título, pasaje bíblico base, resumen adaptado y al menos 2–3 preguntas por cada una.

- **HU-ADM-06 — Revisar, editar y aprobar el contenido generado antes de publicar**  
  *Yo como* Super Admin *quiero* revisar y editar manualmente cada lección generada antes de activarla *para* garantizar fidelidad bíblica y claridad para los padres.  
  *Criterios de aceptación:*
  - Las lecciones generadas quedan en borrador editable hasta publicar la unidad, y siguen siendo editables después.

- **HU-ADM-07 — Programar, pausar y reprogramar el calendario de desbloqueo**  
  *Yo como* Super Admin *quiero* definir la fecha de inicio de la unidad y poder pausar o correr las clases pendientes (+7 días, `-7 días` para revertir o nueva fecha) *para* que si un domingo hay actividad especial o clase libre, no se desbloquee una lección que aún no se enseña.  
  *Criterios de aceptación:*
  - Por defecto cada lección se desbloquea el lunes `00:01` posterior a su domingo asignado.
  - Pausar/reprogramar (+7 días o revertir `-7 días`) desplaza automáticamente la lección pendiente y todas las siguientes aún no desbloqueadas.
  - Permite desbloquear (`FORCE_UNLOCKED`) o bloquear manualmente (`FORCE_LOCKED`) una lección específica.

- **HU-ADM-08 — Cerrar unidad y activar nueva unidad (Historial)**  
  *Yo como* Super Admin *quiero* finalizar una unidad completada y activar la siguiente *para* que la nueva unidad quede desplegada y la anterior pase ordenada al acordeón de historial.  
  *Criterios de aceptación:*
  - Al finalizar la Unidad 1 y activar la Unidad 2, los padres ven `> Unidad 1` colapsada y `v Unidad 2` activa.

- **HU-ADM-09 — Corregir asistencias sin límite de plazo**  
  *Yo como* Super Admin *quiero* poder registrar o modificar cualquier asistencia pasada sin restricción de días *para* resolver correcciones excepcionales cuando el plazo del profesor ya venció.  
  *Criterios de aceptación:*
  - El Super Admin puede editar asistencias de cualquier fecha pasada, dejando registro de auditoría del cambio.

- **HU-ADM-10 — Visualizar KPIs globales y por clase**  
  *Yo como* Super Admin *quiero* ver los KPIs de asistencia, apertura de lecciones y completado de todas las clases *para* tener visibilidad general del impacto de la Escuela Dominical.

- **HU-ADM-11 — Auditar todos los movimientos del sistema (Logs)**  
  *Yo como* Super Admin *quiero* consultar un registro detallado de todas las acciones realizadas en la aplicación (quién, qué hizo, sobre qué registro y cuándo) *para* mantener control, trazabilidad y seguridad operativa.  
  *Criterios de aceptación:*
  - Muestra lista cronológica de eventos con filtros por usuario, tipo de acción y rango de fechas.
  - Solo el Super Admin tiene acceso a este módulo; los logs son de solo lectura (no editables ni eliminables desde la UI).

---

## 5. Datos Mínimos por Entidad (Nivel Funcional)

| Entidad | Campos funcionales esenciales |
| :--- | :--- |
| **Usuario** | `rut` (único), `nombre_completo`, `email`, `telefono` (opcional), `rol` (`SUPER_ADMIN` \| `PROFESOR` \| `PADRE`), `estado` (`PENDIENTE_ONBOARDING` \| `ACTIVO` \| `INACTIVO`), `ultima_actividad_at` |
| **Clase** | `nombre`, `descripcion_o_edad`, `estado` (`ACTIVA` \| `ARCHIVADA`) |
| **Niño / Alumno** | `nombre_completo`, `fecha_nacimiento` (o año/edad), `clase_id`, `cuidados_especiales` (opcional, ej. alergias), `preferencias` (ej. dibujar, pintar, cantar, escribir + nota opcional), `estado` (`ACTIVO` \| `INACTIVO`) |
| **Vínculo Padre–Niño** | `usuario_padre_id`, `nino_id`, `parentesco` (ej. Mamá, Papá, Tutor - opcional) |
| **Unidad** | `clase_id`, `numero_orden`, `titulo`, `estado` (`BORRADOR` \| `ACTIVA` \| `FINALIZADA`), `archivo_pdf_interno` (descargable por Profesor/SuperAdmin) |
| **Lección** | `unidad_id`, `numero` (`1..14`), `titulo`, `pasaje_biblico`, `resumen_padres`, `preguntas_refuerzo[]`, `fecha_clase_domingo`, `fecha_desbloqueo`, `estado_calendario` (`PROGRAMADA` \| `PAUSADA` \| `DESBLOQUEADA_MANUAL` \| `BLOQUEADA_MANUAL`) |
| **Lección Vista** | `leccion_id`, `usuario_padre_id`, `primera_vista_at`, `ultima_vista_at` |
| **Lección Completada** | `leccion_id`, `nino_id`, `completado_por_usuario_id`, `completado_at` |
| **Asistencia** | `clase_id`, `nino_id`, `fecha_domingo` (domingo `<= hoy`), `presente` (bool), `observacion` (opcional), `registrado_por_usuario_id`, `created_at` (ancla ventana 3 días), `updated_at` |
| **Historial Clase Alumno** | `nino_id`, `clase_id`, `desde_at`, `hasta_at` (conserva trazabilidad histórica tras cambios de clase) |
| **Log de Auditoría** | `actor_usuario_id`, `actor_rol`, `accion`, `entidad_tipo`, `entidad_id`, `detalle_json`, `created_at` |

---

## 6. Requerimientos No Funcionales (RNF)

- **RNF-01 — Compatibilidad PWA Android e iOS:** Cumplir criterios de instalabilidad (`manifest.webmanifest`, íconos, Service Worker, HTTPS), diseño *mobile-first* y guía integrada de instalación para Safari iOS.
- **RNF-02 — Zona horaria estricta:** Los cálculos de domingo, desbloqueo `00:01` del lunes, ventana de **3 días calendario desde la creación** de la asistencia y envío de notificación de los lunes (`12:00–14:00` hrs) deben ejecutarse en `America/Santiago`.
- **RNF-03 — Agilidad en sala:** Pasar asistencia de una clase debe ser rápido (<30 segundos en celular).
- **RNF-04 — Privacidad de menores y trazabilidad:** Ningún dato de alumnos, padres, asistencias, logs o PDF es público; todo acceso requiere sesión válida, autorización por rol/clase y genera auditoría.

---

## 7. Alcance Definitivo: MVP (v1.0) vs Futuro (v2.0)

| Módulo / Capacidad | En MVP (v1.0) | Futuro (v2.0) |
| :--- | :---: | :---: |
| Auth por RUT + OTP por correo + token 30 días + Onboarding | ✅ | |
| Gestión de Clases, Profesores, Padres y Niños (con cuidados y preferencias) | ✅ | |
| Super Admin con permisos de Profesor + estado onboarding + usuarios conectados | ✅ | |
| Carga de PDF único + descarga respaldo para Profesores + extracción/edición | ✅ | |
| Acordeón de Unidades (Unidad anterior colapsable + Unidad activa) | ✅ | |
| Desbloqueo semanal lunes 00:01 + pausa/reprogramación (+7/-7 días) + Push lunes (12:00–14:00) | ✅ | |
| Visto individual + Completado por alumno (modal confirmación + deshacer) | ✅ | |
| Asistencia interna con plazo límite para Profesor y sin límite para Super Admin | ✅ | |
| Panel con KPIs limpios (Asistencia, Visto, Completado) sin alertas | ✅ | |
| Logs completos de auditoría visibles solo para Super Admin | ✅ | |
| Exportación de reportes/logs a Excel/PDF | | ⏳ |

---

## 8. Definiciones Finales Cerradas (v1.5)

1. **Asistencia dominical y plazo de corrección para Profesores (`RF-23`, `RF-24`):** Solo se permiten fechas correspondientes a domingo (`<= hoy` en `America/Santiago`). Si un domingo quedó sin registro, el Profesor puede **crear** la asistencia posteriormente; **una vez creada** la asistencia de esa `(clase, fecha dominical)`, dispone de **3 días calendario desde esa creación inicial** (`America/Santiago`) para modificar o agregar alumnos en esa fecha. Vencido ese plazo, solo el Super Admin puede editar sin límite de tiempo. Los registros históricos se conservan aun cuando el alumno cambie de clase.
2. **Completar/Desmarcar lección con varios hijos en la misma clase (`RF-21`, `RF-22`):** El modal de confirmación permite seleccionar individualmente a qué hijo(s) de esa clase corresponde el refuerzo en casa (preseleccionando a todos por defecto), conservando trazabilidad exacta por alumno.
3. **Notificación Push semanal (`RF-19`):** Ventana de envío los lunes entre `12:00` y `14:00` hrs (`America/Santiago`), filtrada por clases activas del apoderado y agrupada en 1 notificación por padre. En iOS Safari fuera de modo PWA instalado, el onboarding orienta sin bloquear.
4. **Ficha interna del niño (`RF-09`):** Cuidados especiales/alergias y preferencias (dibujar, pintar, cantar, escribir, etc.) son visibles **únicamente para Profesores de la clase y Super Admin** (nunca para padres ni en la lista rápida de asistencia).
5. **Presencia en vivo (`RF-10`):** El panel de Super Admin muestra qué usuarios están 🟢 **En línea** (app abierta con actividad reciente en los últimos ~1–2 minutos, pausando pulsos tras 10 min de inactividad) y su **última conexión**, sin registrar cada pulso en `audit_logs`.
6. **Bootstrap inicial (`RF-01`):** El primer usuario `SUPER_ADMIN` se provisiona mediante script inicial (`seed`) en la BD.
