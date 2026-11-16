import { RutFormat, cleanRut, formatRut, validateRut } from "@fdograph/rut-utilities";

// Wrapper único del RUT chileno (docs/03-seguridad.md §3.1). Seguro para cliente y servidor.

/** Quita TODO espacio en blanco (incluye pegados con espacios antes/después). */
export const stripWhitespace = (value: string) => value.replace(/\s+/g, "");

/**
 * Normaliza y valida un RUT: limpia espacios, exige 7..9 caracteres limpios,
 * valida Módulo 11 + rechazo de patrones sospechosos y devuelve `12345670-K` (DASH, mayúsculas).
 * Devuelve null si es inválido.
 */
export function normalizeRut(input: string): string | null {
  const compact = stripWhitespace(input);
  if (compact.length === 0 || compact.length > 20) return null;
  const clean = cleanRut(compact); // '' si no tiene forma de RUT
  if (clean.length < 7 || clean.length > 9) return null;
  if (!validateRut(clean, true)) return null;
  return formatRut(clean, RutFormat.DASH).toUpperCase();
}

/**
 * Formateo visual para <input> (onChange/onPaste): limpia espacios y símbolos, recorta a 9
 * caracteres significativos y devuelve `12.345.678-5` en cuanto hay datos suficientes.
 */
export function formatRutForInput(raw: string): string {
  const chars = stripWhitespace(raw).replace(/[^0-9kK]/g, "").toUpperCase().slice(0, 9);
  if (chars.length < 7) return chars;
  return formatRut(chars, RutFormat.DOTS_DASH).toUpperCase();
}
