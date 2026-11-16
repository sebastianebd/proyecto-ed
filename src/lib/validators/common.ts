import { z } from "zod";
import { normalizeRut } from "@/lib/rut";

// Helpers y esquemas comunes (docs/03-seguridad.md §7).

const collapseSpaces = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : v);
const cleanMultiline = (v: unknown) =>
  typeof v === "string" ? v.trim().replace(/[ \t]+/g, " ") : v;

export const emptyToUndefined = (v: unknown) => {
  const s = collapseSpaces(v);
  return s === "" ? undefined : s;
};

export const emptyMultilineToUndefined = (v: unknown) => {
  const s = cleanMultiline(v);
  return s === "" ? undefined : s;
};

const hasHtmlTag = (s: string) => /<[^>]*>/.test(s);
const hasRawMarkdown = (s: string) => /(\*\*|__|```|^#{1,6}\s)/m.test(s);

/** Texto plano en una línea: recorta, colapsa espacios y rechaza HTML. */
export const cleanString = (min: number, max: number, label = "Campo") =>
  z.preprocess(
    collapseSpaces,
    z
      .string({ error: `${label} requerido` })
      .min(min, `${label} debe tener al menos ${min} caracteres`)
      .max(max, `${label} no puede superar ${max} caracteres`)
      .refine((s) => !hasHtmlTag(s), `${label} no puede contener HTML`),
  );

/** Texto plano opcional con largo mínimo al estar presente (`""` -> `undefined`). */
export const optionalCleanString = (min: number, max: number, label = "Campo") =>
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .min(min, `${label} debe tener al menos ${min} caracteres`)
      .max(max, `${label} no puede superar ${max} caracteres`)
      .refine((s) => !hasHtmlTag(s), `${label} no puede contener HTML`)
      .optional(),
  );

/** Texto multilínea opcional (`""` -> `undefined`), sin HTML. */
export const optionalMultilineString = (max: number, label = "Campo") =>
  z.preprocess(
    emptyMultilineToUndefined,
    z
      .string()
      .max(max, `${label} no puede superar ${max} caracteres`)
      .refine((s) => !hasHtmlTag(s), `${label} no puede contener HTML`)
      .optional(),
  );

/** UUID v4 estricto para parámetros `:id`. */
export const uuidV4Schema = z.uuid({ version: "v4", error: "Identificador UUID v4 inválido" });

/** Paginación estándar (`page >= 1`, `limit <= 50`). */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1, "Página debe ser >= 1").default(1),
  limit: z.coerce.number().int().min(1, "Límite mínimo 1").max(50, "Límite máximo 50").default(25),
});

/** Nombre de persona (`\p{L}`, espacios, `-`, `'`, `’`; 3..80 chars). */
export const fullNameSchema = cleanString(3, 80, "Nombre completo").refine(
  (s) => /^[\p{L}\s\-’']+$/u.test(s),
  "El nombre solo puede contener letras, espacios, guion y apóstrofe",
);

export const emailSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z
    .string({ error: "Correo requerido" })
    .min(5, "Correo debe tener al menos 5 caracteres")
    .max(120, "Correo no puede superar 120 caracteres")
    .pipe(z.email({ error: "Formato de correo inválido" })),
);

export const phoneSchema = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .min(8, "Teléfono debe tener entre 8 y 15 dígitos")
    .max(15, "Teléfono debe tener entre 8 y 15 dígitos")
    .regex(/^\+?\d+$/, "Teléfono solo puede contener dígitos y '+' inicial opcional")
    .optional(),
);

export const rutSchema = z.preprocess(
  (v) => (typeof v === "string" ? v : ""),
  z.string().transform((raw, ctx) => {
    const normalized = normalizeRut(raw);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "RUT chileno inválido (ej. 12.345.678-5)" });
      return z.NEVER;
    }
    return normalized;
  }),
);

export const cleanNoHtmlNoMarkdown = (s: string) => !hasHtmlTag(s) && !hasRawMarkdown(s);
