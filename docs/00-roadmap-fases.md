# Roadmap del Proyecto — App PWA Escuela Dominical

Este documento define las fases de trabajo para llevar la aplicación desde la idea inicial hasta su puesta en producción, manteniendo un archivo `.md` dedicado por cada fase para ir refinando decisiones antes de pasar a la siguiente.

## Fases del Proyecto

| Fase | Archivo | Estado | Propósito principal |
| :--- | :--- | :--- | :--- |
| **1. Análisis y Requerimientos** | [01-analisis-y-requerimientos.md](./01-analisis-y-requerimientos.md) | 🟢 Aprobada (v1.5 Final) | Definir actores, reglas de negocio, historias de usuario con criterios de aceptación, datos mínimos y alcance MVP. |
| **2. Diseño de la App y Arquitectura** | [02-diseno-y-arquitectura.md](./02-diseno-y-arquitectura.md) | 🟢 Aprobada (v1.6) | Definir stack tecnológico ($0), modelo de datos físico (ERD), sistema visual ACyM, flujo de PDF/IA, contratos API y diseño de pantallas (UI/UX). |
| **3. Seguridad y Privacidad** | [03-seguridad.md](./03-seguridad.md) | 🟢 Aprobada (v1.4) | Diseñar validación de RUT, flujo OTP seguro, ciclo de vida del token de 30 días, RBAC (Super Admin / Profesor / Padre), RLS en Supabase, matriz de validación de inputs, protección de menores y auditoría. |
| **4. Plan de Codificación** | [04-codificacion.md](./04-codificacion.md) | 🟢 Lista con tablero de hitos (v1.2) | Definir estructura del repositorio, dependencias mínimas, estándares de código y desglose por hitos de desarrollo. |
| **5. Pruebas y Calidad (QA)** | [05-pruebas-y-qa.md](./05-pruebas-y-qa.md) | 🟢 Lista para ejecución paralela (v1.1) | Definir pruebas unitarias, de integración, flujos críticos (OTP, desbloqueo lunes 00:01, asistencia, flags de lectura) y pruebas de instalabilidad PWA en Android e iOS. |
| **6. Implementación y Despliegue** | `06-implementacion-y-despliegue.md` | ⚪ Pendiente | Seleccionar hosting gratuito o de bajo costo, configurar dominio/HTTPS (obligatorio para PWA), variables de entorno, respaldos de BD, monitoreo y checklist de salida a producción. |

## Forma de trabajo recomendada

1. Revisar y cerrar las **preguntas abiertas** de la Fase 1.
2. Congelar una versión `v1.0` de los requerimientos del **MVP** (Producto Mínimo Viable) para no sobredimensionar el primer lanzamiento.
3. Avanzar fase por fase generando y validando cada `.md` antes de escribir código.
