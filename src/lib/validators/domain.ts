import { z } from "zod";
import { todayInSantiago } from "@/lib/timezone";
import {
  cleanNoHtmlNoMarkdown,
  cleanString,
  emptyToUndefined,
  fullNameSchema,
  optionalCleanString,
  optionalMultilineString,
  uuidV4Schema,
} from "./common";

// Esquemas compartidos de clases, alumnos, unidades, lecciones y asistencia (docs/03-seguridad.md §7).

export const relationshipSchema = optionalCleanString(2, 30, "Parentesco");
export const classNameSchema = cleanString(2, 60, "Nombre de clase");
export const ageRangeSchema = optionalCleanString(2, 80, "Rango de edad");

/** Fecha ISO `YYYY-MM-DD` válida en calendario real. */
export const isoDateSchema = z
  .string({ error: "Fecha requerida" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha debe ser YYYY-MM-DD")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, "Fecha de calendario inválida");

function santiagoDateBounds() {
  const today = todayInSantiago();
  const [y, m, d] = today.split("-").map(Number);
  const minDate = new Date(Date.UTC(y - 25, m - 1, d)).toISOString().slice(0, 10);
  return { today, minDate };
}

/** Fecha de nacimiento opcional (`""` -> `undefined`), no futura y <= 25 años atrás (hora Chile). */
export const birthDateSchema = z.preprocess(
  emptyToUndefined,
  isoDateSchema
    .refine((s) => s <= santiagoDateBounds().today, "La fecha de nacimiento no puede ser futura")
    .refine((s) => s >= santiagoDateBounds().minDate, "La fecha de nacimiento no puede superar 25 años de antigüedad")
    .optional(),
);

export const specialCareSchema = optionalMultilineString(300, "Cuidados especiales");

export const preferencesSchema = z
  .array(cleanString(1, 30, "Preferencia"))
  .max(10, "Máximo 10 preferencias")
  .optional();

export const preferencesNotesSchema = optionalMultilineString(250, "Nota de preferencias");

export const studentSchema = z.object({
  fullName: fullNameSchema,
  classId: uuidV4Schema,
  birthDate: birthDateSchema,
  specialCare: specialCareSchema,
  preferences: preferencesSchema,
  preferencesNotes: preferencesNotesSchema,
});

export const unitTitleSchema = cleanString(3, 100, "Título de unidad");
export const lessonTitleSchema = cleanString(3, 120, "Título de lección");
export const biblePassageSchema = cleanString(3, 80, "Pasaje bíblico");

/** Resumen para padres: 1..20 párrafos limpios sin HTML/Markdown, suma total 50..2.500 chars. */
export const parentSummarySchema = z
  .array(
    cleanString(1, 2500, "Párrafo").refine(
      cleanNoHtmlNoMarkdown,
      "El resumen no puede contener HTML ni Markdown crudo",
    ),
  )
  .min(1, "Debe incluir al menos 1 párrafo")
  .max(20, "Máximo 20 párrafos")
  .refine(
    (paragraphs) => {
      const total = paragraphs.reduce((acc, p) => acc + p.length, 0);
      return total >= 50 && total <= 2500;
    },
    "El resumen total debe tener entre 50 y 2.500 caracteres",
  );

export const reinforcementQuestionsSchema = z
  .array(
    cleanString(10, 280, "Pregunta de refuerzo").refine(
      cleanNoHtmlNoMarkdown,
      "Las preguntas no pueden contener HTML ni Markdown crudo",
    ),
  )
  .min(2, "Debe incluir al menos 2 preguntas")
  .max(5, "Máximo 5 preguntas");

export const attendanceObservationSchema = optionalMultilineString(200, "Observación");

export const attendanceRecordInputSchema = z.object({
  studentId: uuidV4Schema,
  isPresent: z.boolean({ error: "Estado presente debe ser booleano" }),
  observation: attendanceObservationSchema,
});
