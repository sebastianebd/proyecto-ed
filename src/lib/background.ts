import { waitUntil } from "@vercel/functions";

/**
 * Ejecuta una tarea en segundo plano sin bloquear la respuesta (evita diferenciales de tiempo
 * en request-otp). En Vercel usa waitUntil; en `next dev`/tests la promesa corre sin await.
 * Los errores se capturan y quedan solo en logs de servidor.
 */
export function runInBackground(task: () => Promise<unknown>): void {
  const promise = (async () => task())().catch((err) =>
    console.error("[background] error:", err instanceof Error ? err.message : err),
  );
  try {
    waitUntil(promise);
  } catch {
    // Fuera de Vercel no hay contexto de solicitud: la promesa ya está en curso.
  }
}
