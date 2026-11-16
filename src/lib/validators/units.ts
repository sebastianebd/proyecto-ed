import { z } from "zod";
import { isSundayYmd } from "@/lib/timezone";
import { uuidV4Schema } from "./common";
import {
  biblePassageSchema,
  isoDateSchema,
  lessonTitleSchema,
  parentSummarySchema,
  reinforcementQuestionsSchema,
  unitTitleSchema,
} from "./domain";

export const sundayIsoDateSchema = isoDateSchema.refine(
  isSundayYmd,
  "La fecha de clase debe corresponder estrictamente a un domingo",
);

export const pdfFileNameSchema = z
  .string({ error: "Nombre de archivo requerido" })
  .trim()
  .min(5, "Nombre de archivo inválido")
  .max(120, "El nombre del archivo no puede superar 120 caracteres")
  .refine((s) => s.toLowerCase().endsWith(".pdf"), "El archivo debe tener extensión .pdf");

export const uploadUrlRequestSchema = z.union([
  z.object({
    unitId: uuidV4Schema,
    fileName: pdfFileNameSchema,
  }),
  z.object({
    classId: uuidV4Schema,
    orderNumber: z.coerce.number().int().min(1, "Número de unidad debe ser >= 1").max(100),
    title: unitTitleSchema,
    fileName: pdfFileNameSchema,
  }),
]);

export const processPdfSchema = z.object({
  storageKey: z
    .string({ error: "storageKey requerido" })
    .trim()
    .min(10, "storageKey inválido")
    .max(300, "storageKey demasiado largo")
    .refine(
      (k) => !k.includes("..") && /^units\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i.test(k),
      "Ruta de almacenamiento inválida",
    ),
});

export const adminGenerateLessonSchema = z.object({
  rawText: z
    .string({ error: "Texto de la lección requerido" })
    .trim()
    .min(30, "Ingresa al menos 30 caracteres de contenido para generar con IA")
    .max(40000, "El texto por lección no puede superar 40.000 caracteres"),
  hintTitle: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v),
    z.string().max(120).optional(),
  ),
});

export const lessonScheduleStatusSchema = z.enum(["SCHEDULED", "PAUSED", "FORCE_UNLOCKED", "FORCE_LOCKED"]);

export const adminUpdateLessonSchema = z.object({
  title: lessonTitleSchema.optional(),
  biblePassage: biblePassageSchema.optional(),
  parentSummary: parentSummarySchema.optional(),
  reinforcementQuestions: reinforcementQuestionsSchema.optional(),
  classSundayDate: sundayIsoDateSchema.optional(),
  scheduleStatus: lessonScheduleStatusSchema.optional(),
});

export const adminUpdateUnitSchema = z.object({
  title: unitTitleSchema.optional(),
  orderNumber: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "FINISHED"]).optional(),
  startSundayDate: sundayIsoDateSchema.optional(),
});

export const unitScheduleShiftSchema = z.object({
  fromLessonNumber: z.coerce.number().int().min(1).max(14).optional(),
});

export const parentCompleteLessonSchema = z.object({
  studentIds: z
    .array(uuidV4Schema)
    .min(1, "Debes seleccionar al menos un alumno")
    .max(20, "Máximo 20 alumnos por solicitud"),
});
